import { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';
import { Injectable, signal } from '@angular/core';
import { firebaseApp } from './firebase-app';

export interface WorkspaceUser {
  uid: string;
  displayName: string;
  initials: string;
  isAnonymous: boolean;
}

@Injectable({ providedIn: 'root' })
export class FirebaseAuthService {
  private readonly auth: Auth;
  private readonly initialState: Promise<void>;
  private resolveInitialState!: () => void;

  readonly currentUser = signal<WorkspaceUser | null>(null);
  readonly authError = signal<string | null>(null);

  constructor() {
    this.initialState = new Promise<void>((resolve) => {
      this.resolveInitialState = resolve;
    });

    this.auth = getAuth(firebaseApp);

    onAuthStateChanged(
      this.auth,
      (user) => {
        this.authError.set(null);
        this.currentUser.set(user ? toWorkspaceUser(user) : null);
        this.resolveInitialState();
      },
      (error) => {
        this.authError.set(formatFirebaseAuthError(error));
        this.currentUser.set(null);
        this.resolveInitialState();
      },
    );
  }

  waitForInitialState(): Promise<void> {
    return this.initialState;
  }

  async signInAsGuest(displayName: string): Promise<void> {
    const name = displayName.trim();
    if (!name) {
      throw new Error('Vui lòng nhập tên hiển thị.');
    }

    const credential = await signInAnonymously(this.auth);
    await updateProfile(credential.user, { displayName: name });
    this.currentUser.set(toWorkspaceUser(credential.user));
  }

  async signInWithGoogle(): Promise<void> {
    const credential = await signInWithPopup(this.auth, new GoogleAuthProvider());
    this.currentUser.set(toWorkspaceUser(credential.user));
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(this.auth);
    this.currentUser.set(null);
  }
}

export function formatFirebaseAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    const knownMessages: Record<string, string> = {
      'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được bật trong Firebase Console.',
      'auth/unauthorized-domain': 'Domain hiện tại chưa được thêm vào Firebase Authorized domains.',
      'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ đăng nhập Google. Hãy cho phép popup rồi thử lại.',
      'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.',
      'auth/network-request-failed': 'Không thể kết nối Firebase. Hãy kiểm tra mạng rồi thử lại.',
    };

    return knownMessages[error.code] ?? `Firebase Auth (${error.code}): ${error.message}`;
  }

  if (error instanceof Error) {
    return `Đăng nhập thất bại: ${error.message}`;
  }

  return `Đăng nhập thất bại: ${String(error)}`;
}

function toWorkspaceUser(user: User): WorkspaceUser {
  const displayName = user.displayName?.trim() || user.email?.split('@')[0] || 'Người học';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return {
    uid: user.uid,
    displayName,
    initials: initials || 'HV',
    isAnonymous: user.isAnonymous,
  };
}
