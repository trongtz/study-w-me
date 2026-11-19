import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { FirebaseAuthService, WorkspaceUser } from './firebase-auth.service';
import { FirebasePresenceService } from './firebase-presence.service';
import { WebRtcAudioService } from './webrtc-audio.service';
import { routes } from './app.routes';

describe('App', () => {
  let currentUser: ReturnType<typeof signal<WorkspaceUser | null>>;

  beforeEach(async () => {
    currentUser = signal<WorkspaceUser | null>(null);

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        {
          provide: FirebaseAuthService,
          useValue: {
            currentUser,
            authError: signal<string | null>(null),
            waitForInitialState: vi.fn(async () => {}),
            signInAsGuest: vi.fn(async () => {}),
            signInWithGoogle: vi.fn(async () => {}),
            signOut: vi.fn(async () => {}),
          },
        },
        {
          provide: FirebasePresenceService,
          useValue: {
            participants: signal([]),
            position: signal({ x: 49, y: 55 }),
            error: signal<string | null>(null),
            connected: signal(false),
            start: vi.fn(),
            moveTo: vi.fn(),
            stop: vi.fn(async () => true),
          },
        },
        {
          provide: WebRtcAudioService,
          useValue: {
            micEnabled: signal(false),
            busy: signal(false),
            status: signal('off'),
            error: signal<string | null>(null),
            playbackBlocked: signal(false),
            syncParticipants: vi.fn(),
            disconnect: vi.fn(async () => {}),
            enableMicrophone: vi.fn(async () => {}),
            disableMicrophone: vi.fn(async () => {}),
            resumePlayback: vi.fn(async () => {}),
          },
        },
      ],
    }).compileComponents();
  });

  it('redirects unauthenticated visits to the workspace to login', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/workspace');

    expect(router.url).toBe('/login');
  });

  it('allows an authenticated user to open the shared workspace', async () => {
    currentUser.set({
      uid: 'demo-user',
      displayName: 'Minh Anh',
      initials: 'MA',
      isAnonymous: true,
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/workspace');

    expect(router.url).toBe('/workspace');
  });
});
