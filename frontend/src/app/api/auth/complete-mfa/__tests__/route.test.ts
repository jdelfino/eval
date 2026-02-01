/**
 * Tests for /api/auth/complete-mfa endpoint
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';

// Mock dependencies
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}));

jest.mock('@/server/auth', () => ({
  getAuthProvider: jest.fn(),
}));

jest.mock('@/server/auth/mfa-cookie', () => ({
  verifyMfaCookie: jest.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { getAuthProvider } from '@/server/auth';
import { verifyMfaCookie } from '@/server/auth/mfa-cookie';

describe('/api/auth/complete-mfa', () => {
  // Mock data
  const mockSupabaseUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'instructor' as const,
    namespaceId: 'test-namespace',
    displayName: 'Test User',
    createdAt: new Date('2024-01-01'),
  };

  let mockSupabase: any;
  let mockAuthProvider: any;
  let mockUserRepository: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup Supabase mock
    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: mockSupabaseUser },
          error: null,
        }),
      },
    };
    (createServerClient as jest.Mock).mockReturnValue(mockSupabase);

    // Setup user repository mock
    mockUserRepository = {
      getUser: jest.fn().mockResolvedValue(mockUser),
    };

    // Setup auth provider mock
    mockAuthProvider = {
      userRepository: mockUserRepository,
    };
    (getAuthProvider as jest.Mock).mockResolvedValue(mockAuthProvider);

    // Default: valid mfa_pending cookie
    (verifyMfaCookie as jest.Mock).mockReturnValue({
      email: 'test@example.com',
      valid: true,
    });
  });

  function createRequest(cookieValue?: string) {
    const request = new NextRequest('http://localhost/api/auth/complete-mfa', {
      method: 'POST',
    });

    // Mock cookies
    const mockCookies = {
      get: jest.fn((name: string) => {
        if (name === 'mfa_pending' && cookieValue !== undefined) {
          return { value: cookieValue };
        }
        return undefined;
      }),
    };
    Object.defineProperty(request, 'cookies', {
      value: mockCookies,
      writable: false,
    });

    return request;
  }

  describe('POST /api/auth/complete-mfa', () => {
    it('returns 403 when no mfa_pending cookie', async () => {
      (verifyMfaCookie as jest.Mock).mockReturnValue({
        email: '',
        valid: false,
      });

      const request = createRequest(undefined);
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('MFA session expired');
    });

    it('returns 403 when mfa_pending cookie is invalid', async () => {
      (verifyMfaCookie as jest.Mock).mockReturnValue({
        email: 'test@example.com',
        valid: false,
      });

      const request = createRequest('invalid-cookie-value');
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('MFA session expired');
    });

    it('returns 403 when mfa_pending cookie is expired', async () => {
      (verifyMfaCookie as jest.Mock).mockReturnValue({
        email: 'test@example.com',
        valid: false, // expired
      });

      const request = createRequest('test@example.com:1234567890:signature');
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('MFA session expired');
    });

    it('returns 401 when no session exists', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const request = createRequest('valid-cookie');
      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Not authenticated');
    });

    it('returns 403 when email mismatch between cookie and session', async () => {
      // Cookie has different email than session
      (verifyMfaCookie as jest.Mock).mockReturnValue({
        email: 'other@example.com',
        valid: true,
      });

      const request = createRequest('valid-cookie');
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Email mismatch');
    });

    it('returns 404 when user not found in database', async () => {
      mockUserRepository.getUser.mockResolvedValue(null);

      const request = createRequest('valid-cookie');
      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('User not found');
    });

    it('returns 200 and user on successful MFA completion', async () => {
      const request = createRequest('valid-cookie');
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user).toEqual(expect.objectContaining({
        id: 'user-123',
        email: 'test@example.com',
        role: 'instructor',
      }));
    });

    it('clears mfa_pending cookie on successful completion', async () => {
      const request = createRequest('valid-cookie');
      const response = await POST(request);

      expect(response.status).toBe(200);
      // Check that the cookie is being deleted (Next.js uses Expires=Thu, 01 Jan 1970)
      const setCookieHeader = response.headers.get('set-cookie');
      expect(setCookieHeader).toContain('mfa_pending=');
      expect(setCookieHeader).toContain('Expires=Thu, 01 Jan 1970');
    });

    it('verifies cookie is checked before session', async () => {
      (verifyMfaCookie as jest.Mock).mockReturnValue({
        email: '',
        valid: false,
      });

      const request = createRequest('invalid-cookie');
      await POST(request);

      // Cookie should be verified, but getUser should NOT be called
      expect(verifyMfaCookie).toHaveBeenCalledWith('invalid-cookie');
      expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
    });

    it('calls getUser with the session user ID', async () => {
      const request = createRequest('valid-cookie');
      await POST(request);

      expect(mockUserRepository.getUser).toHaveBeenCalledWith('user-123');
    });

    it('handles repository errors gracefully', async () => {
      mockUserRepository.getUser.mockRejectedValue(new Error('Database error'));

      const request = createRequest('valid-cookie');
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to complete MFA');
    });

    it('handles auth provider initialization errors', async () => {
      (getAuthProvider as jest.Mock).mockRejectedValue(new Error('Auth provider error'));

      const request = createRequest('valid-cookie');
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to complete MFA');
    });

    it('returns student user on successful MFA completion', async () => {
      const studentUser = {
        ...mockUser,
        role: 'student' as const,
      };
      mockUserRepository.getUser.mockResolvedValue(studentUser);

      const request = createRequest('valid-cookie');
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.user.role).toBe('student');
    });
  });
});
