import { AfterViewChecked, Component, effect, ElementRef, HostListener, inject, OnDestroy, OnInit, QueryList, signal, ViewChildren } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FirebaseAuthService, formatFirebaseAuthError } from './firebase-auth.service';
import { FirebasePresenceService } from './firebase-presence.service';
import { WebRtcAudioService } from './webrtc-audio.service';

@Component({
  selector: 'app-workspace-page',
  imports: [RouterLink],
  templateUrl: './workspace-page.html',
  styleUrl: './workspace-page.css',
})
export class WorkspacePage implements OnInit, OnDestroy, AfterViewChecked {
  readonly auth = inject(FirebaseAuthService);
  readonly presence = inject(FirebasePresenceService);
  readonly audio = inject(WebRtcAudioService);
  private readonly router = inject(Router);

  readonly leaveError = signal<string | null>(null);
  readonly micActionError = signal<string | null>(null);
  readonly cameraEnabled = this.audio.cameraEnabled;
  readonly cameraActionError = signal<string | null>(null);
  @ViewChildren('videoElement') private videoElements!: QueryList<ElementRef<HTMLVideoElement>>;
  private readonly syncAudioPair = effect(() => {
    this.audio.syncParticipants(
      this.auth.currentUser(),
      this.presence.participants(),
      this.presence.position(),
    );
  });

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user) {
      this.presence.start(user);
    }
  }

  ngOnDestroy(): void {
    void this.audio.disconnect();
    void this.presence.stop();
  }

  ngAfterViewChecked(): void {
    for (const element of this.videoElements?.toArray() ?? []) {
      const video = element.nativeElement;
      const uid = video.dataset['remoteUid'];
      const stream = uid
        ? this.audio.remoteVideos().find((item) => item.uid === uid)?.stream ?? null
        : this.audio.localVideo();
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      // A remote video can be attached before its first frame arrives. If the
      // browser paused playback during that gap, retry when Angular checks the
      // view again instead of leaving a permanently blank tile.
      if (stream && video.paused) void video.play().catch(() => undefined);
    }
  }

  participantName(uid: string): string {
    return this.presence.participants().find((participant) => participant.uid === uid)?.displayName ?? 'Participant';
  }

  async toggleMic(): Promise<void> {
    this.micActionError.set(null);
    try {
      if (this.audio.micEnabled()) {
        await this.audio.disableMicrophone();
        await this.presence.setAudioEnabled(false);
        return;
      }

      await this.audio.enableMicrophone();
      try {
        await this.presence.setAudioEnabled(true);
      } catch (error) {
        await this.audio.disableMicrophone();
        throw error;
      }
    } catch (error) {
      this.micActionError.set(
        error instanceof Error ? error.message : formatFirebaseAuthError(error),
      );
    }
  }

  async toggleCamera(): Promise<void> {
    this.cameraActionError.set(null);
    try {
      if (this.cameraEnabled()) {
        await this.audio.disableCamera();
        await this.presence.setVideoEnabled(false);
      } else {
        await this.audio.enableCamera();
        try {
          await this.presence.setVideoEnabled(true);
        } catch (error) {
          await this.audio.disableCamera();
          throw error;
        }
      }
    } catch (error) {
      this.cameraActionError.set(error instanceof Error ? error.message : formatFirebaseAuthError(error));
    }
  }

  async leaveWorkspace(): Promise<void> {
    this.leaveError.set(null);

    try {
      await this.audio.disableCamera();
      await this.audio.disableMicrophone();
      await this.audio.disconnect();
      const presenceStopped = await this.presence.stop();
      if (!presenceStopped) {
        this.leaveError.set(
          this.presence.error() ?? 'Could not leave the workspace safely. Please try again.',
        );
        return;
      }

      await this.auth.signOut();
      await this.router.navigateByUrl('/login');
    } catch (error) {
      this.leaveError.set(error instanceof Error ? error.message : formatFirebaseAuthError(error));
    }
  }

  moveToMapPoint(event: MouseEvent): void {
    const canvas = event.currentTarget;
    if (!(canvas instanceof HTMLElement)) return;

    const bounds = canvas.getBoundingClientRect();
    const horizontalRatio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const verticalRatio = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    this.presence.moveTo({
      x: 8 + horizontalRatio * 84,
      y: 14 + verticalRatio * 70,
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName))
    ) {
      return;
    }

    const key = event.key.toLowerCase();
    const movements: Record<string, { x: number; y: number }> = {
      arrowup: { x: 0, y: -3 },
      w: { x: 0, y: -3 },
      arrowdown: { x: 0, y: 3 },
      s: { x: 0, y: 3 },
      arrowleft: { x: -3, y: 0 },
      a: { x: -3, y: 0 },
      arrowright: { x: 3, y: 0 },
      d: { x: 3, y: 0 },
    };
    const movement = movements[key];

    if (!movement) {
      return;
    }

    event.preventDefault();
    const position = this.presence.position();
    this.presence.moveTo({
      x: Math.min(92, Math.max(8, position.x + movement.x)),
      y: Math.min(84, Math.max(14, position.y + movement.y)),
    });
  }
}
