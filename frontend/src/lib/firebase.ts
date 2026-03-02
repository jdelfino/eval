import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

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

  // When running against the Firebase Auth Emulator (e.g. E2E tests with
  // USE_FIREBASE_EMULATOR=1), connect the Auth SDK to the local emulator.
  if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST) {
    connectAuthEmulator(firebaseAuth, process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST);
  }
}

export { firebaseAuth };
