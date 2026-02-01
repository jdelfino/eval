/**
 * Tests for /api/system/invitations/[id] endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, DELETE } from '../route';

// Mock dependencies
jest.mock('@/server/auth/api-helpers', () => ({
  requireSystemAdmin: jest.fn(),
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

import { requireSystemAdmin } from '@/server/auth/api-helpers';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';
import { getInvitationStatus } from '@/server/invitations/types';

describe('/api/system/invitations/[id]', () => {
  const mockSystemAdmin = {
    id: 'admin-123',
    email: 'admin@example.com',
    role: 'system-admin' as const,
    namespaceId: null,
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

  const mockRevokedInvitation = {
    ...mockInvitation,
    revokedAt: new Date('2024-01-02'),
  };

  let mockInvitationRepository: any;
  let mockInvitationService: any;

  const createContext = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  beforeEach(() => {
    jest.clearAllMocks();

    (requireSystemAdmin as jest.Mock).mockResolvedValue({
      user: mockSystemAdmin,
      rbac: { hasPermission: () => true },
    });

    mockInvitationRepository = {
      getInvitation: jest.fn().mockResolvedValue(mockInvitation),
    };
    (getInvitationRepository as jest.Mock).mockReturnValue(mockInvitationRepository);

    mockInvitationService = {
      revokeInvitation: jest.fn().mockResolvedValue(undefined),
    };
    (getInvitationService as jest.Mock).mockReturnValue(mockInvitationService);

    (getInvitationStatus as jest.Mock).mockReturnValue('pending');
  });

  describe('GET /api/system/invitations/[id]', () => {
    it('returns 401 if not authenticated', async () => {
      (requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123');
      const response = await GET(request, createContext('invitation-123'));

      expect(response.status).toBe(401);
    });

    it('returns 403 for non-system-admin', async () => {
      (requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'System admin access required' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123');
      const response = await GET(request, createContext('invitation-123'));

      expect(response.status).toBe(403);
    });

    it('returns 404 for non-existent invitation', async () => {
      mockInvitationRepository.getInvitation.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/system/invitations/non-existent');
      const response = await GET(request, createContext('non-existent'));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_NOT_FOUND');
    });

    it('returns invitation details', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123');
      const response = await GET(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.invitation.id).toBe('invitation-123');
      expect(data.invitation.email).toBe('invitee@example.com');
      expect(data.invitation.status).toBe('pending');
    });

    it('includes computed status', async () => {
      (getInvitationStatus as jest.Mock).mockReturnValue('expired');

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123');
      const response = await GET(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.invitation.status).toBe('expired');
    });

    it('serializes dates correctly', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123');
      const response = await GET(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.invitation.createdAt).toBe('string');
      expect(typeof data.invitation.expiresAt).toBe('string');
    });
  });

  describe('DELETE /api/system/invitations/[id]', () => {
    it('returns 401 if not authenticated', async () => {
      (requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('invitation-123'));

      expect(response.status).toBe(401);
    });

    it('returns 403 for non-system-admin', async () => {
      (requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'System admin access required' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('invitation-123'));

      expect(response.status).toBe(403);
    });

    it('returns 404 for non-existent invitation', async () => {
      const error = new Error('Invitation not found') as any;
      error.name = 'InvitationError';
      error.code = 'INVITATION_NOT_FOUND';
      mockInvitationService.revokeInvitation.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/system/invitations/non-existent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('non-existent'));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_NOT_FOUND');
    });

    it('returns 400 for already-consumed invitation', async () => {
      const error = new Error('Cannot revoke consumed invitation') as any;
      error.name = 'InvitationError';
      error.code = 'INVITATION_CONSUMED';
      mockInvitationService.revokeInvitation.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('invitation-123'));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_CONSUMED');
    });

    it('revokes invitation successfully', async () => {
      mockInvitationRepository.getInvitation.mockResolvedValue(mockRevokedInvitation);
      (getInvitationStatus as jest.Mock).mockReturnValue('revoked');

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      expect(mockInvitationService.revokeInvitation).toHaveBeenCalledWith('invitation-123');
      const data = await response.json();
      expect(data.invitation.status).toBe('revoked');
    });

    it('returns the updated invitation after revocation', async () => {
      mockInvitationRepository.getInvitation.mockResolvedValue(mockRevokedInvitation);

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.invitation.revokedAt).toBeDefined();
    });
  });
});
