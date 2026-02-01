/**
 * Tests for POST /api/auth/register route
 *
 * Open registration is disabled. Only system-admin bootstrap is allowed
 * via SYSTEM_ADMIN_EMAIL environment variable.
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthProvider, getNamespaceRepository } from '@/server/auth';

jest.mock('@/server/auth');

const mockGetAuthProvider = getAuthProvider as jest.MockedFunction<typeof getAuthProvider>;
const mockGetNamespaceRepository = getNamespaceRepository as jest.MockedFunction<typeof getNamespaceRepository>;

describe('POST /api/auth/register', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, SYSTEM_ADMIN_EMAIL: 'admin@example.com' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('open registration disabled', () => {
    it('returns 403 for regular user registration', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'password123',
          namespaceId: 'test-namespace',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Open registration is disabled');
      expect(data.message).toBe('Please use a section join code to register as a student, or check your email for an invitation link.');
    });

    it('returns 403 even with valid namespace', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'student@example.com',
          password: 'securepass123',
          namespaceId: 'valid-namespace',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
      // Should NOT call any auth provider or namespace repo
      expect(mockGetAuthProvider).not.toHaveBeenCalled();
      expect(mockGetNamespaceRepository).not.toHaveBeenCalled();
    });
  });

  describe('system-admin bootstrap', () => {
    it('allows registration for SYSTEM_ADMIN_EMAIL', async () => {
      const mockUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'system-admin' as const,
        namespaceId: null,
        createdAt: new Date(),
      };

      const mockAuthProvider = {
        signUp: jest.fn().mockResolvedValue(mockUser),
      };

      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'adminpass123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Account created. Please sign in.');
      expect(mockAuthProvider.signUp).toHaveBeenCalledWith(
        'admin@example.com',
        'adminpass123',
        'system-admin',
        null
      );
    });

    it('returns 400 when email is missing for system-admin', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          password: 'adminpass123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });

    it('returns 400 when password is missing for system-admin', async () => {
      process.env.SYSTEM_ADMIN_EMAIL = 'admin@example.com';

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@example.com',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });

    it('returns 409 when system-admin already exists', async () => {
      const mockAuthProvider = {
        signUp: jest.fn().mockRejectedValue(new Error('User already exists')),
      };

      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'adminpass123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('User with this email already exists');
    });

    it('returns 500 on unexpected error during system-admin registration', async () => {
      const mockAuthProvider = {
        signUp: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      };

      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'adminpass123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Registration failed');
    });

    it('returns 400 with descriptive message for password validation errors', async () => {
      const mockAuthProvider = {
        signUp: jest.fn().mockRejectedValue(new Error('Password should be at least 8 characters')),
      };

      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'short',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Password should be at least 8 characters');
    });

    it('returns 400 with descriptive message for weak password errors', async () => {
      const mockAuthProvider = {
        signUp: jest.fn().mockRejectedValue(new Error('Password is too weak')),
      };

      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);

      const request = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@example.com',
          password: '12345678',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Password is too weak');
    });
  });
});
