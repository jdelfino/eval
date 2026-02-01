/**
 * Tests for /api/namespace/invitations/[id] endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, DELETE } from '../route';

// Mock dependencies
jest.mock('@/server/auth/api-helpers', () => ({
  requirePermission: jest.fn(),
  getNamespaceContext: jest.fn(),
}));

jest.mock('@/server/invitations', () => ({
  getInvitationService: jest.fn(),
  getInvitationRepository: jest.fn(),
}));

jest.mock('@/server/invitations/types', () => ({
  InvitationError: class InvitationError extends Error {
    constructor(message: string, public readonly code: string) {
      super(message);
      this.name = 'InvitationError';
    }
  },
  getInvitationStatus: jest.fn().mockReturnValue('pending'),
}));

import { requirePermission, getNamespaceContext } from '@/server/auth/api-helpers';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';

describe('/api/namespace/invitations/[id]', () => {
  const mockNamespaceAdmin = {
    id: 'admin-123',
    email: 'admin@example.com',
    role: 'namespace-admin' as const,
    namespaceId: 'test-namespace',
    createdAt: new Date('2024-01-01'),
  };

  const mockInvitation = {
    id: 'invitation-123',
    email: 'invitee@example.com',
    supabaseUserId: 'supabase-123',
    targetRole: 'instructor' as const,
    namespaceId: 'test-namespace',
    createdBy: 'admin-123',
    createdAt: new Date('2024-01-01'),
    expiresAt: new Date('2024-01-08'),
  };

  const mockOtherNamespaceInvitation = {
    ...mockInvitation,
    id: 'other-invitation-123',
    namespaceId: 'other-namespace',
  };

  let mockInvitationRepository: {
    getInvitation: jest.Mock;
  };
  let mockInvitationService: {
    revokeInvitation: jest.Mock;
  };

  const createContext = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default to namespace admin auth
    (requirePermission as jest.Mock).mockResolvedValue({
      user: mockNamespaceAdmin,
      rbac: { hasPermission: () => true },
    });

    (getNamespaceContext as jest.Mock).mockReturnValue('test-namespace');

    mockInvitationRepository = {
      getInvitation: jest.fn().mockResolvedValue(mockInvitation),
    };
    (getInvitationRepository as jest.Mock).mockReturnValue(mockInvitationRepository);

    mockInvitationService = {
      revokeInvitation: jest.fn().mockResolvedValue(undefined),
    };
    (getInvitationService as jest.Mock).mockReturnValue(mockInvitationService);
  });

  describe('GET /api/namespace/invitations/[id]', () => {
    it('returns 401 if not authenticated', async () => {
      (requirePermission as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/namespace/invitations/invitation-123');
      const response = await GET(request, createContext('invitation-123'));

      expect(response.status).toBe(401);
    });

    it('returns 403 for non-namespace-admin', async () => {
      (requirePermission as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Forbidden: Requires user.manage permission' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/namespace/invitations/invitation-123');
      const response = await GET(request, createContext('invitation-123'));

      expect(response.status).toBe(403);
    });

    it('returns 404 for non-existent invitation', async () => {
      mockInvitationRepository.getInvitation.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/namespace/invitations/non-existent');
      const response = await GET(request, createContext('non-existent'));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_NOT_FOUND');
    });

    it('returns 403 for invitation in different namespace', async () => {
      mockInvitationRepository.getInvitation.mockResolvedValue(mockOtherNamespaceInvitation);

      const request = new NextRequest('http://localhost/api/namespace/invitations/other-invitation-123');
      const response = await GET(request, createContext('other-invitation-123'));

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_NOT_FOUND');
    });

    it('returns invitation details for valid request', async () => {
      const request = new NextRequest('http://localhost/api/namespace/invitations/invitation-123');
      const response = await GET(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.invitation.id).toBe('invitation-123');
      expect(data.invitation.email).toBe('invitee@example.com');
      expect(data.invitation.status).toBe('pending');
    });

    it('serializes dates correctly', async () => {
      const request = new NextRequest('http://localhost/api/namespace/invitations/invitation-123');
      const response = await GET(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.invitation.createdAt).toBe('string');
      expect(typeof data.invitation.expiresAt).toBe('string');
    });

    it('allows system-admin with no namespace (undefined) to access any invitation', async () => {
      const systemAdmin = {
        id: 'sysadmin-1',
        email: 'sysadmin@example.com',
        role: 'system-admin' as const,
        createdAt: new Date('2024-01-01'),
      };

      (requirePermission as jest.Mock).mockResolvedValue({
        user: systemAdmin,
        rbac: { hasPermission: () => true },
        accessToken: 'test-token',
      });

      // namespaceId is undefined for system-admin with no namespace param
      (getNamespaceContext as jest.Mock).mockReturnValue(undefined);

      // Invitation belongs to some namespace
      mockInvitationRepository.getInvitation.mockResolvedValue(mockOtherNamespaceInvitation);

      const request = new NextRequest('http://localhost/api/namespace/invitations/other-invitation-123');
      const response = await GET(request, createContext('other-invitation-123'));

      // Should succeed (200), not 403
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.invitation.id).toBe('other-invitation-123');
    });
  });

  describe('DELETE /api/namespace/invitations/[id]', () => {
    it('returns 401 if not authenticated', async () => {
      (requirePermission as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/namespace/invitations/invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('invitation-123'));

      expect(response.status).toBe(401);
    });

    it('returns 403 for non-namespace-admin', async () => {
      (requirePermission as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Forbidden: Requires user.manage permission' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/namespace/invitations/invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('invitation-123'));

      expect(response.status).toBe(403);
    });

    it('returns 404 for non-existent invitation', async () => {
      mockInvitationRepository.getInvitation.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/namespace/invitations/non-existent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('non-existent'));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_NOT_FOUND');
    });

    it('returns 403 for invitation in different namespace', async () => {
      mockInvitationRepository.getInvitation.mockResolvedValue(mockOtherNamespaceInvitation);

      const request = new NextRequest('http://localhost/api/namespace/invitations/other-invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('other-invitation-123'));

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_NOT_FOUND');
    });

    it('returns 400 for already-consumed invitation', async () => {
      const error = new Error('Cannot revoke consumed invitation') as Error & { name: string; code: string };
      error.name = 'InvitationError';
      error.code = 'INVITATION_CONSUMED';
      mockInvitationService.revokeInvitation.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/namespace/invitations/invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('invitation-123'));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_CONSUMED');
    });

    it('allows system-admin with no namespace (undefined) to delete any invitation', async () => {
      const systemAdmin = {
        id: 'sysadmin-1',
        email: 'sysadmin@example.com',
        role: 'system-admin' as const,
        createdAt: new Date('2024-01-01'),
      };

      (requirePermission as jest.Mock).mockResolvedValue({
        user: systemAdmin,
        rbac: { hasPermission: () => true },
        accessToken: 'test-token',
      });

      (getNamespaceContext as jest.Mock).mockReturnValue(undefined);

      const revokedInvitation = {
        ...mockOtherNamespaceInvitation,
        revokedAt: new Date('2024-01-02'),
      };
      mockInvitationRepository.getInvitation
        .mockResolvedValueOnce(mockOtherNamespaceInvitation)
        .mockResolvedValueOnce(revokedInvitation);

      const request = new NextRequest('http://localhost/api/namespace/invitations/other-invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('other-invitation-123'));

      expect(response.status).toBe(200);
      expect(mockInvitationService.revokeInvitation).toHaveBeenCalledWith('other-invitation-123');
    });

    it('revokes invitation in user namespace successfully', async () => {
      // Mock returning the revoked invitation after revoke
      const revokedInvitation = {
        ...mockInvitation,
        revokedAt: new Date('2024-01-02'),
      };
      mockInvitationRepository.getInvitation
        .mockResolvedValueOnce(mockInvitation) // First call - before revoke
        .mockResolvedValueOnce(revokedInvitation); // Second call - after revoke

      const request = new NextRequest('http://localhost/api/namespace/invitations/invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      expect(mockInvitationService.revokeInvitation).toHaveBeenCalledWith('invitation-123');
      const data = await response.json();
      expect(data.invitation.id).toBe('invitation-123');
    });
  });
});
