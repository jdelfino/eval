/**
 * Tests for POST /api/auth/signin route
 *
 * Tests both standard signin flow and MFA trigger for system-admins.
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthProvider } from '@/server/auth';
import { signMfaCookie } from '@/server/auth/mfa-cookie';

jest.mock('@/server/auth');
jest.mock('@/server/auth/mfa-cookie');
jest.mock('@/server/rate-limit', () => ({
  rateLimit: jest.fn().mockResolvedValue(null),
}));

const mockGetAuthProvider = getAuthProvider as jest.MockedFunction<typeof getAuthProvider>;
const mockSignMfaCookie = signMfaCookie as jest.MockedFunction<typeof signMfaCookie>;

describe('POST /api/auth/signin', () => {
  const mockSignOut = jest.fn();
  const mockAuthenticateWithPassword = jest.fn();
  const mockGetSupabaseClient = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignMfaCookie.mockReturnValue('signed-mfa-cookie-value');
    mockGetSupabaseClient.mockResolvedValue({
      auth: {
        signOut: mockSignOut,
      },
    });
    mockGetAuthProvider.mockResolvedValue({
      authenticateWithPassword: mockAuthenticateWithPassword,
      getSupabaseClient: mockGetSupabaseClient,
    } as any);
  });

  describe('validation', () => {
    it('returns 400 when email is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ password: 'password123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });

    it('returns 400 when password is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });

    it('returns 400 when email is not a string', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 123, password: 'password123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });

    it('returns 400 when password is not a string', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 123 }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });
  });

  describe('authentication', () => {
    it('returns 401 for invalid credentials', async () => {
      mockAuthenticateWithPassword.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'wrongpassword' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
    });

    it('trims email before authentication', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'user@example.com',
        role: 'student' as const,
        namespaceId: 'test-namespace',
        createdAt: new Date(),
      };
      mockAuthenticateWithPassword.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: '  user@example.com  ', password: 'password123' }),
      });

      await POST(request);

      expect(mockAuthenticateWithPassword).toHaveBeenCalledWith('user@example.com', 'password123');
    });
  });

  describe('non-admin signin', () => {
    it('returns user directly for student role', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'student@example.com',
        role: 'student' as const,
        namespaceId: 'test-namespace',
        createdAt: new Date(),
      };
      mockAuthenticateWithPassword.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 'student@example.com', password: 'password123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toEqual(expect.objectContaining({
        id: 'user-1',
        email: 'student@example.com',
        role: 'student',
      }));
      expect(data.mfaRequired).toBeUndefined();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockSignMfaCookie).not.toHaveBeenCalled();
    });

    it('returns user directly for instructor role', async () => {
      const mockUser = {
        id: 'user-2',
        email: 'instructor@example.com',
        role: 'instructor' as const,
        namespaceId: 'test-namespace',
        createdAt: new Date(),
      };
      mockAuthenticateWithPassword.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 'instructor@example.com', password: 'password123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toEqual(expect.objectContaining({
        id: 'user-2',
        email: 'instructor@example.com',
        role: 'instructor',
      }));
      expect(data.mfaRequired).toBeUndefined();
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('returns user directly for namespace-admin role', async () => {
      const mockUser = {
        id: 'user-3',
        email: 'admin@example.com',
        role: 'namespace-admin' as const,
        namespaceId: 'test-namespace',
        createdAt: new Date(),
      };
      mockAuthenticateWithPassword.mockResolvedValue(mockUser);

      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@example.com', password: 'password123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toEqual(expect.objectContaining({
        id: 'user-3',
        role: 'namespace-admin',
      }));
      expect(data.mfaRequired).toBeUndefined();
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe('system-admin MFA flow', () => {
    const mockSystemAdmin = {
      id: 'admin-1',
      email: 'sysadmin@example.com',
      role: 'system-admin' as const,
      namespaceId: null,
      createdAt: new Date(),
    };

    beforeEach(() => {
      mockAuthenticateWithPassword.mockResolvedValue(mockSystemAdmin);
    });

    it('returns mfaRequired: true for system-admin', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 'sysadmin@example.com', password: 'password123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.mfaRequired).toBe(true);
      expect(data.email).toBe('sysadmin@example.com');
      expect(data.user).toBeUndefined();
    });

    it('signs out to clear the session for system-admin', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 'sysadmin@example.com', password: 'password123' }),
      });

      await POST(request);

      expect(mockGetSupabaseClient).toHaveBeenCalledWith('server');
      expect(mockSignOut).toHaveBeenCalled();
    });

    it('sets mfa_pending cookie with correct attributes', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 'sysadmin@example.com', password: 'password123' }),
      });

      const response = await POST(request);

      expect(mockSignMfaCookie).toHaveBeenCalledWith('sysadmin@example.com');

      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('mfa_pending=signed-mfa-cookie-value');
      expect(setCookieHeader).toContain('HttpOnly');
      expect(setCookieHeader?.toLowerCase()).toContain('samesite=strict');
      expect(setCookieHeader).toContain('Max-Age=300');
    });

    it('trims email in mfa_pending cookie', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: '  sysadmin@example.com  ', password: 'password123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.email).toBe('sysadmin@example.com');
      expect(mockSignMfaCookie).toHaveBeenCalledWith('sysadmin@example.com');
    });
  });

  describe('error handling', () => {
    it('returns 500 on unexpected error', async () => {
      mockAuthenticateWithPassword.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Authentication failed');
    });
  });
});
