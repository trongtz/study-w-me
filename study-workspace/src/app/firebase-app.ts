import { getApp, getApps, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { environment } from '../environments/environment';

export const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(environment.firebase);
