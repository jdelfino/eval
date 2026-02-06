import { initializeApp, getApps } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

// In test mode (NEXT_PUBLIC_AUTH_MODE=test), Firebase is never used —
// TestAuthProvider handles all auth. Skip initialization to avoid
// auth/invalid-api-key errors when no Firebase API key is configured.
let firebaseAuth: Auth;
if (process.env.NEXT_PUBLIC_AUTH_MODE !== 'test') {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  firebaseAuth = getAuth(app);
}

export { firebaseAuth };
