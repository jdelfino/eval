/**
 * Tests for /api/auth/accept-invite endpoints
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

// Mock dependencies
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}));

jest.mock('@/server/invitations', () => ({
  getInvitationService: jest.fn(),
  getInvitationRepository: jest.fn(),
}));

jest.mock('@/server/invitations/types', () => ({
  getInvitationStatus: jest.fn(),
}));

jest.mock('@/server/auth', () => ({
  getAuthProvider: jest.fn(),
  getNamespaceRepository: jest.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';
import { getInvitationStatus } from '@/server/invitations/types';
import { getAuthProvider, getNamespaceRepository } from '@/server/auth';

describe('/api/auth/accept-invite', () => {
  // Mock data
  const mockSupabaseUser = {
    id: 'supabase-user-123',
    email: 'test@example.com',
  };

  const mockInvitation = {
    id: 'invitation-123',
    email: 'test@example.com',
    supabaseUserId: 'supabase-user-123',
    targetRole: 'instructor' as const,
    namespaceId: 'test-namespace',
    createdBy: 'admin-123',
    createdAt: new Date('2024-01-01'),
    expiresAt: new Date('2024-01-08'),
  };

  const mockNamespace = {
    id: 'test-namespace',
    displayName: 'Test Namespace',
    active: true,
    createdAt: new Date('2024-01-01'),
    createdBy: 'admin-123',
    updatedAt: new Date('2024-01-01'),
  };

  let mockSupabase: any;
  let mockInvitationRepository: any;
  let mockInvitationService: any;
  let mockAuthProvider: any;
  let mockNamespaceRepository: any;

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

    // Setup invitation repository mock
    mockInvitationRepository = {
      getInvitationBySupabaseUserId: jest.fn().mockResolvedValue(mockInvitation),
    };
    (getInvitationRepository as jest.Mock).mockReturnValue(mockInvitationRepository);

    // Setup invitation service mock
    mockInvitationService = {
      consumeInvitation: jest.fn().mockResolvedValue(undefined),
    };
    (getInvitationService as jest.Mock).mockReturnValue(mockInvitationService);

    // Setup auth provider mock
    mockAuthProvider = {
      getUserByUsername: jest.fn().mockResolvedValue(null),
      getUser: jest.fn().mockResolvedValue({
        id: 'supabase-user-123',
        email: 'test@example.com',
        role: 'instructor',
        namespaceId: 'test-namespace',
        createdAt: new Date(),
      }),
      userRepository: {
        saveUser: jest.fn().mockResolvedValue(undefined),
      },
    };
    (getAuthProvider as jest.Mock).mockResolvedValue(mockAuthProvider);

    // Setup namespace repository mock
    mockNamespaceRepository = {
      getNamespace: jest.fn().mockResolvedValue(mockNamespace),
    };
    (getNamespaceRepository as jest.Mock).mockReturnValue(mockNamespaceRepository);

    // Default status: pending
    (getInvitationStatus as jest.Mock).mockReturnValue('pending');
  });

  describe('GET /api/auth/accept-invite', () => {
    it('returns 401 if not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const request = new NextRequest('http://localhost/api/auth/accept-invite');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Not authenticated');
    });

    it('returns 404 when no invitation found for user', async () => {
      mockInvitationRepository.getInvitationBySupabaseUserId.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/auth/accept-invite');
      const response = await GET(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Invitation not found');
      expect(data.code).toBe('INVITATION_NOT_FOUND');
    });

    it('returns 400 for already-consumed invitation', async () => {
      (getInvitationStatus as jest.Mock).mockReturnValue('consumed');

      const request = new NextRequest('http://localhost/api/auth/accept-invite');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invitation has already been used');
      expect(data.code).toBe('INVITATION_CONSUMED');
    });

    it('returns 400 for revoked invitation', async () => {
      (getInvitationStatus as jest.Mock).mockReturnValue('revoked');

      const request = new NextRequest('http://localhost/api/auth/accept-invite');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invitation has been revoked');
      expect(data.code).toBe('INVITATION_REVOKED');
    });

    it('returns 400 for expired invitation', async () => {
      (getInvitationStatus as jest.Mock).mockReturnValue('expired');

      const request = new NextRequest('http://localhost/api/auth/accept-invite');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invitation has expired');
      expect(data.code).toBe('INVITATION_EXPIRED');
    });

    it('returns invitation info for authenticated user with valid invitation', async () => {
      const request = new NextRequest('http://localhost/api/auth/accept-invite');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.invitation).toEqual({
        id: 'invitation-123',
        email: 'test@example.com',
        targetRole: 'instructor',
        namespaceId: 'test-namespace',
        expiresAt: expect.any(String),
      });
      expect(data.namespace).toEqual({
        id: 'test-namespace',
        displayName: 'Test Namespace',
      });
    });

    it('handles missing namespace gracefully', async () => {
      mockNamespaceRepository.getNamespace.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/auth/accept-invite');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.namespace).toBeNull();
    });
  });

  describe('POST /api/auth/accept-invite', () => {
    it('returns 401 if not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const request = new NextRequest('http://localhost/api/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ username: 'testuser' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('returns 404 when no invitation found', async () => {
      mockInvitationRepository.getInvitationBySupabaseUserId.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_NOT_FOUND');
    });

    it('returns 400 for consumed invitation', async () => {
      (getInvitationStatus as jest.Mock).mockReturnValue('consumed');

      const request = new NextRequest('http://localhost/api/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_CONSUMED');
    });

    it('creates user profile and marks invitation as consumed', async () => {
      const request = new NextRequest('http://localhost/api/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ displayName: 'Test User' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);

      // Verify user was saved
      expect(mockAuthProvider.userRepository.saveUser).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'supabase-user-123',
          email: 'test@example.com',
          role: 'instructor',
          namespaceId: 'test-namespace',
          displayName: 'Test User',
          emailConfirmed: true,
        })
      );

      // Verify invitation was consumed
      expect(mockInvitationService.consumeInvitation).toHaveBeenCalledWith(
        'invitation-123',
        'supabase-user-123'
      );

      // Verify user is returned
      const data = await response.json();
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe('supabase-user-123');
    });

    it('accepts request without displayName', async () => {
      const request = new NextRequest('http://localhost/api/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockAuthProvider.userRepository.saveUser).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: undefined,
        })
      );
    });

    it('handles errors gracefully', async () => {
      mockAuthProvider.userRepository.saveUser.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to accept invitation');
    });
  });
});
