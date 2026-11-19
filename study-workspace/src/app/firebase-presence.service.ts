import { Injectable, signal } from '@angular/core';
import { getDatabase, onDisconnect, onValue, ref, remove, set, update } from 'firebase/database';
import type { DatabaseReference, Unsubscribe } from 'firebase/database';
import { environment } from '../environments/environment';
import { firebaseApp } from './firebase-app';
import type { WorkspaceUser } from './firebase-auth.service';

export interface WorkspacePosition {
  x: number;
  y: number;
}

export interface WorkspaceParticipant extends WorkspacePosition {
  uid: string;
  displayName: string;
  initials: string;
  audioEnabled: boolean;
  videoEnabled?: boolean;
}

interface PresenceRecord extends WorkspacePosition {
  uid: string;
  displayName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class FirebasePresenceService {
  private readonly database = getDatabase(firebaseApp, environment.firebase.databaseURL);
  private participantsSubscription: Unsubscribe | null = null;
  private connectionSubscription: Unsubscribe | null = null;
  private ownPresenceRef: DatabaseReference | null = null;
  private user: WorkspaceUser | null = null;
  private registrationPromise: Promise<void> | null = null;
  private connectionAttempt = 0;
  private hasPresenceRecord = false;
  private audioEnabled = false;
  private videoEnabled = false;
  private registered = false;
  private stopping = false;

  readonly participants = signal<WorkspaceParticipant[]>([]);
  readonly position = signal<WorkspacePosition>({ x: 49, y: 55 });
  readonly error = signal<string | null>(null);
  readonly connected = signal(false);

  start(user: WorkspaceUser): void {
    this.clearListeners();
    this.user = user;
    this.stopping = false;
    this.hasPresenceRecord = false;
    this.audioEnabled = false;
    this.videoEnabled = false;
    this.registered = false;
    this.error.set(null);
    this.participants.set([]);
    this.position.set(initialPosition(user.uid));

    const presencePath = 'workspaces/main/presence';
    const presenceRef = ref(this.database, presencePath);
    this.ownPresenceRef = ref(this.database, `${presencePath}/${user.uid}`);

    this.participantsSubscription = onValue(
      presenceRef,
      (snapshot) => this.participants.set(parseParticipants(snapshot.val())),
      (error) => this.setError(error),
    );

    this.connectionSubscription = onValue(
      ref(this.database, '.info/connected'),
      (snapshot) => {
        const isConnected = snapshot.val() === true;
        this.connected.set(isConnected);
        this.connectionAttempt += 1;
        this.registered = false;
        if (!isConnected) {
          this.hasPresenceRecord = false;
          return;
        }
        if (this.stopping) {
          return;
        }

        const attempt = this.connectionAttempt;
        this.registrationPromise = this.registerPresence(attempt);
      },
      (error) => this.setError(error),
    );
  }

  moveTo(position: WorkspacePosition): void {
    if (this.stopping) {
      return;
    }

    this.position.set(position);
    if (!this.hasPresenceRecord || !this.connected() || !this.ownPresenceRef) {
      return;
    }

    void update(this.ownPresenceRef, position).catch((error: unknown) => this.setError(error));
  }

  async setAudioEnabled(enabled: boolean): Promise<void> {
    const previousAudioEnabled = this.audioEnabled;
    this.audioEnabled = enabled;
    const pendingRegistration = this.registrationPromise;
    if (pendingRegistration) {
      await pendingRegistration;
    }

    if (!this.hasPresenceRecord || !this.connected() || !this.ownPresenceRef) {
      throw new Error('Realtime Database is not ready to update your microphone status.');
    }

    try {
      await update(this.ownPresenceRef, { audioEnabled: enabled });
      this.error.set(null);
    } catch (error) {
      this.audioEnabled = enabled ? false : previousAudioEnabled;
      this.setError(error);
      throw error;
    }
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    const previous = this.videoEnabled;
    this.videoEnabled = enabled;
    const pendingRegistration = this.registrationPromise;
    if (pendingRegistration) await pendingRegistration;
    if (!this.hasPresenceRecord || !this.connected() || !this.ownPresenceRef) {
      throw new Error('Realtime Database is not ready to update your camera status.');
    }
    try {
      await update(this.ownPresenceRef, { videoEnabled: enabled });
      this.error.set(null);
    } catch (error) {
      this.videoEnabled = enabled ? false : previous;
      this.setError(error);
      throw error;
    }
  }

  async stop(): Promise<boolean> {
    this.stopping = true;
    const pendingRegistration = this.registrationPromise;
    if (pendingRegistration) {
      await pendingRegistration;
    }

    if (this.hasPresenceRecord && this.connected() && this.ownPresenceRef) {
      try {
        await remove(this.ownPresenceRef);
      } catch (error) {
        this.stopping = false;
        this.setError(error);
        return false;
      }
    }

    this.clearListeners();
    this.ownPresenceRef = null;
    this.user = null;
    this.registrationPromise = null;
    this.hasPresenceRecord = false;
    this.registered = false;
    this.connected.set(false);
    this.participants.set([]);
    return true;
  }

  private async registerPresence(attempt: number): Promise<void> {
    const user = this.user;
    const ownPresenceRef = this.ownPresenceRef;
    if (!user || !ownPresenceRef) {
      return;
    }

    let recordWritten = false;
    try {
      await onDisconnect(ownPresenceRef).remove();
      if (attempt !== this.connectionAttempt || !this.connected() || this.stopping) {
        return;
      }

      const position = this.position();
      await set(ownPresenceRef, {
        uid: user.uid,
        displayName: user.displayName,
        audioEnabled: this.audioEnabled,
        videoEnabled: this.videoEnabled,
        ...position,
      } satisfies PresenceRecord);
      recordWritten = true;
      this.hasPresenceRecord = true;

      if (attempt !== this.connectionAttempt || !this.connected() || this.stopping) {
        return;
      }

      this.registered = true;
      await update(ownPresenceRef, this.position());
      this.error.set(null);
    } catch (error) {
      if (!recordWritten) {
        this.hasPresenceRecord = false;
      }
      this.registered = false;
      this.setError(error);
    }
  }

  private clearListeners(): void {
    this.participantsSubscription?.();
    this.connectionSubscription?.();
    this.participantsSubscription = null;
    this.connectionSubscription = null;
  }

  private setError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.error.set(`Could not sync the workspace with Realtime Database: ${message}`);
  }
}

function initialPosition(uid: string): WorkspacePosition {
  let hash = 0;
  for (const character of uid) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return {
    x: 10 + (hash % 80),
    y: 16 + (Math.floor(hash / 80) % 68),
  };
}

function parseParticipants(value: unknown): WorkspaceParticipant[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([uid, candidate]) => {
    if (!isPresenceRecord(candidate) || candidate.uid !== uid) {
      return [];
    }

    return [
      {
        ...candidate,
        videoEnabled: candidate.videoEnabled === true,
        initials: getInitials(candidate.displayName),
      },
    ];
  });
}

function isPresenceRecord(value: unknown): value is PresenceRecord {
  return (
    isRecord(value) &&
    typeof value['uid'] === 'string' &&
    typeof value['displayName'] === 'string' &&
    typeof value['audioEnabled'] === 'boolean' &&
    (value['videoEnabled'] === undefined || typeof value['videoEnabled'] === 'boolean') &&
    typeof value['x'] === 'number' &&
    typeof value['y'] === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getInitials(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return initials || 'HV';
}
