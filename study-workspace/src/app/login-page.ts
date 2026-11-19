import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseAuthService, formatFirebaseAuthError } from './firebase-auth.service';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  protected readonly auth = inject(FirebaseAuthService);
  private readonly router = inject(Router);

  displayName = '';
  isBusy = false;
  errorMessage: string | null = null;

  async enterWorkspace(): Promise<void> {
    const name = this.displayName.trim();
    if (!name) {
      return;
    }

    await this.authenticate(() => this.auth.signInAsGuest(name));
  }

  async signInWithGoogle(): Promise<void> {
    await this.authenticate(() => this.auth.signInWithGoogle());
  }

  private async authenticate(signIn: () => Promise<void>): Promise<void> {
    if (this.isBusy) {
      return;
    }

    this.errorMessage = null;
    this.isBusy = true;

    try {
      await signIn();
      await this.router.navigateByUrl('/workspace');
    } catch (error) {
      this.errorMessage = formatFirebaseAuthError(error);
    } finally {
      this.isBusy = false;
    }
  }
}
