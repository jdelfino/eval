/**
 * Tests for CapacityService
 */

import { CapacityService } from '../capacity-service';
import { NamespaceCapacityUsage } from '../../auth/types';
import { INamespaceRepository } from '../../auth/interfaces';
import { IInvitationRepository } from '../interfaces';
import { InvitationError } from '../types';

describe('CapacityService', () => {
  let capacityService: CapacityService;
  let mockNamespaceRepo: jest.Mocked<INamespaceRepository>;
  let mockInvitationRepo: jest.Mocked<IInvitationRepository>;

  beforeEach(() => {
    mockNamespaceRepo = {
      initialize: jest.fn(),
      createNamespace: jest.fn(),
      getNamespace: jest.fn(),
      listNamespaces: jest.fn(),
      updateNamespace: jest.fn(),
      deleteNamespace: jest.fn(),
      namespaceExists: jest.fn(),
      getCapacityUsage: jest.fn(),
      updateCapacityLimits: jest.fn(),
    };

    mockInvitationRepo = {
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

    capacityService = new CapacityService(mockNamespaceRepo, mockInvitationRepo);
  });

  describe('getCapacityUsage', () => {
    it('returns null for non-existent namespace', async () => {
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(null);

      const result = await capacityService.getCapacityUsage('nonexistent');

      expect(result).toBeNull();
    });

    it('returns capacity usage with pending invitation counts', async () => {
      const baseUsage: NamespaceCapacityUsage = {
        instructorCount: 3,
        studentCount: 10,
        maxInstructors: 10,
        maxStudents: 50,
      };
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(baseUsage);
      mockInvitationRepo.countPendingInvitations
        .mockResolvedValueOnce(2) // instructors
        .mockResolvedValueOnce(1); // namespace-admins

      const result = await capacityService.getCapacityUsage('test-namespace');

      expect(result).toEqual({
        ...baseUsage,
        pendingInstructorInvitations: 2,
        pendingNamespaceAdminInvitations: 1,
        effectiveInstructorCount: 6, // 3 + 2 + 1
      });
    });

    it('includes pending namespace-admin invitations in effective instructor count', async () => {
      const baseUsage: NamespaceCapacityUsage = {
        instructorCount: 5,
        studentCount: 20,
        maxInstructors: 10,
        maxStudents: null,
      };
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(baseUsage);
      mockInvitationRepo.countPendingInvitations
        .mockResolvedValueOnce(0) // instructors
        .mockResolvedValueOnce(3); // namespace-admins

      const result = await capacityService.getCapacityUsage('test-namespace');

      expect(result?.effectiveInstructorCount).toBe(8); // 5 + 0 + 3
    });

    it('handles namespaces with no pending invitations', async () => {
      const baseUsage: NamespaceCapacityUsage = {
        instructorCount: 2,
        studentCount: 5,
        maxInstructors: null,
        maxStudents: null,
      };
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(baseUsage);
      mockInvitationRepo.countPendingInvitations
        .mockResolvedValue(0);

      const result = await capacityService.getCapacityUsage('empty-namespace');

      expect(result).toEqual({
        ...baseUsage,
        pendingInstructorInvitations: 0,
        pendingNamespaceAdminInvitations: 0,
        effectiveInstructorCount: 2,
      });
    });
  });

  describe('canAddUser', () => {
    it('throws error for non-existent namespace', async () => {
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(null);

      await expect(
        capacityService.canAddUser('nonexistent', 'instructor')
      ).rejects.toThrow('Namespace not found: nonexistent');
    });

    describe('instructor role', () => {
      it('returns true when under capacity', async () => {
        mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
          instructorCount: 3,
          studentCount: 10,
          maxInstructors: 10,
          maxStudents: 50,
        });
        mockInvitationRepo.countPendingInvitations.mockResolvedValue(0);

        const result = await capacityService.canAddUser('test-ns', 'instructor');

        expect(result).toBe(true);
      });

      it('returns false when at capacity', async () => {
        mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
          instructorCount: 8,
          studentCount: 10,
          maxInstructors: 10,
          maxStudents: 50,
        });
        mockInvitationRepo.countPendingInvitations
          .mockResolvedValueOnce(1) // instructors
          .mockResolvedValueOnce(1); // namespace-admins

        const result = await capacityService.canAddUser('test-ns', 'instructor');

        expect(result).toBe(false); // 8 + 1 + 1 = 10 (at limit)
      });

      it('returns true when maxInstructors is null (unlimited)', async () => {
        mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
          instructorCount: 1000,
          studentCount: 10,
          maxInstructors: null,
          maxStudents: 50,
        });
        mockInvitationRepo.countPendingInvitations.mockResolvedValue(0);

        const result = await capacityService.canAddUser('test-ns', 'instructor');

        expect(result).toBe(true);
      });

      it('considers pending invitations in capacity check', async () => {
        mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
          instructorCount: 5,
          studentCount: 10,
          maxInstructors: 10,
          maxStudents: 50,
        });
        mockInvitationRepo.countPendingInvitations
          .mockResolvedValueOnce(3) // instructors
          .mockResolvedValueOnce(2); // namespace-admins

        const result = await capacityService.canAddUser('test-ns', 'instructor');

        expect(result).toBe(false); // 5 + 3 + 2 = 10 (at limit)
      });
    });

    describe('namespace-admin role', () => {
      it('counts against instructor limit', async () => {
        mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
          instructorCount: 9,
          studentCount: 10,
          maxInstructors: 10,
          maxStudents: 50,
        });
        mockInvitationRepo.countPendingInvitations.mockResolvedValue(0);

        const result = await capacityService.canAddUser('test-ns', 'namespace-admin');

        expect(result).toBe(true); // 9 < 10
      });

      it('returns false when instructor limit reached', async () => {
        mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
          instructorCount: 10,
          studentCount: 10,
          maxInstructors: 10,
          maxStudents: 50,
        });
        mockInvitationRepo.countPendingInvitations.mockResolvedValue(0);

        const result = await capacityService.canAddUser('test-ns', 'namespace-admin');

        expect(result).toBe(false);
      });
    });

    describe('student role', () => {
      it('returns true when under capacity', async () => {
        mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
          instructorCount: 5,
          studentCount: 40,
          maxInstructors: 10,
          maxStudents: 50,
        });
        mockInvitationRepo.countPendingInvitations.mockResolvedValue(0);

        const result = await capacityService.canAddUser('test-ns', 'student');

        expect(result).toBe(true);
      });

      it('returns false when at capacity', async () => {
        mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
          instructorCount: 5,
          studentCount: 50,
          maxInstructors: 10,
          maxStudents: 50,
        });
        mockInvitationRepo.countPendingInvitations.mockResolvedValue(0);

        const result = await capacityService.canAddUser('test-ns', 'student');

        expect(result).toBe(false);
      });

      it('returns true when maxStudents is null (unlimited)', async () => {
        mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
          instructorCount: 5,
          studentCount: 10000,
          maxInstructors: 10,
          maxStudents: null,
        });
        mockInvitationRepo.countPendingInvitations.mockResolvedValue(0);

        const result = await capacityService.canAddUser('test-ns', 'student');

        expect(result).toBe(true);
      });

      it('does not consider pending invitations (students use join codes)', async () => {
        mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
          instructorCount: 5,
          studentCount: 49,
          maxInstructors: 10,
          maxStudents: 50,
        });
        mockInvitationRepo.countPendingInvitations.mockResolvedValue(10);

        const result = await capacityService.canAddUser('test-ns', 'student');

        // Students don't have pending invitations, only check studentCount
        expect(result).toBe(true);
      });
    });
  });

  describe('enforceCapacity', () => {
    it('does not throw when capacity is available', async () => {
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
        instructorCount: 5,
        studentCount: 20,
        maxInstructors: 10,
        maxStudents: 50,
      });
      mockInvitationRepo.countPendingInvitations.mockResolvedValue(0);

      await expect(
        capacityService.enforceCapacity('test-ns', 'instructor')
      ).resolves.not.toThrow();
    });

    it('throws InvitationError with NAMESPACE_AT_CAPACITY when at limit', async () => {
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
        instructorCount: 10,
        studentCount: 20,
        maxInstructors: 10,
        maxStudents: 50,
      });
      mockInvitationRepo.countPendingInvitations.mockResolvedValue(0);

      await expect(
        capacityService.enforceCapacity('test-ns', 'instructor')
      ).rejects.toThrow(InvitationError);

      try {
        await capacityService.enforceCapacity('test-ns', 'instructor');
      } catch (error) {
        expect(error).toBeInstanceOf(InvitationError);
        expect((error as InvitationError).code).toBe('NAMESPACE_AT_CAPACITY');
        expect((error as InvitationError).message).toContain('instructors');
        expect((error as InvitationError).message).toContain('10/10');
      }
    });

    it('throws InvitationError for students at capacity', async () => {
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
        instructorCount: 5,
        studentCount: 50,
        maxInstructors: 10,
        maxStudents: 50,
      });
      mockInvitationRepo.countPendingInvitations.mockResolvedValue(0);

      try {
        await capacityService.enforceCapacity('test-ns', 'student');
        fail('Expected InvitationError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvitationError);
        expect((error as InvitationError).code).toBe('NAMESPACE_AT_CAPACITY');
        expect((error as InvitationError).message).toContain('students');
        expect((error as InvitationError).message).toContain('50/50');
      }
    });

    it('throws Error for non-existent namespace', async () => {
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue(null);

      await expect(
        capacityService.enforceCapacity('nonexistent', 'instructor')
      ).rejects.toThrow('Namespace not found: nonexistent');
    });

    it('considers pending invitations when enforcing capacity', async () => {
      mockNamespaceRepo.getCapacityUsage.mockResolvedValue({
        instructorCount: 5,
        studentCount: 20,
        maxInstructors: 10,
        maxStudents: 50,
      });
      mockInvitationRepo.countPendingInvitations
        .mockResolvedValueOnce(3) // instructors
        .mockResolvedValueOnce(2); // namespace-admins

      // First call for canAddUser (5 + 3 + 2 = 10, at limit)
      await expect(
        capacityService.enforceCapacity('test-ns', 'instructor')
      ).rejects.toThrow(InvitationError);
    });
  });
});
