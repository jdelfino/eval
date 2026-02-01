/**
 * Tests for API authentication helper functions
 */

import { NextRequest } from 'next/server';
import { getAuthenticatedUser, checkPermission } from '../api-auth';
import { getAuthProvider } from '../instance';
import { User, AuthenticationError } from '../types';

// Mock the auth provider
jest.mock('../instance', () => ({
  getAuthProvider: jest.fn(),
}));

const mockGetAuthProvider = getAuthProvider as jest.MockedFunction<typeof getAuthProvider>;

describe('api-auth', () => {
  describe('getAuthenticatedUser', () => {
    it('should return user when valid session cookie is present', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'testuser@example.com',
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      const mockAuthProvider = {
        getSessionFromRequest: jest.fn().mockResolvedValue({
          sessionId: 'session-123',
          user: mockUser,
        }),
      };

      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { cookie: 'sessionId=session-123' },
      });

      const user = await getAuthenticatedUser(request);

      expect(user).toEqual(mockUser);
      expect(mockAuthProvider.getSessionFromRequest).toHaveBeenCalledWith(request);
    });

    it('should throw AuthenticationError when no session cookie', async () => {
      const mockAuthProvider = {
        getSessionFromRequest: jest.fn().mockResolvedValue(null),
      };

      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);

      const request = new NextRequest('http://localhost:3000/api/test');

      await expect(getAuthenticatedUser(request)).rejects.toThrow(AuthenticationError);
      await expect(getAuthenticatedUser(request)).rejects.toThrow('Not authenticated');
    });

    it('should throw AuthenticationError when session is expired', async () => {
      const mockAuthProvider = {
        getSessionFromRequest: jest.fn().mockResolvedValue(null),
      };

      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { cookie: 'sessionId=expired-session' },
      });

      await expect(getAuthenticatedUser(request)).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError when session has no user', async () => {
      const mockAuthProvider = {
        getSessionFromRequest: jest.fn().mockResolvedValue({
          sessionId: 'session-123',
          user: null,
        }),
      };

      mockGetAuthProvider.mockResolvedValue(mockAuthProvider as any);

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { cookie: 'sessionId=session-123' },
      });

      await expect(getAuthenticatedUser(request)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('checkPermission', () => {
    it('should return true when user has the permission', () => {
      const user: User = {
        id: 'user-1',
        email: 'instructor@example.com',
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      // Instructors have 'session.viewAll' permission
      const result = checkPermission(user, 'session.viewAll');
      expect(result).toBe(true);
    });

    it('should return false when user does not have the permission', () => {
      const user: User = {
        id: 'user-1',
        email: 'student@example.com',
        role: 'student',
        namespaceId: 'default',
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      // Students do not have 'session.viewAll' permission
      const result = checkPermission(user, 'session.viewAll');
      expect(result).toBe(false);
    });

    it('should return true for system-admin with any permission', () => {
      const user: User = {
        id: 'user-1',
        email: 'admin@example.com',
        role: 'system-admin',
        namespaceId: null,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      const result = checkPermission(user, 'session.viewAll');
      expect(result).toBe(true);
    });

    it('should return false for unknown permissions', () => {
      const user: User = {
        id: 'user-1',
        email: 'instructor2@example.com',
        role: 'instructor',
        namespaceId: 'default',
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      const result = checkPermission(user, 'nonexistent.permission');
      expect(result).toBe(false);
    });
  });
});
