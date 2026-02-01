/**
 * Security-focused unit tests for SupabaseAuthProvider
 *
 * These tests verify that the auth provider uses secure authentication methods:
 * - getUser() for server-verified authentication (not getSession())
 * - Proper JWT validation before trusting user data
 *
 * Background: getSession() reads JWT from cookies without server-side validation,
 * allowing attackers to spoof user.id by crafting malicious cookies. getUser()
 * validates the JWT with Supabase Auth server, preventing impersonation attacks.
 *
 * See: https://supabase.com/docs/reference/javascript/auth-getsession
 */

import { NextRequest } from 'next/server';

// Mock Supabase client modules
const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
const mockFromSelect = jest.fn();

// Mock the service role client used in constructor
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      admin: {
        createUser: jest.fn(),
        deleteUser: jest.fn(),
        getUserById: jest.fn(),
        listUsers: jest.fn(),
      },
      getUser: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      insert: jest.fn(),
    })),
  })),
}));

// Mock SSR client used for request-based auth
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: mockFromSelect,
        })),
      })),
    })),
  })),
}));

// Must be imported after mocks are set up
import { SupabaseAuthProvider } from '../supabase-provider';

describe('SupabaseAuthProvider Security', () => {
  let provider: SupabaseAuthProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new SupabaseAuthProvider();
  });

  describe('getSessionFromRequest', () => {
    it('should call getUser() for server-verified authentication', async () => {
      // Setup: getUser returns a valid user
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        created_at: new Date().toISOString(),
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // Mock profile fetch
      mockFromSelect.mockResolvedValue({
        data: {
          role: 'student',
          namespace_id: 'default',
          display_name: 'Test User',
        },
        error: null,
      });

      // Mock getSession for access token (called after getUser for sessionId)
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'token-123' } },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { cookie: 'sb-auth-token=fake-jwt' },
      });

      const result = await provider.getSessionFromRequest(request);

      // SECURITY: Verify getUser() was called (server-verified auth)
      expect(mockGetUser).toHaveBeenCalled();

      // Verify we got a valid session back
      expect(result).not.toBeNull();
      expect(result?.user.id).toBe('user-123');
      expect(result?.user.email).toBe('test@example.com');
    });

    it('should return null when getUser() returns no user (invalid JWT)', async () => {
      // Setup: getUser returns null (JWT validation failed)
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { cookie: 'sb-auth-token=spoofed-jwt' },
      });

      const result = await provider.getSessionFromRequest(request);

      // Should return null - rejecting the spoofed session
      expect(result).toBeNull();

      // Verify getUser was called to validate
      expect(mockGetUser).toHaveBeenCalled();
    });

    it('should return null when getUser() returns an error', async () => {
      // Setup: getUser returns an error (e.g., expired token, invalid signature)
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      });

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { cookie: 'sb-auth-token=expired-jwt' },
      });

      const result = await provider.getSessionFromRequest(request);

      // Should return null - expired/invalid JWT
      expect(result).toBeNull();
    });

    it('should return null when user profile does not exist', async () => {
      // Setup: getUser succeeds but profile fetch fails
      const mockUser = {
        id: 'orphan-user-123',
        email: 'orphan@example.com',
        created_at: new Date().toISOString(),
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // Profile not found
      mockFromSelect.mockResolvedValue({
        data: null,
        error: { message: 'No rows returned' },
      });

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { cookie: 'sb-auth-token=valid-jwt' },
      });

      const result = await provider.getSessionFromRequest(request);

      // Should return null - user exists in auth but not in profiles
      expect(result).toBeNull();
    });

    it('should use user.id from getUser() response for profile lookup', async () => {
      // This test ensures we use the server-verified user.id, not a spoofed one
      const verifiedUserId = 'verified-user-id';
      const mockUser = {
        id: verifiedUserId,
        email: 'verified@example.com',
        created_at: new Date().toISOString(),
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      // Mock profile fetch
      mockFromSelect.mockResolvedValue({
        data: {
          role: 'instructor',
          namespace_id: 'default',
          display_name: 'Verified User',
        },
        error: null,
      });

      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'token-abc' } },
        error: null,
      });

      const request = new NextRequest('http://localhost:3000/api/test');

      const result = await provider.getSessionFromRequest(request);

      // The returned user ID should match the server-verified ID
      expect(result?.user.id).toBe(verifiedUserId);
    });
  });
});
