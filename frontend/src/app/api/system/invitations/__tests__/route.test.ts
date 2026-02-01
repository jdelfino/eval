/**
 * Tests for /api/system/invitations endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, POST } from '../route';

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
}));

import { requireSystemAdmin } from '@/server/auth/api-helpers';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';

describe('/api/system/invitations', () => {
  const mockSystemAdmin = {
    id: 'admin-123',
    email: 'admin@example.com',
    role: 'system-admin' as const,
    namespaceId: null,
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

  let mockInvitationRepository: any;
  let mockInvitationService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default to system admin auth
    (requireSystemAdmin as jest.Mock).mockResolvedValue({
      user: mockSystemAdmin,
      rbac: { hasPermission: () => true },
    });

    mockInvitationRepository = {
      listInvitations: jest.fn().mockResolvedValue([mockInvitation]),
    };
    (getInvitationRepository as jest.Mock).mockReturnValue(mockInvitationRepository);

    mockInvitationService = {
      createInvitation: jest.fn().mockResolvedValue(mockInvitation),
    };
    (getInvitationService as jest.Mock).mockReturnValue(mockInvitationService);
  });

  describe('GET /api/system/invitations', () => {
    it('returns 401 if not authenticated', async () => {
      (requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/system/invitations');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('returns 403 for non-system-admin', async () => {
      (requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'System admin access required' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/system/invitations');
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it('returns all invitations without filters', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.invitations).toHaveLength(1);
      expect(data.invitations[0].id).toBe('invitation-123');
      expect(mockInvitationRepository.listInvitations).toHaveBeenCalledWith({
        namespaceId: undefined,
        status: null,
        targetRole: null,
        email: undefined,
      });
    });

    it('passes filters to repository', async () => {
      const request = new NextRequest(
        'http://localhost/api/system/invitations?namespaceId=ns1&status=pending&targetRole=instructor&email=test'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockInvitationRepository.listInvitations).toHaveBeenCalledWith({
        namespaceId: 'ns1',
        status: 'pending',
        targetRole: 'instructor',
        email: 'test',
      });
    });

    it('returns 400 for invalid status', async () => {
      const request = new NextRequest(
        'http://localhost/api/system/invitations?status=invalid'
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid status');
    });

    it('returns 400 for invalid targetRole', async () => {
      const request = new NextRequest(
        'http://localhost/api/system/invitations?targetRole=student'
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid targetRole');
    });

    it('serializes dates correctly', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(typeof data.invitations[0].createdAt).toBe('string');
      expect(typeof data.invitations[0].expiresAt).toBe('string');
    });
  });

  describe('POST /api/system/invitations', () => {
    const validBody = {
      email: 'new@example.com',
      namespaceId: 'test-namespace',
      targetRole: 'instructor',
    };

    it('returns 401 if not authenticated', async () => {
      (requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );

      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('returns 403 for non-system-admin', async () => {
      (requireSystemAdmin as jest.Mock).mockResolvedValue(
        NextResponse.json({ error: 'System admin access required' }, { status: 403 })
      );

      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
    });

    it('returns 400 for missing email', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, email: undefined }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('MISSING_EMAIL');
    });

    it('returns 400 for missing namespaceId', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, namespaceId: undefined }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('MISSING_NAMESPACE');
    });

    it('returns 400 for missing targetRole', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, targetRole: undefined }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('MISSING_ROLE');
    });

    it('returns 400 for invalid email format', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, email: 'not-an-email' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_EMAIL');
    });

    it('returns 400 for invalid targetRole', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, targetRole: 'student' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_ROLE');
    });

    it('returns 400 for invalid expiresInDays', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, expiresInDays: 0 }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_EXPIRY');
    });

    it('creates invitation successfully', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations', {
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
        targetRole: 'instructor',
        createdBy: 'admin-123',
        expiresInDays: undefined,
      });
    });

    it('normalizes email to lowercase', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, email: '  NEW@EXAMPLE.COM  ' }),
      });
      await POST(request);

      expect(mockInvitationService.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' })
      );
    });

    it('passes expiresInDays when provided', async () => {
      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, expiresInDays: 14 }),
      });
      await POST(request);

      expect(mockInvitationService.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInDays: 14 })
      );
    });

    it('returns 409 for duplicate invitation', async () => {
      const error = new Error('Duplicate invitation') as any;
      error.name = 'InvitationError';
      error.code = 'DUPLICATE_INVITATION';
      mockInvitationService.createInvitation.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.code).toBe('DUPLICATE_INVITATION');
    });

    it('returns 400 for namespace at capacity', async () => {
      const error = new Error('Namespace at capacity') as any;
      error.name = 'InvitationError';
      error.code = 'NAMESPACE_AT_CAPACITY';
      mockInvitationService.createInvitation.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/system/invitations', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('NAMESPACE_AT_CAPACITY');
    });
  });
});
