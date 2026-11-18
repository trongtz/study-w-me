import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MockSessionService } from './mock-session.service';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  protected readonly session = inject(MockSessionService);
  private readonly router = inject(Router);

  displayName = '';

  enterWorkspace(): void {
    const name = this.displayName.trim();
    if (!name) {
      return;
    }

    this.session.signIn(name);
    void this.router.navigateByUrl('/workspace');
  }
}
