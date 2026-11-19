import { Injectable, signal } from '@angular/core';
import {
  getDatabase,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
} from 'firebase/database';
import type { DataSnapshot, DatabaseReference, Unsubscribe } from 'firebase/database';
import { environment } from '../environments/environment';
import { firebaseApp } from './firebase-app';
import type { WorkspaceParticipant } from './firebase-presence.service';
import type { WorkspaceUser } from './firebase-auth.service';

export type AudioStatus = 'off' | 'waiting' | 'connecting' | 'connected' | 'failed';
type CallRole = 'caller' | 'callee';
const FULL_VOLUME_DISTANCE = 25;
const MAX_CONNECTION_DISTANCE = 40;

interface Pair {
  callerUid: string;
  calleeUid: string;
  key: string;
}

interface CallSession extends Pair {
  remoteUid: string;
  role: CallRole;
  peerConnection: RTCPeerConnection;
  offerRef: DatabaseReference;
  answerRef: DatabaseReference;
  callerCandidatesRef: DatabaseReference;
  calleeCandidatesRef: DatabaseReference;
  subscriptions: Unsubscribe[];
  pendingCandidates: RTCIceCandidateInit[];
  closed: boolean;
}

interface SessionTarget {
  participant: WorkspaceParticipant;
}

interface SessionSignal {
  type: RTCSdpType;
  sdp: string;
}

@Injectable({ providedIn: 'root' })
export class WebRtcAudioService {
  private readonly database = getDatabase(firebaseApp, environment.firebase.databaseURL);
  private readonly sessions = new Map<string, CallSession>();
  private readonly remoteOutputs = new Map<string, HTMLAudioElement>();
  private readonly participants = new Map<string, WorkspaceParticipant>();
  private localUid: string | null = null;
  private localPosition = { x: 49, y: 55 };
  private reconcileQueue: Promise<void> = Promise.resolve();
  private localStream: MediaStream | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private readonly remoteStreams = new Map<string, MediaStream>();

  readonly micEnabled = signal(false);
  readonly busy = signal(false);
  readonly status = signal<AudioStatus>('off');
  readonly error = signal<string | null>(null);
  readonly playbackBlocked = signal(false);
  readonly nearbyParticipantCount = signal(0);
  readonly connectedParticipantCount = signal(0);
  readonly localVideo = signal<MediaStream | null>(null);
  readonly remoteVideos = signal<ReadonlyArray<{ uid: string; stream: MediaStream }>>([]);
  readonly cameraEnabled = signal(false);
  readonly cameraBusy = signal(false);

  async enableMicrophone(): Promise<void> {
    if (this.micEnabled()) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Trình duyệt này không hỗ trợ truy cập microphone.');
      }

      const microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const tracks = [...microphoneStream.getAudioTracks(), ...(this.localVideoTrack ? [this.localVideoTrack] : [])];
      this.localStream = new MediaStream(tracks);
      this.micEnabled.set(true);
      this.status.set('waiting');
      await this.replaceLocalTracks();
      await this.queueReconciliation();
    } catch (error) {
      this.error.set(formatAudioError(error));
      throw error;
    } finally {
      this.busy.set(false);
    }
  }

  async disableMicrophone(): Promise<void> {
    this.localStream?.getAudioTracks().forEach((track) => track.stop());
    this.localStream = this.localVideoTrack ? new MediaStream([this.localVideoTrack]) : null;
    this.micEnabled.set(false);
    await this.replaceLocalTracks();
    await this.queueReconciliation();
  }

  async enableCamera(): Promise<void> {
    if (this.cameraEnabled()) return;
    this.cameraBusy.set(true);
    this.error.set(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Trình duyệt này không hỗ trợ truy cập camera.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('Không tìm thấy camera trong thiết bị.');
      this.localVideoTrack = track;
      this.localVideo.set(new MediaStream([track]));
      this.cameraEnabled.set(true);
      await this.replaceLocalTracks();
      await this.queueReconciliation();
    } catch (error) {
      this.error.set(formatAudioError(error));
      throw error;
    } finally { this.cameraBusy.set(false); }
  }

  async disableCamera(): Promise<void> {
    this.localVideoTrack?.stop();
    this.localVideoTrack = null;
    this.localVideo.set(null);
    this.cameraEnabled.set(false);
    await this.replaceLocalTracks();
    await this.queueReconciliation();
  }

  syncParticipants(
    user: WorkspaceUser | null,
    participants: WorkspaceParticipant[],
    localPosition: { x: number; y: number },
  ): void {
    this.localUid = user?.uid ?? null;
    this.localPosition = localPosition;
    this.participants.clear();
    participants.forEach((participant) => this.participants.set(participant.uid, participant));
    this.updateRemoteGains();
    this.refreshRemoteVideos();
    void this.queueReconciliation();
  }

  async disconnect(): Promise<void> {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.localVideoTrack?.stop();
    this.localVideoTrack = null;
    this.localVideo.set(null);
    this.cameraEnabled.set(false);
    this.micEnabled.set(false);
    this.localUid = null;
    this.participants.clear();
    await this.queueReconciliation();
  }

  private async replaceLocalTracks(): Promise<void> {
    const audioTrack = this.localStream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null;
    const tracks = [audioTrack, this.localVideoTrack].filter((track): track is MediaStreamTrack => !!track);
    this.localStream = tracks.length ? new MediaStream(tracks) : null;
    await Promise.all([...this.sessions.values()].map((session) => this.replaceSessionTracks(session)));
  }

  private async replaceSessionTracks(session: CallSession): Promise<void> {
    const audioSender = session.peerConnection.getTransceivers()
      .find((item) => item.receiver.track.kind === 'audio')?.sender;
    const videoSender = session.peerConnection.getTransceivers()
      .find((item) => item.receiver.track.kind === 'video')?.sender;
    const audioTrack = this.localStream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null;
    if (audioSender) await audioSender.replaceTrack(audioTrack);
    if (videoSender) await videoSender.replaceTrack(this.localVideoTrack?.readyState === 'live' ? this.localVideoTrack : null);
  }

  async resumePlayback(): Promise<void> {
    try {
      await Promise.all([...this.remoteOutputs.values()].map((audio) => audio.play()));
      this.playbackBlocked.set(false);
    } catch (error) {
      this.error.set(formatAudioError(error));
    }
  }

  private queueReconciliation(): Promise<void> {
    this.reconcileQueue = this.reconcileQueue
      .then(() => this.reconcileSessions())
      .catch((error: unknown) => this.error.set(formatAudioError(error)));
    return this.reconcileQueue;
  }

  private async reconcileSessions(): Promise<void> {
    const peers = [...this.participants.values()].filter(
      (participant) => participant.uid !== this.localUid,
    );
    const nearbyUids = new Set(
      getNearbyAudioParticipants(this.localUid, this.localPosition, peers).map(
        (participant) => participant.uid,
      ),
    );
    const localHasMedia = this.micEnabled() || this.cameraEnabled();
    const isNearby = (participant: WorkspaceParticipant) =>
      distanceBetween(this.localPosition, participant) < MAX_CONNECTION_DISTANCE;

    for (const [uid, session] of this.sessions) {
      const participant = this.participants.get(uid);
      if (!participant || !isNearby(participant) || (!localHasMedia && !participant.audioEnabled && !participant.videoEnabled)) {
        this.sessions.delete(uid);
        await this.closeSession(session);
      }
    }

    this.updateRemoteGains();
    if (!this.localUid) {
      this.refreshStatus();
      return;
    }

    for (const participant of peers) {
      if ((!localHasMedia && !participant.audioEnabled && !participant.videoEnabled) || this.sessions.has(participant.uid)) {
        continue;
      }
      if (!isNearby(participant)) {
        continue;
      }

      const session = this.createSession({ participant });
      this.sessions.set(participant.uid, session);
      this.refreshStatus();
      try {
        await this.replaceSessionTracks(session);
        await this.startSession(session);
      } catch (error) {
        if (this.sessions.get(participant.uid) === session) {
          this.error.set(formatAudioError(error));
          this.refreshStatus();
        }
      }
    }

    this.refreshStatus();
  }

  private createSession(target: SessionTarget): CallSession {
    const localUid = this.localUid;
    if (!localUid) {
      throw new Error('Đăng nhập lại để bắt đầu cuộc gọi.');
    }

    const { pair, role } = createSessionTarget(localUid, target.participant.uid);
    const callPath = `workspaces/main/calls/${pair.callerUid}/${pair.calleeUid}`;
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    const session: CallSession = {
      ...pair,
      remoteUid: target.participant.uid,
      role,
      peerConnection,
      offerRef: ref(this.database, `${callPath}/offer`),
      answerRef: ref(this.database, `${callPath}/answer`),
      callerCandidatesRef: ref(this.database, `${callPath}/callerCandidates`),
      calleeCandidatesRef: ref(this.database, `${callPath}/calleeCandidates`),
      subscriptions: [],
      pendingCandidates: [],
      closed: false,
    };

    peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
    peerConnection.addTransceiver('video', { direction: 'sendrecv' });
    peerConnection.ontrack = (event) => {
      if (session.closed || this.sessions.get(session.remoteUid) !== session) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      if (event.track.kind === 'video') {
        // Keep the video tile independent from the audio track. A sendrecv video
        // transceiver produces a remote track even while the camera is off; that
        // track stays muted and must not create a blank tile.
        const videoStream = new MediaStream([event.track]);
        this.remoteStreams.set(session.remoteUid, videoStream);
        const refresh = () => {
          if (this.sessions.get(session.remoteUid) === session && !session.closed) {
            this.refreshRemoteVideos();
          }
        };
        event.track.addEventListener('unmute', refresh);
        event.track.addEventListener('mute', refresh);
        event.track.addEventListener('ended', refresh);
        this.refreshRemoteVideos();
      }
      if (event.track.kind === 'audio') this.attachRemoteAudio(session.remoteUid, stream);
    };
    peerConnection.onconnectionstatechange = () => {
      if (this.sessions.get(session.remoteUid) !== session) {
        return;
      }

      if (peerConnection.connectionState === 'connected') {
        this.error.set(null);
      } else if (peerConnection.connectionState === 'failed') {
        this.error.set(
          'WebRTC chưa thể kết nối. Mạng hiện tại có thể cần TURN relay; demo này mới dùng STUN.',
        );
      }
      this.refreshStatus();
    };
    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || session.closed) {
        return;
      }

      const candidatesRef =
        role === 'caller' ? session.callerCandidatesRef : session.calleeCandidatesRef;
      const candidateRef = push(candidatesRef);
      void set(candidateRef, event.candidate.toJSON()).catch((error: unknown) => {
        this.error.set(formatAudioError(error));
      });
    };

    return session;
  }

  private attachRemoteAudio(uid: string, stream: MediaStream): void {
    if (!this.sessions.has(uid)) {
      return;
    }

    const previousOutput = this.remoteOutputs.get(uid);
    if (previousOutput) {
      previousOutput.pause();
      previousOutput.srcObject = null;
    }
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    this.remoteOutputs.set(uid, audio);
    this.updateRemoteGain(uid);
    void audio.play().then(
      () => this.playbackBlocked.set(false),
      () => this.playbackBlocked.set(true),
    );
  }

  private removeRemoteAudio(uid: string): void {
    const audio = this.remoteOutputs.get(uid);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      this.remoteOutputs.delete(uid);
      this.playbackBlocked.set(false);
    }
    this.remoteStreams.delete(uid);
    this.refreshRemoteVideos();
  }

  private refreshRemoteVideos(): void {
    const visibleVideos = [...this.remoteStreams].filter(([uid, stream]) => {
      const participant = this.participants.get(uid);
      const videoTrack = stream.getVideoTracks()[0];
      return Boolean(
        participant?.videoEnabled &&
        distanceBetween(this.localPosition, participant) <= MAX_CONNECTION_DISTANCE &&
        videoTrack?.readyState === 'live' &&
        videoTrack.enabled &&
        !videoTrack.muted,
      );
    });
    this.remoteVideos.set(visibleVideos.map(([uid, stream]) => ({ uid, stream })));
  }

  private updateRemoteGains(): void {
    for (const uid of this.remoteOutputs.keys()) {
      this.updateRemoteGain(uid);
    }
  }

  private updateRemoteGain(uid: string): void {
    const audio = this.remoteOutputs.get(uid);
    const participant = this.participants.get(uid);
    if (!audio || !participant) {
      return;
    }

    audio.volume = participant.audioEnabled
      ? calculateProximityGain(distanceBetween(this.localPosition, participant))
      : 0;
  }

  private async startSession(session: CallSession): Promise<void> {
    const localCandidatesRef =
      session.role === 'caller' ? session.callerCandidatesRef : session.calleeCandidatesRef;
    const remoteCandidatesRef =
      session.role === 'caller' ? session.calleeCandidatesRef : session.callerCandidatesRef;
    const ownSignalRef = session.role === 'caller' ? session.offerRef : session.answerRef;

    await Promise.all([
      onDisconnect(ownSignalRef).remove(),
      onDisconnect(localCandidatesRef).remove(),
    ]);

    session.subscriptions.push(
      onChildAdded(
        remoteCandidatesRef,
        (snapshot) => {
          void this.receiveCandidate(session, snapshot);
        },
        (error) => this.handleSessionError(session, error),
      ),
    );

    if (session.role === 'caller') {
      session.subscriptions.push(
        onValue(
          session.answerRef,
          (snapshot) => {
            void this.receiveAnswer(session, snapshot);
          },
          (error) => this.handleSessionError(session, error),
        ),
      );

      const offer = await session.peerConnection.createOffer();
      await session.peerConnection.setLocalDescription(offer);
      if (
        this.sessions.get(session.remoteUid) === session &&
        !session.closed &&
        session.peerConnection.localDescription
      ) {
        await set(session.offerRef, session.peerConnection.localDescription.toJSON());
      }
      return;
    }

    session.subscriptions.push(
      onValue(
        session.offerRef,
        (snapshot) => {
          void this.receiveOffer(session, snapshot);
        },
        (error) => this.handleSessionError(session, error),
      ),
    );
  }

  private async receiveOffer(session: CallSession, snapshot: DataSnapshot): Promise<void> {
    const offer = parseSessionSignal(snapshot.val(), 'offer');
    if (!offer || session.closed || session.peerConnection.remoteDescription) {
      return;
    }

    try {
      await session.peerConnection.setRemoteDescription(offer);
      await this.flushCandidates(session);
      const answer = await session.peerConnection.createAnswer();
      await session.peerConnection.setLocalDescription(answer);
      if (
        this.sessions.get(session.remoteUid) === session &&
        !session.closed &&
        session.peerConnection.localDescription
      ) {
        await set(session.answerRef, session.peerConnection.localDescription.toJSON());
      }
    } catch (error) {
      this.handleSessionError(session, error);
    }
  }

  private async receiveAnswer(session: CallSession, snapshot: DataSnapshot): Promise<void> {
    const answer = parseSessionSignal(snapshot.val(), 'answer');
    if (!answer || session.closed || session.peerConnection.remoteDescription) {
      return;
    }

    try {
      await session.peerConnection.setRemoteDescription(answer);
      await this.flushCandidates(session);
    } catch (error) {
      this.handleSessionError(session, error);
    }
  }

  private async receiveCandidate(session: CallSession, snapshot: DataSnapshot): Promise<void> {
    const candidate = parseIceCandidate(snapshot.val());
    if (!candidate || session.closed) {
      return;
    }

    if (!session.peerConnection.remoteDescription) {
      session.pendingCandidates.push(candidate);
      return;
    }

    try {
      await session.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      this.handleSessionError(session, error);
    }
  }

  private async flushCandidates(session: CallSession): Promise<void> {
    const candidates = session.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      await session.peerConnection.addIceCandidate(candidate);
    }
  }

  private async closeSession(session: CallSession): Promise<void> {
    session.closed = true;
    session.subscriptions.forEach((unsubscribe) => unsubscribe());
    session.peerConnection.onicecandidate = null;
    session.peerConnection.ontrack = null;
    session.peerConnection.onconnectionstatechange = null;
    session.peerConnection.close();

    const ownedRefs =
      session.role === 'caller'
        ? [session.offerRef, session.callerCandidatesRef]
        : [session.answerRef, session.calleeCandidatesRef];
    await Promise.all(
      ownedRefs.map(async (signalRef) => {
        try {
          await onDisconnect(signalRef).cancel();
          await remove(signalRef);
        } catch (error) {
          this.error.set(formatAudioError(error));
        }
      }),
    );

    this.removeRemoteAudio(session.remoteUid);
    this.refreshStatus();
  }

  private handleSessionError(session: CallSession, error: unknown): void {
    if (this.sessions.get(session.remoteUid) === session) {
      this.error.set(formatAudioError(error));
      this.refreshStatus();
    }
  }

  private refreshStatus(): void {
    const sessions = [...this.sessions.values()];
    const nearbyUids = new Set(
      getNearbyAudioParticipants(this.localUid, this.localPosition, [
        ...this.participants.values(),
      ]).map((participant) => participant.uid),
    );
    const connectedCount = sessions.filter(
      (session) =>
        nearbyUids.has(session.remoteUid) && session.peerConnection.connectionState === 'connected',
    ).length;
    const nearbyCount = getNearbyAudioParticipants(this.localUid, this.localPosition, [
      ...this.participants.values(),
    ]).length;

    this.connectedParticipantCount.set(connectedCount);
    this.nearbyParticipantCount.set(nearbyCount);

    if (connectedCount > 0) {
      this.status.set('connected');
    } else if (!this.micEnabled()) {
      this.status.set('off');
    } else if (
      sessions.some(
        (session) =>
          nearbyUids.has(session.remoteUid) && session.peerConnection.connectionState === 'failed',
      )
    ) {
      this.status.set('failed');
    } else if (sessions.some((session) => nearbyUids.has(session.remoteUid))) {
      this.status.set('connecting');
    } else {
      this.status.set('waiting');
    }
  }
}

function createSessionTarget(localUid: string, remoteUid: string): { pair: Pair; role: CallRole } {
  const [callerUid, calleeUid] = [localUid, remoteUid].sort();
  return {
    pair: {
      callerUid,
      calleeUid,
      key: `${callerUid}_${calleeUid}`,
    },
    role: localUid === callerUid ? 'caller' : 'callee',
  };
}

function distanceBetween(
  first: { x: number; y: number },
  second: { x: number; y: number },
): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function getNearbyAudioParticipants(
  localUid: string | null,
  localPosition: { x: number; y: number },
  participants: WorkspaceParticipant[],
): WorkspaceParticipant[] {
  return participants.filter(
    (participant) =>
      participant.uid !== localUid &&
      participant.audioEnabled &&
      distanceBetween(localPosition, participant) <= MAX_CONNECTION_DISTANCE,
  );
}

export function calculateProximityGain(distance: number): number {
  if (distance <= FULL_VOLUME_DISTANCE) {
    return 1;
  }
  if (distance >= MAX_CONNECTION_DISTANCE) {
    return 0;
  }
  return (MAX_CONNECTION_DISTANCE - distance) / (MAX_CONNECTION_DISTANCE - FULL_VOLUME_DISTANCE);
}

function parseSessionSignal(
  value: unknown,
  expectedType: 'offer' | 'answer',
): SessionSignal | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    !('sdp' in value) ||
    value.type !== expectedType ||
    typeof value.sdp !== 'string'
  ) {
    return null;
  }

  return { type: expectedType, sdp: value.sdp };
}

function parseIceCandidate(value: unknown): RTCIceCandidateInit | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('candidate' in value) ||
    typeof value.candidate !== 'string'
  ) {
    return null;
  }

  const candidate: RTCIceCandidateInit = { candidate: value.candidate };
  if ('sdpMid' in value && (typeof value.sdpMid === 'string' || value.sdpMid === null)) {
    candidate.sdpMid = value.sdpMid;
  }
  if (
    'sdpMLineIndex' in value &&
    (typeof value.sdpMLineIndex === 'number' || value.sdpMLineIndex === null)
  ) {
    candidate.sdpMLineIndex = value.sdpMLineIndex;
  }
  if (
    'usernameFragment' in value &&
    (typeof value.usernameFragment === 'string' || value.usernameFragment === null)
  ) {
    candidate.usernameFragment = value.usernameFragment;
  }

  return candidate;
}

function formatAudioError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Bạn chưa cấp quyền microphone. Hãy cho phép truy cập mic trong trình duyệt rồi thử lại.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'Không tìm thấy microphone trên thiết bị này.';
    }
  }

  return error instanceof Error ? error.message : String(error);
}
