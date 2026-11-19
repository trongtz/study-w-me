import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { FirebaseAuthService } from './firebase-auth.service';
import { LoginPage } from './login-page';

const requireAuthentication: CanActivateFn = () => {
  const auth = inject(FirebaseAuthService);
  const router = inject(Router);

  return auth.waitForInitialState().then(() =>
    auth.currentUser() ? true : router.createUrlTree(['/login']),
  );
};

const redirectAuthenticatedUsers: CanActivateFn = () => {
  const auth = inject(FirebaseAuthService);
  const router = inject(Router);

  return auth.waitForInitialState().then(() =>
    auth.currentUser() ? router.createUrlTree(['/workspace']) : true,
  );
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginPage, canActivate: [redirectAuthenticatedUsers] },
  {
    path: 'workspace',
    loadComponent: () => import('./workspace-page').then((module) => module.WorkspacePage),
    canActivate: [requireAuthentication],
  },
  { path: '**', redirectTo: 'login' },
];
