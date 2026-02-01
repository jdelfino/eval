/**
 * Tests for System Admin User Management API
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET } from '../route';
import { PUT, DELETE } from '../[id]/route';
import * as apiHelpers from '@/server/auth/api-helpers';
import * as authInstance from '@/server/auth/instance';
import { User, UserRole } from '@/server/auth/types';
import { SupabaseAuthProvider } from '@/server/auth/supabase-provider';
import { SupabaseClient } from '@supabase/supabase-js';

jest.mock('@/server/auth/api-helpers');
jest.mock('@/server/auth/instance');

describe('System Admin User Management API', () => {
  let mockAuthProvider: jest.Mocked<SupabaseAuthProvider>;
  let mockSupabaseClient: jest.Mocked<SupabaseClient>;
  let mockSystemAdmin: User;

  beforeEach(() => {
    mockSystemAdmin = {
      id: 'admin-id',
      email: 'admin@test.local',
      role: 'system-admin' as UserRole,
      namespaceId: null,
      displayName: 'System Admin',
      createdAt: new Date(),
    };

    // Mock Supabase client
    mockSupabaseClient = {
      from: jest.fn(),
      auth: {
        admin: {
          getUserById: jest.fn(),
          updateUserById: jest.fn(),
          deleteUser: jest.fn(),
        }
      }
    } as any;

    // Mock auth provider
    mockAuthProvider = {
      getSupabaseClient: jest.fn().mockReturnValue(mockSupabaseClient),
    } as any;

    (authInstance.getAuthProvider as jest.Mock).mockResolvedValue(mockAuthProvider);
  });

  describe('GET /api/system/users', () => {
    it('should list all users with email and auth data', async () => {
      const mockProfiles = [
        {
          id: 'user1',
          role: 'instructor',
          namespace_id: 'ns1',
          display_name: 'User One',
          created_at: '2024-01-01T00:00:00Z',
          last_login_at: '2024-01-02T00:00:00Z'
        },
        {
          id: 'user2',
          role: 'student',
          namespace_id: 'ns1',
          display_name: 'User Two',
          created_at: '2024-01-01T00:00:00Z',
          last_login_at: null
        }
      ];

      (apiHelpers.requireSystemAdmin as jest.Mock).mockResolvedValue({
        user: mockSystemAdmin,
        rbac: {}
      });

      const mockSelect = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockResolvedValue({ data: mockProfiles, error: null });
      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: mockSelect,
        order: mockOrder
      });

      // Mock getUserById to return auth users
      (mockSupabaseClient.auth.admin.getUserById as jest.Mock)
        .mockResolvedValueOnce({
          data: {
            user: {
              id: 'user1',
              email: 'user1@test.local',
              email_confirmed_at: '2024-01-01T00:00:00Z'
            }
          },
          error: null
        })
        .mockResolvedValueOnce({
          data: {
            user: {
              id: 'user2',
              email: 'user2@test.local',
              email_confirmed_at: null
            }
          },
          error: null
        });

      const request = new NextRequest('http://localhost/api/system/users');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.users).toHaveLength(2);
      expect(data.users[0]).toMatchObject({
        id: 'user1',
        email: 'user1@test.local',
        role: 'instructor',
        namespaceId: 'ns1',
        emailConfirmed: true
      });
      expect(data.users[1]).toMatchObject({
        id: 'user2',
        email: 'user2@test.local',
        role: 'student',
        emailConfirmed: false
      });
    });

    it('should return 403 if not system admin', async () => {
      (apiHelpers.requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'System admin access required' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/system/users');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('System admin access required');
    });

    it('should handle database errors', async () => {
      (apiHelpers.requireSystemAdmin as jest.Mock).mockResolvedValue({
        user: mockSystemAdmin,
        rbac: {}
      });

      const mockSelect = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });
      (mockSupabaseClient.from as jest.Mock).mockReturnValue({
        select: mockSelect,
        order: mockOrder
      });

      const request = new NextRequest('http://localhost/api/system/users');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Database error');
    });
  });

  describe('PUT /api/system/users/[id]', () => {
    it('should update user email and profile fields', async () => {
      const updatedProfile = {
        id: 'user1',
        role: 'instructor',
        namespace_id: 'ns1',
        display_name: 'Updated User',
        created_at: '2024-01-01T00:00:00Z',
        last_login_at: '2024-01-02T00:00:00Z'
      };

      (apiHelpers.requireSystemAdmin as jest.Mock).mockResolvedValue({
        user: mockSystemAdmin,
        rbac: {}
      });

      (mockSupabaseClient.auth.admin.updateUserById as jest.Mock).mockResolvedValue({
        data: {},
        error: null
      });

      const mockUpdate = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      const mockSelect = jest.fn().mockReturnThis();
      const mockSingle = jest.fn().mockResolvedValue({ data: updatedProfile, error: null });

      (mockSupabaseClient.from as jest.Mock)
        .mockReturnValueOnce({
          update: mockUpdate,
          eq: mockEq
        })
        .mockReturnValueOnce({
          select: mockSelect,
          eq: jest.fn().mockReturnThis(),
          single: mockSingle
        });

      // Mock getUserById for fetching updated user
      (mockSupabaseClient.auth.admin.getUserById as jest.Mock).mockResolvedValue({
        data: {
          user: {
            id: 'user1',
            email: 'updated@test.local',
            email_confirmed_at: '2024-01-01T00:00:00Z'
          }
        },
        error: null
      });

      const request = new NextRequest('http://localhost/api/system/users/user1', {
        method: 'PUT',
        body: JSON.stringify({
          email: 'updated@test.local',
          role: 'instructor',
          displayName: 'Updated User'
        })
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'user1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toMatchObject({
        id: 'user1',
        email: 'updated@test.local',
        role: 'instructor'
      });
      expect(mockSupabaseClient.auth.admin.updateUserById).toHaveBeenCalledWith('user1', {
        email: 'updated@test.local'
      });
    });

    it('should return 403 if not system admin', async () => {
      (apiHelpers.requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'System admin access required' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/system/users/user1', {
        method: 'PUT',
        body: JSON.stringify({ role: 'instructor' })
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'user1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('System admin access required');
    });
  });

  describe('DELETE /api/system/users/[id]', () => {
    it('should delete a user', async () => {
      (apiHelpers.requireSystemAdmin as jest.Mock).mockResolvedValue({
        user: mockSystemAdmin,
        rbac: {}
      });

      (mockSupabaseClient.auth.admin.deleteUser as jest.Mock).mockResolvedValue({
        data: {},
        error: null
      });

      const request = new NextRequest('http://localhost/api/system/users/user1', {
        method: 'DELETE'
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'user1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockSupabaseClient.auth.admin.deleteUser).toHaveBeenCalledWith('user1');
    });

    it('should prevent self-deletion', async () => {
      (apiHelpers.requireSystemAdmin as jest.Mock).mockResolvedValue({
        user: mockSystemAdmin,
        rbac: {}
      });

      const request = new NextRequest('http://localhost/api/system/users/admin-id', {
        method: 'DELETE'
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'admin-id' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot delete your own account');
      expect(mockSupabaseClient.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it('should return 403 if not system admin', async () => {
      (apiHelpers.requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'System admin access required' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/system/users/user1', {
        method: 'DELETE'
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'user1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('System admin access required');
    });
  });
});
