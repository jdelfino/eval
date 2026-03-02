import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const firebaseAuth: Auth = getAuth(app);

// When running against the Firebase Auth Emulator (e.g. E2E tests with
// NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST set), connect the Auth SDK to the local emulator.
if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST) {
  connectAuthEmulator(firebaseAuth, process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST);
}

export { firebaseAuth };
