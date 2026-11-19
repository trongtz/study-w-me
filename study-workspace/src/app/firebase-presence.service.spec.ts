import { vi } from 'vitest';

const callbacks = vi.hoisted(() => ({
  values: {} as Record<string, (snapshot: { val: () => unknown }) => void>,
}));

const databaseMocks = vi.hoisted(() => ({
  getDatabase: vi.fn(() => ({})),
  ref: vi.fn((_database: unknown, path: string) => ({ path })),
  onValue: vi.fn(),
  onDisconnect: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('firebase/database', () => databaseMocks);

import { FirebasePresenceService } from './firebase-presence.service';
import type { WorkspaceUser } from './firebase-auth.service';

describe('FirebasePresenceService', () => {
  const user: WorkspaceUser = {
    uid: 'user-123',
    displayName: 'Minh Anh',
    initials: 'MA',
    isAnonymous: false,
  };
  let service: FirebasePresenceService;
  let removeOnDisconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    callbacks.values = {};
    removeOnDisconnect = vi.fn(async () => {});

    databaseMocks.onValue.mockImplementation((...args: unknown[]) => {
      const reference = args[0] as { path: string };
      const callback = args[1] as (snapshot: { val: () => unknown }) => void;
      callbacks.values[reference.path] = callback;
      return vi.fn();
    });
    databaseMocks.onDisconnect.mockReturnValue({ remove: removeOnDisconnect });
    databaseMocks.set.mockImplementation(async () => {});
    databaseMocks.update.mockImplementation(async () => {});
    databaseMocks.remove.mockImplementation(async () => {});

    service = new FirebasePresenceService();
  });

  it('registers the authenticated user and syncs position in the shared workspace', async () => {
    service.start(user);
    callbacks.values['.info/connected']?.({ val: () => true });

    await vi.waitFor(() => {
      expect(databaseMocks.set).toHaveBeenCalledWith(
        { path: 'workspaces/main/presence/user-123' },
        expect.objectContaining({
          uid: 'user-123',
          displayName: 'Minh Anh',
        }),
      );
    });
    expect(removeOnDisconnect).toHaveBeenCalledOnce();

    const remotePresence = {
      'user-123': {
        uid: 'user-123',
        displayName: 'Minh Anh',
        audioEnabled: false,
        x: 20,
        y: 30,
      },
      'friend-456': {
        uid: 'friend-456',
        displayName: 'Linh Tran',
        audioEnabled: true,
        x: 50,
        y: 60,
      },
      invalid: {
        uid: 'not-the-key',
        displayName: 'Ignored',
        audioEnabled: false,
        x: 1,
        y: 1,
      },
    };
    callbacks.values['workspaces/main/presence']?.({ val: () => remotePresence });
    expect(service.participants()).toEqual([
      {
        uid: 'user-123',
        displayName: 'Minh Anh',
        initials: 'MA',
        audioEnabled: false,
        x: 20,
        y: 30,
      },
      {
        uid: 'friend-456',
        displayName: 'Linh Tran',
        initials: 'LT',
        audioEnabled: true,
        x: 50,
        y: 60,
      },
    ]);

    await service.setAudioEnabled(true);
    expect(databaseMocks.update).toHaveBeenLastCalledWith(
      { path: 'workspaces/main/presence/user-123' },
      { audioEnabled: true },
    );

    service.moveTo({ x: 65, y: 40 });
    await vi.waitFor(() => {
      expect(databaseMocks.update).toHaveBeenLastCalledWith(
        { path: 'workspaces/main/presence/user-123' },
        { x: 65, y: 40 },
      );
    });

    expect(await service.stop()).toBe(true);
    expect(databaseMocks.remove).toHaveBeenCalledWith({
      path: 'workspaces/main/presence/user-123',
    });
  });

  it('surfaces RTDB write errors instead of showing an online presence', async () => {
    databaseMocks.set.mockRejectedValue(new Error('Permission denied'));
    service.start(user);
    callbacks.values['.info/connected']?.({ val: () => true });

    await vi.waitFor(() => {
      expect(service.error()).toContain('Permission denied');
    });
    expect(service.participants()).toEqual([]);
    expect(await service.stop()).toBe(true);
    expect(databaseMocks.remove).not.toHaveBeenCalled();
  });
});
