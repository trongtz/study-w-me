import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { FirebaseAuthService, WorkspaceUser } from './firebase-auth.service';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let authMock: ReturnType<typeof createAuthMock>;

  beforeEach(async () => {
    authMock = createAuthMock();

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([]),
        { provide: FirebaseAuthService, useValue: authMock },
      ],
    }).compileComponents();
  });

  it('signs in as an anonymous user with the trimmed display name', async () => {
    const page = TestBed.createComponent(LoginPage).componentInstance;
    page.displayName = '  Minh Anh  ';

    await page.enterWorkspace();

    expect(authMock.signInAsGuest).toHaveBeenCalledWith('Minh Anh');
  });

  it('uses the Google sign-in method', async () => {
    const page = TestBed.createComponent(LoginPage).componentInstance;

    await page.signInWithGoogle();

    expect(authMock.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it('shows Firebase sign-in failures to the user', async () => {
    authMock.signInWithGoogle.mockRejectedValue(new Error('Popup was blocked'));
    const page = TestBed.createComponent(LoginPage).componentInstance;

    await page.signInWithGoogle();

    expect(page.errorMessage).toContain('Popup was blocked');
  });
});

function createAuthMock() {
  return {
    currentUser: signal<WorkspaceUser | null>(null),
    authError: signal<string | null>(null),
    signInAsGuest: vi.fn(async (_displayName: string) => {}),
    signInWithGoogle: vi.fn(async () => {}),
  };
}
