export const getAuth = jest.fn(() => ({
  currentUser: {
    uid: 'test-user-id',
    email: 'test@example.com',
    displayName: 'Test User',
    getIdToken: jest.fn().mockResolvedValue('mock-firebase-token'),
  },
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn(),
}));
export const onAuthStateChanged = jest.fn();
export const signInWithEmailAndPassword = jest.fn();
export const createUserWithEmailAndPassword = jest.fn();
export const signOut = jest.fn();
export const updateProfile = jest.fn();
export const sendPasswordResetEmail = jest.fn();
export const GoogleAuthProvider = jest.fn();
export const signInWithPopup = jest.fn();
export const setPersistence = jest.fn();
export const browserLocalPersistence = {};
export const browserSessionPersistence = {};
export const inMemoryPersistence = {};
export const sendSignInLinkToEmail = jest.fn();
export const isSignInWithEmailLink = jest.fn();
export const signInWithEmailLink = jest.fn();
