import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { LoginPage } from './login-page';
import { MockSessionService } from './mock-session.service';
import { WorkspacePage } from './workspace-page';

const requireDemoSession: CanActivateFn = () => {
  const session = inject(MockSessionService);
  const router = inject(Router);

  return session.currentUser() ? true : router.createUrlTree(['/login']);
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginPage },
  { path: 'workspace', component: WorkspacePage, canActivate: [requireDemoSession] },
  { path: '**', redirectTo: 'login' },
];
