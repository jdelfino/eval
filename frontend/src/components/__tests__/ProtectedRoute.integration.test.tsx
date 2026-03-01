/**
 * @jest-environment jsdom
 *
 * Integration test: AuthContext + ProtectedRoute wired together.
 * Mocks Firebase auth and api-client, but uses real AuthContext and ProtectedRoute.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// --- Mocks ---

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let authStateCallback: ((user: any) => void) | null = null;
const mockOnAuthStateChanged = jest.fn((_auth: any, cb: any) => {
  authStateCallback = cb;
  return jest.fn(); // unsubscribe
});

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: (auth: any, cb: any) => mockOnAuthStateChanged(auth, cb),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  firebaseAuth: {},
}));

const mockApiGet = jest.fn();
jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: any[]) => mockApiGet(...args),
}));

import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';

function makeUser(role: string) {
  return {
    id: 'u1',
    email: 'test@test.com',
    role,
    namespace_id: 'ns-1',
    display_name: 'Test User',
    external_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

function renderWithAuth(ui: React.ReactElement) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe('ProtectedRoute + AuthContext integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authStateCallback = null;
    // Clear sessionStorage to prevent profile cache from leaking across tests
    sessionStorage.clear();
  });

  it('redirects unauthenticated user to /auth/signin', async () => {
    renderWithAuth(
      <ProtectedRoute>
        <div>Secret Content</div>
      </ProtectedRoute>
    );

    // Simulate firebase reporting no user
    await waitFor(() => {
      expect(authStateCallback).not.toBeNull();
    });
    authStateCallback!(null);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/signin');
    });
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('redirects authenticated user with wrong role', async () => {
    const studentUser = makeUser('student');
    mockApiGet.mockResolvedValue(studentUser);

    renderWithAuth(
      <ProtectedRoute requiredRole="instructor" allowAdmin={false}>
        <div>Instructor Only</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(authStateCallback).not.toBeNull();
    });
    authStateCallback!({ uid: 'fb-1' }); // simulate firebase user

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/student');
    });
    expect(screen.queryByText('Instructor Only')).not.toBeInTheDocument();
  });

  it('renders children for authenticated user with correct role', async () => {
    const instructorUser = makeUser('instructor');
    mockApiGet.mockResolvedValue(instructorUser);

    renderWithAuth(
      <ProtectedRoute requiredRole="instructor">
        <div>Instructor Dashboard</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(authStateCallback).not.toBeNull();
    });
    authStateCallback!({ uid: 'fb-1' });

    await waitFor(() => {
      expect(screen.getByText('Instructor Dashboard')).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('admin bypass: system-admin can access instructor route', async () => {
    const adminUser = makeUser('system-admin');
    mockApiGet.mockResolvedValue(adminUser);

    renderWithAuth(
      <ProtectedRoute requiredRole="instructor" allowAdmin={true}>
        <div>Admin Bypass Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(authStateCallback).not.toBeNull();
    });
    authStateCallback!({ uid: 'fb-admin' });

    await waitFor(() => {
      expect(screen.getByText('Admin Bypass Content')).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
