import { Injectable, signal } from '@angular/core';

export interface DemoUser {
  displayName: string;
  initials: string;
}

const SESSION_KEY = 'study-workspace-demo-name';

@Injectable({ providedIn: 'root' })
export class MockSessionService {
  readonly currentUser = signal<DemoUser | null>(this.readSession());

  signIn(displayName: string): void {
    const name = displayName.trim();
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
    const user = { displayName: name, initials: initials || 'ME' };

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_KEY, name);
    }

    this.currentUser.set(user);
  }

  signOut(): void {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SESSION_KEY);
    }

    this.currentUser.set(null);
  }

  private readSession(): DemoUser | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const displayName = window.sessionStorage.getItem(SESSION_KEY)?.trim();
    if (!displayName) {
      return null;
    }

    const initials = displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');

    return { displayName, initials: initials || 'ME' };
  }
}
