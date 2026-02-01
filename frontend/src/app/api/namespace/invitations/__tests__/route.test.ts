/**
 * Tests for /api/namespace/invitations endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '../route';

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
  getInvitationStatus: jest.fn((invitation: { consumedAt?: Date; revokedAt?: Date; expiresAt: Date }) => {
    if (invitation.consumedAt) return 'consumed';
    if (invitation.revokedAt) return 'revoked';
    if (new Date(invitation.expiresAt) < new Date()) return 'expired';
    return 'pending';
  }),
}));

import { requirePermission, getNamespaceContext } from '@/server/auth/api-helpers';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';

describe('/api/namespace/invitations', () => {
  const mockNamespaceAdmin = {
    id: 'admin-123',
    email: 'admin@example.com',
    role: 'namespace-admin' as const,
    namespaceId: 'test-namespace',
    createdAt: new Date('2024-01-01'),
  };

  const mockInstructor = {
    id: 'instructor-123',
    email: 'instructor@example.com',
    role: 'instructor' as const,
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

  let mockInvitationRepository: {
    listInvitations: jest.Mock;
  };
  let mockInvitationService: {
    createInvitation: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default to namespace admin auth
    (requirePermission as jest.Mock).mockResolvedValue({
      user: mockNamespaceAdmin,
      rbac: { hasPermission: () => true },
    });

    (getNamespaceContext as jest.Mock).mockReturnValue('test-namespace');

    mockInvitationRepository = {
      listInvitations: jest.fn().mockResolvedValue([mockInvitation]),
    };
    (getInvitationRepository as jest.Mock).mockReturnValue(mockInvitationRepository);

    mockInvitationService = {
      createInvitation: jest.fn().mockResolvedValue(mockInvitation),
    };
    (getInvitationService as jest.Mock).mockReturnValue(mockInvitationService);
  });

  describe('GET /api/namespace/invitations', () => {
    it('returns 401 if not authenticated', async () => {
      (requirePermission as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/namespace/invitations');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('returns 403 for non-namespace-admin', async () => {
      (requirePermission as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Forbidden: Requires user.manage permission' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/namespace/invitations');
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it('returns only invitations for user namespace', async () => {
      const request = new NextRequest('http://localhost/api/namespace/invitations');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.invitations).toHaveLength(1);
      expect(data.invitations[0].id).toBe('invitation-123');
      expect(mockInvitationRepository.listInvitations).toHaveBeenCalledWith({
        namespaceId: 'test-namespace',
        status: null,
        targetRole: 'instructor',
        email: undefined,
      });
    });

    it('filters by status when provided', async () => {
      const request = new NextRequest(
        'http://localhost/api/namespace/invitations?status=pending'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockInvitationRepository.listInvitations).toHaveBeenCalledWith({
        namespaceId: 'test-namespace',
        status: 'pending',
        targetRole: 'instructor',
        email: undefined,
      });
    });

    it('filters by email when provided', async () => {
      const request = new NextRequest(
        'http://localhost/api/namespace/invitations?email=test'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockInvitationRepository.listInvitations).toHaveBeenCalledWith({
        namespaceId: 'test-namespace',
        status: null,
        targetRole: 'instructor',
        email: 'test',
      });
    });

    it('returns 400 for invalid status', async () => {
      const request = new NextRequest(
        'http://localhost/api/namespace/invitations?status=invalid'
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid status');
    });

    it('serializes dates correctly', async () => {
      const request = new NextRequest('http://localhost/api/namespace/invitations');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.invitations[0].createdAt).toBe('string');
      expect(typeof data.invitations[0].expiresAt).toBe('string');
    });
  });

  describe('POST /api/namespace/invitations', () => {
    const validBody = {
      email: 'new@example.com',
    };

    it('returns 401 if not authenticated', async () => {
      (requirePermission as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('returns 403 for non-namespace-admin', async () => {
      (requirePermission as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Forbidden: Requires user.manage permission' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
    });

    it('returns 400 when namespaceId is undefined (system-admin with no namespace)', async () => {
      (getNamespaceContext as jest.Mock).mockReturnValue(undefined);

      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: 'new@example.com' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Namespace is required');
    });

    it('returns 400 for missing email', async () => {
      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('MISSING_EMAIL');
    });

    it('returns 400 for invalid email format', async () => {
      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_EMAIL');
    });

    it('returns 400 for invalid expiresInDays', async () => {
      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, expiresInDays: 0 }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_EXPIRY');
    });

    it('creates instructor invitation in user namespace', async () => {
      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.invitation.id).toBe('invitation-123');
      expect(mockInvitationService.createInvitation).toHaveBeenCalledWith({
        email: 'new@example.com',
        namespaceId: 'test-namespace',
        targetRole: 'instructor', // Always instructor
        createdBy: 'admin-123',
        expiresInDays: undefined,
      });
    });

    it('normalizes email to lowercase', async () => {
      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: '  NEW@EXAMPLE.COM  ' }),
      });
      await POST(request);

      expect(mockInvitationService.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' })
      );
    });

    it('passes expiresInDays when provided', async () => {
      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, expiresInDays: 14 }),
      });
      await POST(request);

      expect(mockInvitationService.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInDays: 14 })
      );
    });

    it('returns 409 for duplicate invitation', async () => {
      const error = new Error('Duplicate invitation') as Error & { name: string; code: string };
      error.name = 'InvitationError';
      error.code = 'DUPLICATE_INVITATION';
      mockInvitationService.createInvitation.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.code).toBe('DUPLICATE_INVITATION');
    });

    it('returns 400 for namespace at capacity', async () => {
      const error = new Error('Namespace at capacity') as Error & { name: string; code: string };
      error.name = 'InvitationError';
      error.code = 'NAMESPACE_AT_CAPACITY';
      mockInvitationService.createInvitation.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('NAMESPACE_AT_CAPACITY');
    });

    it('always uses instructor as target role regardless of body', async () => {
      // Even if someone tries to pass a different role, it should be ignored
      const request = new NextRequest('http://localhost/api/namespace/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, targetRole: 'namespace-admin' }),
      });
      await POST(request);

      expect(mockInvitationService.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ targetRole: 'instructor' })
      );
    });
  });
});
