/**
 * Tests for StudentRegistrationService
 */

import { StudentRegistrationService, StudentRegistrationError } from '../student-registration-service';
import { CapacityService } from '../capacity-service';
import { ISectionRepository } from '../../classes/interfaces';
import { INamespaceRepository, IAuthProvider } from '../../auth/interfaces';
import { Section } from '../../classes/types';
import { Namespace, User } from '../../auth/types';
import { InvitationError } from '../types';

describe('StudentRegistrationService', () => {
  let service: StudentRegistrationService;
  let mockSectionRepo: jest.Mocked<ISectionRepository>;
  let mockNamespaceRepo: jest.Mocked<INamespaceRepository>;
  let mockCapacityService: jest.Mocked<CapacityService>;
  let mockAuthProvider: jest.Mocked<IAuthProvider>;
  let mockMembershipRepo: { addMembership: jest.Mock };

  // Helper to create a mock section
  function createMockSection(overrides: Partial<Section> = {}): Section {
    return {
      id: 'section-123',
      namespaceId: 'test-namespace',
      classId: 'class-456',
      name: 'Section A',
      joinCode: 'ABC123',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  // Helper to create a mock namespace
  function createMockNamespace(overrides: Partial<Namespace> = {}): Namespace {
    return {
      id: 'test-namespace',
      displayName: 'Test Namespace',
      active: true,
      createdAt: new Date(),
      createdBy: 'system-admin',
      updatedAt: new Date(),
      maxInstructors: 10,
      maxStudents: 100,
      ...overrides,
    };
  }

  // Helper to create a mock user
  function createMockUser(overrides: Partial<User> = {}): User {
    return {
      id: 'user-789',
      email: 'student@example.com',
      role: 'student',
      namespaceId: 'test-namespace',
      createdAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockSectionRepo = {
      initialize: jest.fn(),
      shutdown: jest.fn(),
      health: jest.fn(),
      createSection: jest.fn(),
      getSection: jest.fn(),
      getSectionByJoinCode: jest.fn(),
      updateSection: jest.fn(),
      deleteSection: jest.fn(),
      listSections: jest.fn(),
      regenerateJoinCode: jest.fn(),
      getSectionStats: jest.fn(),
    };

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

    mockCapacityService = {
      getCapacityUsage: jest.fn(),
      canAddUser: jest.fn(),
      enforceCapacity: jest.fn(),
    } as unknown as jest.Mocked<CapacityService>;

    mockMembershipRepo = {
      addMembership: jest.fn(),
    };

    mockAuthProvider = {
      signUp: jest.fn(),
      getUser: jest.fn(),
      authenticateWithPassword: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
      getSessionFromRequest: jest.fn(),
      getSession: jest.fn(),
      signOut: jest.fn(),
      getSupabaseClient: jest.fn(),
      getAllUsers: jest.fn(),
      userRepository: {} as any,
    };

    service = new StudentRegistrationService(
      mockSectionRepo,
      mockNamespaceRepo,
      mockCapacityService,
      mockAuthProvider,
      mockMembershipRepo as any
    );
  });

  describe('validateSectionCode', () => {
    it('returns section info for valid code', async () => {
      const mockSection = createMockSection();
      const mockNamespace = createMockNamespace();

      mockSectionRepo.getSectionByJoinCode.mockResolvedValue(mockSection);
      mockNamespaceRepo.getNamespace.mockResolvedValue(mockNamespace);
      mockCapacityService.canAddUser.mockResolvedValue(true);

      const result = await service.validateSectionCode('ABC123');

      expect(result.valid).toBe(true);
      expect(result.section).toEqual(mockSection);
      expect(result.namespace).toEqual(mockNamespace);
      expect(result.capacityAvailable).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('normalizes join code (uppercase, trimmed)', async () => {
      const mockSection = createMockSection();
      const mockNamespace = createMockNamespace();

      mockSectionRepo.getSectionByJoinCode.mockResolvedValue(mockSection);
      mockNamespaceRepo.getNamespace.mockResolvedValue(mockNamespace);
      mockCapacityService.canAddUser.mockResolvedValue(true);

      await service.validateSectionCode('  abc-123  ');

      expect(mockSectionRepo.getSectionByJoinCode).toHaveBeenCalledWith('ABC123');
    });

    it('returns error for invalid code (not found)', async () => {
      mockSectionRepo.getSectionByJoinCode.mockResolvedValue(null);

      const result = await service.validateSectionCode('INVALID-CODE');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_CODE');
      expect(result.section).toBeUndefined();
      expect(result.namespace).toBeUndefined();
    });

    it('returns error for inactive section', async () => {
      const mockSection = createMockSection({ active: false });

      mockSectionRepo.getSectionByJoinCode.mockResolvedValue(mockSection);

      const result = await service.validateSectionCode('ABC123');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('SECTION_INACTIVE');
    });

    it('returns error when namespace not found', async () => {
      const mockSection = createMockSection();

      mockSectionRepo.getSectionByJoinCode.mockResolvedValue(mockSection);
      mockNamespaceRepo.getNamespace.mockResolvedValue(null);

      const result = await service.validateSectionCode('ABC123');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('NAMESPACE_NOT_FOUND');
    });

    it('returns capacityAvailable=false when at limit', async () => {
      const mockSection = createMockSection();
      const mockNamespace = createMockNamespace();

      mockSectionRepo.getSectionByJoinCode.mockResolvedValue(mockSection);
      mockNamespaceRepo.getNamespace.mockResolvedValue(mockNamespace);
      mockCapacityService.canAddUser.mockResolvedValue(false);

      const result = await service.validateSectionCode('ABC123');

      expect(result.valid).toBe(true);
      expect(result.capacityAvailable).toBe(false);
    });

    it('returns error for empty code', async () => {
      const result = await service.validateSectionCode('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_CODE');
    });

    it('returns error for whitespace-only code', async () => {
      const result = await service.validateSectionCode('   ');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_CODE');
    });
  });

  describe('registerStudent', () => {
    beforeEach(() => {
      const mockSection = createMockSection();
      const mockNamespace = createMockNamespace();
      const mockUser = createMockUser();

      mockSectionRepo.getSectionByJoinCode.mockResolvedValue(mockSection);
      mockNamespaceRepo.getNamespace.mockResolvedValue(mockNamespace);
      mockCapacityService.canAddUser.mockResolvedValue(true);
      mockCapacityService.enforceCapacity.mockResolvedValue(undefined);
      mockAuthProvider.signUp.mockResolvedValue(mockUser);
      mockMembershipRepo.addMembership.mockResolvedValue({
        id: 'membership-123',
        userId: mockUser.id,
        sectionId: mockSection.id,
        role: 'student',
        joinedAt: new Date(),
      });
    });

    it('creates user with correct role and namespace', async () => {
      const result = await service.registerStudent(
        'ABC123',
        'student@example.com',
        'SecurePassword123!',
        'newstudent'
      );

      expect(mockAuthProvider.signUp).toHaveBeenCalledWith(
        'student@example.com',
        'SecurePassword123!',
        'student',
        'test-namespace'
      );
      expect(result.user.role).toBe('student');
      expect(result.user.namespaceId).toBe('test-namespace');
    });

    it('adds user to section membership', async () => {
      const result = await service.registerStudent(
        'ABC123',
        'student@example.com',
        'SecurePassword123!',
        'newstudent'
      );

      expect(mockMembershipRepo.addMembership).toHaveBeenCalledWith({
        userId: 'user-789',
        sectionId: 'section-123',
        role: 'student',
      });
      expect(result.section.id).toBe('section-123');
    });

    it('throws StudentRegistrationError for invalid code', async () => {
      mockSectionRepo.getSectionByJoinCode.mockResolvedValue(null);

      await expect(
        service.registerStudent(
          'INVALID-CODE',
          'student@example.com',
          'SecurePassword123!',
          'newstudent'
        )
      ).rejects.toThrow(StudentRegistrationError);

      try {
        await service.registerStudent(
          'INVALID-CODE',
          'student@example.com',
          'SecurePassword123!',
          'newstudent'
        );
      } catch (error) {
        expect((error as StudentRegistrationError).code).toBe('INVALID_CODE');
      }
    });

    it('throws error for inactive section', async () => {
      mockSectionRepo.getSectionByJoinCode.mockResolvedValue(
        createMockSection({ active: false })
      );

      await expect(
        service.registerStudent(
          'ABC123',
          'student@example.com',
          'SecurePassword123!',
          'newstudent'
        )
      ).rejects.toThrow(StudentRegistrationError);

      try {
        await service.registerStudent(
          'ABC123',
          'student@example.com',
          'SecurePassword123!',
          'newstudent'
        );
      } catch (error) {
        expect((error as StudentRegistrationError).code).toBe('SECTION_INACTIVE');
      }
    });

    it('throws error when capacity exceeded', async () => {
      mockCapacityService.enforceCapacity.mockRejectedValue(
        new InvitationError('Namespace is at capacity for students', 'NAMESPACE_AT_CAPACITY')
      );

      await expect(
        service.registerStudent(
          'ABC123',
          'student@example.com',
          'SecurePassword123!',
          'newstudent'
        )
      ).rejects.toThrow(StudentRegistrationError);

      try {
        await service.registerStudent(
          'ABC123',
          'student@example.com',
          'SecurePassword123!',
          'newstudent'
        );
      } catch (error) {
        expect((error as StudentRegistrationError).code).toBe('NAMESPACE_AT_CAPACITY');
      }
    });

    it('throws error for duplicate email', async () => {
      mockAuthProvider.signUp.mockRejectedValue(new Error('User already exists'));

      await expect(
        service.registerStudent(
          'ABC123',
          'existing@example.com',
          'SecurePassword123!',
          'newstudent'
        )
      ).rejects.toThrow(StudentRegistrationError);

      try {
        await service.registerStudent(
          'ABC123',
          'existing@example.com',
          'SecurePassword123!',
          'newstudent'
        );
      } catch (error) {
        expect((error as StudentRegistrationError).code).toBe('USER_CREATION_FAILED');
      }
    });

    it('normalizes email to lowercase', async () => {
      await service.registerStudent(
        'ABC123',
        'STUDENT@EXAMPLE.COM',
        'SecurePassword123!',
        'newstudent'
      );

      expect(mockAuthProvider.signUp).toHaveBeenCalledWith(
        'student@example.com',
        'SecurePassword123!',
        'student',
        'test-namespace'
      );
    });

    it('trims email whitespace', async () => {
      await service.registerStudent(
        'ABC123',
        '  student@example.com  ',
        'SecurePassword123!',
        'newstudent'
      );

      expect(mockAuthProvider.signUp).toHaveBeenCalledWith(
        'student@example.com',
        'SecurePassword123!',
        'student',
        'test-namespace'
      );
    });

    it('throws error for invalid email format', async () => {
      await expect(
        service.registerStudent(
          'ABC123',
          'not-an-email',
          'SecurePassword123!',
          'newstudent'
        )
      ).rejects.toThrow(StudentRegistrationError);

      try {
        await service.registerStudent(
          'ABC123',
          'not-an-email',
          'SecurePassword123!',
          'newstudent'
        );
      } catch (error) {
        expect((error as StudentRegistrationError).code).toBe('INVALID_EMAIL');
      }
    });

    it('throws error for empty password', async () => {
      await expect(
        service.registerStudent(
          'ABC123',
          'student@example.com',
          '',
          'newstudent'
        )
      ).rejects.toThrow(StudentRegistrationError);

      try {
        await service.registerStudent(
          'ABC123',
          'student@example.com',
          '',
          'newstudent'
        );
      } catch (error) {
        expect((error as StudentRegistrationError).code).toBe('INVALID_PASSWORD');
      }
    });
  });
});
