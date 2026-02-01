/**
 * Tests for POST /api/admin/clear-data route
 *
 * Tests the security requirement that only system-admin can clear all data.
 */

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getAuthProvider } from '@/server/auth';
import { createStorage } from '@/server/persistence';
import * as SessionService from '@/server/services/session-service';

jest.mock('@/server/auth', () => ({
  getAuthProvider: jest.fn(),
}));
jest.mock('@/server/persistence');
jest.mock('@/server/services/session-service');

const mockGetAuthProvider = getAuthProvider as jest.MockedFunction<typeof getAuthProvider>;
const mockCreateStorage = createStorage as jest.MockedFunction<typeof createStorage>;

describe('POST /api/admin/clear-data', () => {
  const createUser = (role: 'system-admin' | 'namespace-admin' | 'instructor' | 'student', id = 'user-1') => ({
    id,
    email: `${role}@example.com`,
    role,
    namespaceId: 'default',
    createdAt: new Date(),
  });

  let mockAuthProvider: any;
  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthProvider = {
      getSessionFromRequest: jest.fn(),
      getAllUsers: jest.fn().mockResolvedValue([]),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    };
    mockGetAuthProvider.mockResolvedValue(mockAuthProvider);

    mockStorage = {
      sessions: {
        listAllSessions: jest.fn().mockResolvedValue([]),
      },
      memberships: {
        clear: jest.fn().mockResolvedValue(undefined),
      },
      sections: {
        clear: jest.fn().mockResolvedValue(undefined),
      },
      classes: {
        clear: jest.fn().mockResolvedValue(undefined),
      },
      problems: {
        getAll: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      revisions: {
        clear: jest.fn().mockResolvedValue(undefined),
      },
    };
    mockCreateStorage.mockResolvedValue(mockStorage);

    (SessionService.endSession as jest.Mock).mockResolvedValue(undefined);
  });

  describe('Security: system-admin only', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuthProvider.getSessionFromRequest.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/admin/clear-data', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 when user is an instructor', async () => {
      const instructor = createUser('instructor');
      mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user: instructor });

      const request = new NextRequest('http://localhost:3000/api/admin/clear-data', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden: Only system administrators can clear all data');
    });

    it('returns 403 when user is a namespace-admin', async () => {
      const namespaceAdmin = createUser('namespace-admin');
      mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user: namespaceAdmin });

      const request = new NextRequest('http://localhost:3000/api/admin/clear-data', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden: Only system administrators can clear all data');
    });

    it('returns 403 when user is a student', async () => {
      const student = createUser('student');
      mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user: student });

      const request = new NextRequest('http://localhost:3000/api/admin/clear-data', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden: Only system administrators can clear all data');
    });

    it('allows system-admin to clear data', async () => {
      const sysAdmin = createUser('system-admin');
      mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user: sysAdmin });

      const request = new NextRequest('http://localhost:3000/api/admin/clear-data', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.preserved.admin.id).toBe(sysAdmin.id);
    });
  });

  describe('Functionality', () => {
    it('clears sessions via session service', async () => {
      const sysAdmin = createUser('system-admin');
      mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user: sysAdmin });
      mockStorage.sessions.listAllSessions.mockResolvedValue([
        { id: 'session-1' },
        { id: 'session-2' },
      ]);

      const request = new NextRequest('http://localhost:3000/api/admin/clear-data', {
        method: 'POST',
      });

      await POST(request);

      expect(SessionService.endSession).toHaveBeenCalledWith(mockStorage, 'session-1');
      expect(SessionService.endSession).toHaveBeenCalledWith(mockStorage, 'session-2');
    });

    it('preserves the current admin user', async () => {
      const sysAdmin = createUser('system-admin', 'admin-id');
      mockAuthProvider.getSessionFromRequest.mockResolvedValue({ user: sysAdmin });
      mockAuthProvider.getAllUsers.mockResolvedValue([
        { id: 'admin-id', username: 'system-admin' },
        { id: 'other-user', username: 'other' },
      ]);

      const request = new NextRequest('http://localhost:3000/api/admin/clear-data', {
        method: 'POST',
      });

      await POST(request);

      // Should delete other users but not the admin
      expect(mockAuthProvider.deleteUser).toHaveBeenCalledWith('other-user');
      expect(mockAuthProvider.deleteUser).not.toHaveBeenCalledWith('admin-id');
    });
  });
});
