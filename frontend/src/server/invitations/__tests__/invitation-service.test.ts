/**
 * Tests for InvitationService
 */

import { InvitationService } from '../invitation-service';
import { CapacityService } from '../capacity-service';
import { IInvitationRepository } from '../interfaces';
import { Invitation, InvitationError } from '../types';
import { SupabaseClient } from '@supabase/supabase-js';

describe('InvitationService', () => {
  let invitationService: InvitationService;
  let mockInvitationRepo: jest.Mocked<IInvitationRepository>;
  let mockCapacityService: jest.Mocked<CapacityService>;
  let mockSupabaseAdmin: {
    auth: {
      admin: {
        inviteUserByEmail: jest.Mock;
      };
    };
  };

  const appUrl = 'https://app.example.com';

  // Helper to create a mock invitation with future expiry
  function createMockInvitation(overrides: Partial<Invitation> = {}): Invitation {
    // Use a date 7 days in the future to ensure the invitation is not expired
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    return {
      id: 'inv-123',
      email: 'test@example.com',
      targetRole: 'instructor',
      namespaceId: 'test-namespace',
      createdBy: 'admin-user',
      createdAt: new Date(),
      expiresAt: futureDate,
      ...overrides,
    };
  }

  beforeEach(() => {
    mockInvitationRepo = {
      initialize: jest.fn(),
      shutdown: jest.fn(),
      health: jest.fn(),
      createInvitation: jest.fn(),
      getInvitation: jest.fn(),
      getInvitationBySupabaseUserId: jest.fn(),
      getPendingInvitationByEmail: jest.fn(),
      listInvitations: jest.fn(),
      updateInvitation: jest.fn(),
      consumeInvitation: jest.fn(),
      revokeInvitation: jest.fn(),
      countPendingInvitations: jest.fn(),
    };

    mockCapacityService = {
      getCapacityUsage: jest.fn(),
      canAddUser: jest.fn(),
      enforceCapacity: jest.fn(),
    } as unknown as jest.Mocked<CapacityService>;

    mockSupabaseAdmin = {
      auth: {
        admin: {
          inviteUserByEmail: jest.fn(),
        },
      },
    };

    invitationService = new InvitationService(
      mockInvitationRepo,
      mockCapacityService,
      mockSupabaseAdmin as unknown as SupabaseClient,
      appUrl
    );
  });

  describe('createInvitation', () => {
    it('creates invitation and sends email via Supabase', async () => {
      const mockInvitation = createMockInvitation();
      mockInvitationRepo.getPendingInvitationByEmail.mockResolvedValue(null);
      mockCapacityService.enforceCapacity.mockResolvedValue(undefined);
      mockInvitationRepo.createInvitation.mockResolvedValue(mockInvitation);
      mockSupabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'supabase-user-123' } },
        error: null,
      });
      mockInvitationRepo.updateInvitation.mockResolvedValue({
        ...mockInvitation,
        supabaseUserId: 'supabase-user-123',
      });

      const result = await invitationService.createInvitation({
        email: 'TEST@example.com',
        namespaceId: 'test-namespace',
        targetRole: 'instructor',
        createdBy: 'admin-user',
      });

      // Email should be normalized
      expect(mockInvitationRepo.getPendingInvitationByEmail).toHaveBeenCalledWith(
        'test@example.com',
        'test-namespace'
      );

      // Capacity should be checked
      expect(mockCapacityService.enforceCapacity).toHaveBeenCalledWith(
        'test-namespace',
        'instructor'
      );

      // Invitation should be created
      expect(mockInvitationRepo.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          namespaceId: 'test-namespace',
          targetRole: 'instructor',
          createdBy: 'admin-user',
        })
      );

      // Supabase should be called
      expect(mockSupabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
        'test@example.com',
        {
          redirectTo: `${appUrl}/invite/accept`,
          data: {
            invitationId: mockInvitation.id,
            targetRole: 'instructor',
            namespaceId: 'test-namespace',
          },
        }
      );

      // Supabase user ID should be stored
      expect(mockInvitationRepo.updateInvitation).toHaveBeenCalledWith(mockInvitation.id, {
        supabaseUserId: 'supabase-user-123',
      });

      expect(result.supabaseUserId).toBe('supabase-user-123');
    });

    it('throws INVALID_EMAIL for invalid email format', async () => {
      await expect(
        invitationService.createInvitation({
          email: 'not-an-email',
          namespaceId: 'test-namespace',
          targetRole: 'instructor',
          createdBy: 'admin-user',
        })
      ).rejects.toThrow(InvitationError);

      try {
        await invitationService.createInvitation({
          email: 'not-an-email',
          namespaceId: 'test-namespace',
          targetRole: 'instructor',
          createdBy: 'admin-user',
        });
      } catch (error) {
        expect((error as InvitationError).code).toBe('INVALID_EMAIL');
      }
    });

    it('throws DUPLICATE_INVITATION for existing pending invitation', async () => {
      mockInvitationRepo.getPendingInvitationByEmail.mockResolvedValue(createMockInvitation());

      await expect(
        invitationService.createInvitation({
          email: 'test@example.com',
          namespaceId: 'test-namespace',
          targetRole: 'instructor',
          createdBy: 'admin-user',
        })
      ).rejects.toThrow(InvitationError);

      try {
        await invitationService.createInvitation({
          email: 'test@example.com',
          namespaceId: 'test-namespace',
          targetRole: 'instructor',
          createdBy: 'admin-user',
        });
      } catch (error) {
        expect((error as InvitationError).code).toBe('DUPLICATE_INVITATION');
      }
    });

    it('throws NAMESPACE_AT_CAPACITY when capacity limit reached', async () => {
      mockInvitationRepo.getPendingInvitationByEmail.mockResolvedValue(null);
      mockCapacityService.enforceCapacity.mockRejectedValue(
        new InvitationError('Namespace is at capacity for instructors', 'NAMESPACE_AT_CAPACITY')
      );

      await expect(
        invitationService.createInvitation({
          email: 'test@example.com',
          namespaceId: 'test-namespace',
          targetRole: 'instructor',
          createdBy: 'admin-user',
        })
      ).rejects.toThrow(InvitationError);

      try {
        await invitationService.createInvitation({
          email: 'test@example.com',
          namespaceId: 'test-namespace',
          targetRole: 'instructor',
          createdBy: 'admin-user',
        });
      } catch (error) {
        expect((error as InvitationError).code).toBe('NAMESPACE_AT_CAPACITY');
      }
    });

    it('cleans up invitation if Supabase email fails', async () => {
      const mockInvitation = createMockInvitation();
      mockInvitationRepo.getPendingInvitationByEmail.mockResolvedValue(null);
      mockCapacityService.enforceCapacity.mockResolvedValue(undefined);
      mockInvitationRepo.createInvitation.mockResolvedValue(mockInvitation);
      mockSupabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: null,
        error: { message: 'Email service unavailable' },
      });
      mockInvitationRepo.revokeInvitation.mockResolvedValue(mockInvitation);

      await expect(
        invitationService.createInvitation({
          email: 'test@example.com',
          namespaceId: 'test-namespace',
          targetRole: 'instructor',
          createdBy: 'admin-user',
        })
      ).rejects.toThrow('Failed to send invitation email: Email service unavailable');

      // Should attempt to clean up the invitation
      expect(mockInvitationRepo.revokeInvitation).toHaveBeenCalledWith(mockInvitation.id);
    });

    it('uses custom expiry days when provided', async () => {
      const mockInvitation = createMockInvitation();
      mockInvitationRepo.getPendingInvitationByEmail.mockResolvedValue(null);
      mockCapacityService.enforceCapacity.mockResolvedValue(undefined);
      mockInvitationRepo.createInvitation.mockResolvedValue(mockInvitation);
      mockSupabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'supabase-user-123' } },
        error: null,
      });
      mockInvitationRepo.updateInvitation.mockResolvedValue(mockInvitation);

      await invitationService.createInvitation({
        email: 'test@example.com',
        namespaceId: 'test-namespace',
        targetRole: 'instructor',
        createdBy: 'admin-user',
        expiresInDays: 14,
      });

      expect(mockInvitationRepo.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.any(Date),
        })
      );

      // Verify expiry is approximately 14 days from now
      const createCall = mockInvitationRepo.createInvitation.mock.calls[0][0];
      const expiresAt = createCall.expiresAt as Date;
      const now = new Date();
      const daysDiff = Math.round(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysDiff).toBe(14);
    });
  });

  describe('getInvitation', () => {
    it('returns invitation when found', async () => {
      const mockInvitation = createMockInvitation();
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);

      const result = await invitationService.getInvitation('inv-123');

      expect(result).toEqual(mockInvitation);
      expect(mockInvitationRepo.getInvitation).toHaveBeenCalledWith('inv-123');
    });

    it('returns null when not found', async () => {
      mockInvitationRepo.getInvitation.mockResolvedValue(null);

      const result = await invitationService.getInvitation('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getInvitationForUser', () => {
    it('returns invitation for Supabase user ID', async () => {
      const mockInvitation = createMockInvitation({ supabaseUserId: 'supabase-user-123' });
      mockInvitationRepo.getInvitationBySupabaseUserId.mockResolvedValue(mockInvitation);

      const result = await invitationService.getInvitationForUser('supabase-user-123');

      expect(result).toEqual(mockInvitation);
      expect(mockInvitationRepo.getInvitationBySupabaseUserId).toHaveBeenCalledWith(
        'supabase-user-123'
      );
    });

    it('returns null when no invitation for user', async () => {
      mockInvitationRepo.getInvitationBySupabaseUserId.mockResolvedValue(null);

      const result = await invitationService.getInvitationForUser('unknown-user');

      expect(result).toBeNull();
    });
  });

  describe('consumeInvitation', () => {
    it('marks invitation as consumed', async () => {
      const mockInvitation = createMockInvitation();
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);
      mockInvitationRepo.consumeInvitation.mockResolvedValue({
        ...mockInvitation,
        consumedAt: new Date(),
        consumedBy: 'new-user-id',
      });

      await invitationService.consumeInvitation('inv-123', 'new-user-id');

      expect(mockInvitationRepo.consumeInvitation).toHaveBeenCalledWith('inv-123', 'new-user-id');
    });

    it('throws INVITATION_NOT_FOUND for nonexistent invitation', async () => {
      mockInvitationRepo.getInvitation.mockResolvedValue(null);

      await expect(
        invitationService.consumeInvitation('nonexistent', 'user-id')
      ).rejects.toThrow(InvitationError);

      try {
        await invitationService.consumeInvitation('nonexistent', 'user-id');
      } catch (error) {
        expect((error as InvitationError).code).toBe('INVITATION_NOT_FOUND');
      }
    });

    it('throws INVITATION_CONSUMED for already consumed invitation', async () => {
      const mockInvitation = createMockInvitation({
        consumedAt: new Date('2026-01-05'),
        consumedBy: 'another-user',
      });
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);

      await expect(
        invitationService.consumeInvitation('inv-123', 'user-id')
      ).rejects.toThrow(InvitationError);

      try {
        await invitationService.consumeInvitation('inv-123', 'user-id');
      } catch (error) {
        expect((error as InvitationError).code).toBe('INVITATION_CONSUMED');
      }
    });

    it('throws INVITATION_REVOKED for revoked invitation', async () => {
      const mockInvitation = createMockInvitation({
        revokedAt: new Date('2026-01-05'),
      });
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);

      await expect(
        invitationService.consumeInvitation('inv-123', 'user-id')
      ).rejects.toThrow(InvitationError);

      try {
        await invitationService.consumeInvitation('inv-123', 'user-id');
      } catch (error) {
        expect((error as InvitationError).code).toBe('INVITATION_REVOKED');
      }
    });

    it('throws INVITATION_EXPIRED for expired invitation', async () => {
      const mockInvitation = createMockInvitation({
        expiresAt: new Date('2020-01-01'), // Past date
      });
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);

      await expect(
        invitationService.consumeInvitation('inv-123', 'user-id')
      ).rejects.toThrow(InvitationError);

      try {
        await invitationService.consumeInvitation('inv-123', 'user-id');
      } catch (error) {
        expect((error as InvitationError).code).toBe('INVITATION_EXPIRED');
      }
    });
  });

  describe('revokeInvitation', () => {
    it('revokes pending invitation', async () => {
      const mockInvitation = createMockInvitation();
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);
      mockInvitationRepo.revokeInvitation.mockResolvedValue({
        ...mockInvitation,
        revokedAt: new Date(),
      });

      await invitationService.revokeInvitation('inv-123');

      expect(mockInvitationRepo.revokeInvitation).toHaveBeenCalledWith('inv-123');
    });

    it('throws INVITATION_NOT_FOUND for nonexistent invitation', async () => {
      mockInvitationRepo.getInvitation.mockResolvedValue(null);

      await expect(invitationService.revokeInvitation('nonexistent')).rejects.toThrow(
        InvitationError
      );

      try {
        await invitationService.revokeInvitation('nonexistent');
      } catch (error) {
        expect((error as InvitationError).code).toBe('INVITATION_NOT_FOUND');
      }
    });

    it('throws INVITATION_CONSUMED for consumed invitation', async () => {
      const mockInvitation = createMockInvitation({
        consumedAt: new Date('2026-01-05'),
        consumedBy: 'user-id',
      });
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);

      await expect(invitationService.revokeInvitation('inv-123')).rejects.toThrow(
        InvitationError
      );

      try {
        await invitationService.revokeInvitation('inv-123');
      } catch (error) {
        expect((error as InvitationError).code).toBe('INVITATION_CONSUMED');
      }
    });

    it('is idempotent for already revoked invitation', async () => {
      const mockInvitation = createMockInvitation({
        revokedAt: new Date('2026-01-05'),
      });
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);

      await invitationService.revokeInvitation('inv-123');

      // Should not call revokeInvitation again
      expect(mockInvitationRepo.revokeInvitation).not.toHaveBeenCalled();
    });
  });

  describe('resendInvitation', () => {
    it('resends invitation email via Supabase', async () => {
      const mockInvitation = createMockInvitation({ supabaseUserId: 'old-user-id' });
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);
      mockSupabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'new-user-id' } },
        error: null,
      });
      mockInvitationRepo.updateInvitation.mockResolvedValue({
        ...mockInvitation,
        supabaseUserId: 'new-user-id',
      });

      const result = await invitationService.resendInvitation('inv-123');

      expect(mockSupabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
        mockInvitation.email,
        {
          redirectTo: `${appUrl}/invite/accept`,
          data: {
            invitationId: mockInvitation.id,
            targetRole: mockInvitation.targetRole,
            namespaceId: mockInvitation.namespaceId,
          },
        }
      );

      // Should update supabaseUserId if changed
      expect(mockInvitationRepo.updateInvitation).toHaveBeenCalledWith(mockInvitation.id, {
        supabaseUserId: 'new-user-id',
      });

      expect(result.supabaseUserId).toBe('new-user-id');
    });

    it('throws INVITATION_NOT_FOUND for nonexistent invitation', async () => {
      mockInvitationRepo.getInvitation.mockResolvedValue(null);

      await expect(invitationService.resendInvitation('nonexistent')).rejects.toThrow(
        InvitationError
      );

      try {
        await invitationService.resendInvitation('nonexistent');
      } catch (error) {
        expect((error as InvitationError).code).toBe('INVITATION_NOT_FOUND');
      }
    });

    it('throws INVITATION_CONSUMED for consumed invitation', async () => {
      const mockInvitation = createMockInvitation({
        consumedAt: new Date('2026-01-05'),
        consumedBy: 'user-id',
      });
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);

      await expect(invitationService.resendInvitation('inv-123')).rejects.toThrow(
        InvitationError
      );

      try {
        await invitationService.resendInvitation('inv-123');
      } catch (error) {
        expect((error as InvitationError).code).toBe('INVITATION_CONSUMED');
      }
    });

    it('throws INVITATION_REVOKED for revoked invitation', async () => {
      const mockInvitation = createMockInvitation({
        revokedAt: new Date('2026-01-05'),
      });
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);

      await expect(invitationService.resendInvitation('inv-123')).rejects.toThrow(
        InvitationError
      );

      try {
        await invitationService.resendInvitation('inv-123');
      } catch (error) {
        expect((error as InvitationError).code).toBe('INVITATION_REVOKED');
      }
    });

    it('can resend expired invitation (to extend window)', async () => {
      const mockInvitation = createMockInvitation({
        expiresAt: new Date('2020-01-01'), // Past date
      });
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);
      mockSupabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'supabase-user-123' } },
        error: null,
      });

      // Should not throw for expired invitation
      await expect(invitationService.resendInvitation('inv-123')).resolves.toBeDefined();
    });

    it('throws error when Supabase email fails', async () => {
      const mockInvitation = createMockInvitation();
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);
      mockSupabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: null,
        error: { message: 'Rate limit exceeded' },
      });

      await expect(invitationService.resendInvitation('inv-123')).rejects.toThrow(
        'Failed to resend invitation email: Rate limit exceeded'
      );
    });

    it('does not update supabaseUserId if unchanged', async () => {
      const mockInvitation = createMockInvitation({ supabaseUserId: 'same-user-id' });
      mockInvitationRepo.getInvitation.mockResolvedValue(mockInvitation);
      mockSupabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'same-user-id' } },
        error: null,
      });

      await invitationService.resendInvitation('inv-123');

      // Should not call updateInvitation if ID is the same
      expect(mockInvitationRepo.updateInvitation).not.toHaveBeenCalled();
    });
  });

  describe('listInvitations', () => {
    it('delegates to repository without filters', async () => {
      const mockInvitations = [createMockInvitation()];
      mockInvitationRepo.listInvitations.mockResolvedValue(mockInvitations);

      const result = await invitationService.listInvitations();

      expect(result).toEqual(mockInvitations);
      expect(mockInvitationRepo.listInvitations).toHaveBeenCalledWith(undefined);
    });

    it('delegates to repository with filters', async () => {
      const mockInvitations = [createMockInvitation()];
      mockInvitationRepo.listInvitations.mockResolvedValue(mockInvitations);

      const filters = {
        namespaceId: 'test-namespace',
        status: 'pending' as const,
        targetRole: 'instructor' as const,
      };

      const result = await invitationService.listInvitations(filters);

      expect(result).toEqual(mockInvitations);
      expect(mockInvitationRepo.listInvitations).toHaveBeenCalledWith(filters);
    });
  });
});
