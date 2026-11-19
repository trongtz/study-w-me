import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { FirebaseAuthService, WorkspaceUser } from './firebase-auth.service';
import {
  FirebasePresenceService,
  WorkspaceParticipant,
  WorkspacePosition,
} from './firebase-presence.service';
import { WorkspacePage } from './workspace-page';
import { WebRtcAudioService } from './webrtc-audio.service';

describe('WorkspacePage', () => {
  let user: WorkspaceUser;
  let authMock: ReturnType<typeof createAuthMock>;
  let presenceMock: ReturnType<typeof createPresenceMock>;
  let audioMock: ReturnType<typeof createAudioMock>;

  beforeEach(async () => {
    user = {
      uid: 'demo-user',
      displayName: 'Minh Anh',
      initials: 'MA',
      isAnonymous: true,
    };
    authMock = createAuthMock(user);
    presenceMock = createPresenceMock();
    audioMock = createAudioMock();

    await TestBed.configureTestingModule({
      imports: [WorkspacePage],
      providers: [
        provideRouter([]),
        { provide: FirebaseAuthService, useValue: authMock },
        { provide: FirebasePresenceService, useValue: presenceMock },
        { provide: WebRtcAudioService, useValue: audioMock },
      ],
    }).compileComponents();
  });

  it('starts presence and renders live participants and their count', () => {
    presenceMock.participants.set([
      {
        uid: 'demo-user',
        displayName: 'Minh Anh',
        initials: 'MA',
        x: 20,
        y: 20,
        audioEnabled: false,
      },
      {
        uid: 'friend-user',
        displayName: 'Linh Tran',
        initials: 'LT',
        x: 30,
        y: 40,
        audioEnabled: false,
      },
    ]);
    const fixture = TestBed.createComponent(WorkspacePage);
    fixture.detectChanges();

    expect(presenceMock.start).toHaveBeenCalledWith(user);
    expect(fixture.nativeElement.textContent).toContain('2 here');
    expect(fixture.nativeElement.textContent).toContain('Linh Tran');
    expect(fixture.nativeElement.textContent).toContain('find your spot');
  });

  it('syncs keyboard movement and keeps the avatar within the map', () => {
    const fixture = TestBed.createComponent(WorkspacePage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(presenceMock.moveTo).toHaveBeenCalledWith({ x: 52, y: 55 });

    presenceMock.position.set({ x: 92, y: 14 });
    page.handleKeydown(new KeyboardEvent('keydown', { key: 'w' }));
    expect(presenceMock.moveTo).toHaveBeenLastCalledWith({ x: 92, y: 14 });
  });

  it('requests the microphone and publishes the local audio state', async () => {
    const fixture = TestBed.createComponent(WorkspacePage);
    const page = fixture.componentInstance;

    await page.toggleMic();
    page.toggleCamera();

    expect(audioMock.enableMicrophone).toHaveBeenCalledOnce();
    expect(presenceMock.setAudioEnabled).toHaveBeenCalledWith(true);
    expect(page.cameraEnabled()).toBe(true);
  });

  it('reports microphone permission failures', async () => {
    audioMock.enableMicrophone.mockRejectedValue(new Error('Microphone permission denied'));
    const page = TestBed.createComponent(WorkspacePage).componentInstance;

    await page.toggleMic();

    expect(page.micActionError()).toBe('Microphone permission denied');
  });

  it('removes presence before signing out', async () => {
    const calls: string[] = [];
    presenceMock.stop.mockImplementation(async () => {
      calls.push('presence');
      return true;
    });
    authMock.signOut.mockImplementation(async () => {
      calls.push('signOut');
    });
    const page = TestBed.createComponent(WorkspacePage).componentInstance;

    await page.leaveWorkspace();

    expect(calls).toEqual(['presence', 'signOut']);
  });

  it('keeps the session active when presence cannot be removed', async () => {
    presenceMock.error.set('RTDB denied the removal');
    presenceMock.stop.mockResolvedValue(false);
    const page = TestBed.createComponent(WorkspacePage).componentInstance;

    await page.leaveWorkspace();

    expect(authMock.signOut).not.toHaveBeenCalled();
    expect(page.leaveError()).toBe('RTDB denied the removal');
  });
});

function createAuthMock(user: WorkspaceUser) {
  return {
    currentUser: signal(user),
    authError: signal<string | null>(null),
    signOut: vi.fn(async () => {}),
  };
}

function createPresenceMock() {
  return {
    participants: signal<WorkspaceParticipant[]>([]),
    position: signal<WorkspacePosition>({ x: 49, y: 55 }),
    error: signal<string | null>(null),
    connected: signal(false),
    start: vi.fn((_user: WorkspaceUser) => {}),
    setAudioEnabled: vi.fn(async (_enabled: boolean) => {}),
    moveTo: vi.fn((_position: WorkspacePosition) => {}),
    stop: vi.fn(async () => true),
  };
}

function createAudioMock() {
  return {
    micEnabled: signal(false),
    busy: signal(false),
    status: signal<'off' | 'waiting' | 'connecting' | 'connected' | 'failed'>('off'),
    error: signal<string | null>(null),
    playbackBlocked: signal(false),
    syncParticipants: vi.fn(
      (
        _user: WorkspaceUser | null,
        _participants: WorkspaceParticipant[],
        _position: WorkspacePosition,
      ) => {},
    ),
    disconnect: vi.fn(async () => {}),
    enableMicrophone: vi.fn(async () => {}),
    disableMicrophone: vi.fn(async () => {}),
    resumePlayback: vi.fn(async () => {}),
  };
}
