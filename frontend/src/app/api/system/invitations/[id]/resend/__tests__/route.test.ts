/**
 * Tests for /api/system/invitations/[id]/resend endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { POST } from '../route';

// Mock dependencies
jest.mock('@/server/auth/api-helpers', () => ({
  requireSystemAdmin: jest.fn(),
}));

jest.mock('@/server/invitations', () => ({
  getInvitationService: jest.fn(),
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
import { getInvitationService } from '@/server/invitations';
import { getInvitationStatus } from '@/server/invitations/types';

describe('/api/system/invitations/[id]/resend', () => {
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

    mockInvitationService = {
      resendInvitation: jest.fn().mockResolvedValue(mockInvitation),
    };
    (getInvitationService as jest.Mock).mockReturnValue(mockInvitationService);

    (getInvitationStatus as jest.Mock).mockReturnValue('pending');
  });

  describe('POST /api/system/invitations/[id]/resend', () => {
    it('returns 401 if not authenticated', async () => {
      (requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123/resend', {
        method: 'POST',
      });
      const response = await POST(request, createContext('invitation-123'));

      expect(response.status).toBe(401);
    });

    it('returns 403 for non-system-admin', async () => {
      (requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'System admin access required' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123/resend', {
        method: 'POST',
      });
      const response = await POST(request, createContext('invitation-123'));

      expect(response.status).toBe(403);
    });

    it('returns 404 for non-existent invitation', async () => {
      const error = new Error('Invitation not found') as any;
      error.name = 'InvitationError';
      error.code = 'INVITATION_NOT_FOUND';
      mockInvitationService.resendInvitation.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/system/invitations/non-existent/resend', {
        method: 'POST',
      });
      const response = await POST(request, createContext('non-existent'));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_NOT_FOUND');
    });

    it('returns 400 for consumed invitation', async () => {
      const error = new Error('Cannot resend consumed invitation') as any;
      error.name = 'InvitationError';
      error.code = 'INVITATION_CONSUMED';
      mockInvitationService.resendInvitation.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123/resend', {
        method: 'POST',
      });
      const response = await POST(request, createContext('invitation-123'));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_CONSUMED');
    });

    it('returns 400 for revoked invitation', async () => {
      const error = new Error('Cannot resend revoked invitation') as any;
      error.name = 'InvitationError';
      error.code = 'INVITATION_REVOKED';
      mockInvitationService.resendInvitation.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123/resend', {
        method: 'POST',
      });
      const response = await POST(request, createContext('invitation-123'));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVITATION_REVOKED');
    });

    it('resends invitation successfully', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123/resend', {
        method: 'POST',
      });
      const response = await POST(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      expect(mockInvitationService.resendInvitation).toHaveBeenCalledWith('invitation-123');
      const data = await response.json();
      expect(data.invitation.id).toBe('invitation-123');
    });

    it('includes computed status in response', async () => {
      (getInvitationStatus as jest.Mock).mockReturnValue('expired');

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123/resend', {
        method: 'POST',
      });
      const response = await POST(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.invitation.status).toBe('expired');
    });

    it('returns 502 when email sending fails', async () => {
      mockInvitationService.resendInvitation.mockRejectedValue(
        new Error('Failed to send invitation email: SMTP error')
      );

      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123/resend', {
        method: 'POST',
      });
      const response = await POST(request, createContext('invitation-123'));

      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.code).toBe('EMAIL_SEND_FAILED');
    });

    it('serializes dates correctly', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations/invitation-123/resend', {
        method: 'POST',
      });
      const response = await POST(request, createContext('invitation-123'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.invitation.createdAt).toBe('string');
      expect(typeof data.invitation.expiresAt).toBe('string');
    });
  });
});
