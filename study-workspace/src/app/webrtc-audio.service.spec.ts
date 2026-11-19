import { vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  getDatabase: vi.fn(() => ({})),
  onChildAdded: vi.fn(),
  onDisconnect: vi.fn(),
  onValue: vi.fn(),
  push: vi.fn(),
  ref: vi.fn(),
  remove: vi.fn(),
  set: vi.fn(),
}));

vi.mock('firebase/database', () => databaseMocks);

import {
  calculateProximityGain,
  getNearbyAudioParticipants,
  WebRtcAudioService,
} from './webrtc-audio.service';
import type { WorkspaceParticipant } from './firebase-presence.service';

describe('WebRtcAudioService', () => {
  let originalMediaDevices: PropertyDescriptor | undefined;
  let originalAudioContext: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    originalAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
    if (originalAudioContext) {
      Object.defineProperty(window, 'AudioContext', originalAudioContext);
    } else {
      Reflect.deleteProperty(window, 'AudioContext');
    }
  });

  it('requests audio only and stops microphone tracks when disabled', async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const service = new WebRtcAudioService();

    await service.enableMicrophone();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(service.micEnabled()).toBe(true);

    await service.disableMicrophone();

    expect(track.stop).toHaveBeenCalledOnce();
    expect(service.micEnabled()).toBe(false);
  });

  it('reports microphone permission denial and leaves the mic disabled', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          throw new DOMException('Permission denied', 'NotAllowedError');
        }),
      },
    });
    const service = new WebRtcAudioService();

    await expect(service.enableMicrophone()).rejects.toThrow('Permission denied');

    expect(service.micEnabled()).toBe(false);
    expect(service.error()).toContain('chưa cấp quyền microphone');
  });

  it('uses distance-based gain with full, reduced, and muted ranges', () => {
    expect(calculateProximityGain(20)).toBe(1);
    expect(calculateProximityGain(32.5)).toBe(0.5);
    expect(calculateProximityGain(40)).toBe(0);
    expect(calculateProximityGain(55)).toBe(0);
  });

  it('selects every nearby participant with an enabled microphone', () => {
    const participants: WorkspaceParticipant[] = [
      { uid: 'self', displayName: 'Me', initials: 'M', x: 50, y: 50, audioEnabled: true },
      { uid: 'near-a', displayName: 'A', initials: 'A', x: 60, y: 50, audioEnabled: true },
      { uid: 'near-b', displayName: 'B', initials: 'B', x: 50, y: 70, audioEnabled: true },
      { uid: 'far', displayName: 'C', initials: 'C', x: 95, y: 50, audioEnabled: true },
      { uid: 'muted', displayName: 'D', initials: 'D', x: 52, y: 50, audioEnabled: false },
    ];

    expect(
      getNearbyAudioParticipants('self', { x: 50, y: 50 }, participants).map(({ uid }) => uid),
    ).toEqual(['near-a', 'near-b']);
  });
});

class FakeAudioContext {
  readonly currentTime = 0;
  readonly destination = {};
  readonly state = 'running';
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}
