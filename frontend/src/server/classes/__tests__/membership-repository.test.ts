/**
 * Unit tests for MembershipRepository
 *
 * Tests user enrollment in sections, membership queries, and join code validation
 */

import { FakeMembershipRepository, FakeClassRepository, FakeSectionRepository } from '../../__tests__/test-utils/fake-classes';
import { User } from '../../auth/types';
import { Section, Class } from '../types';

describe('MembershipRepository', () => {
  let repository: FakeMembershipRepository;
  let mockUserRepository: any;
  let sectionRepository: FakeSectionRepository;
  let classRepository: FakeClassRepository;

  // Mock data
  const mockUser1: User = {
    id: 'user-1',
    email: 'student1@example.com',
    role: 'student',
    namespaceId: 'default',
    createdAt: new Date(),
  };

  const mockUser2: User = {
    id: 'user-2',
    email: 'student2@example.com',
    role: 'student',
    namespaceId: 'default',
    createdAt: new Date(),
  };

  const mockInstructor: User = {
    id: 'instructor-1',
    email: 'instructor@example.com',
    role: 'instructor',
    namespaceId: 'default',
    createdAt: new Date(),
  };

  let mockSection1: Section;
  let mockSection2: Section;
  let mockClass: Class;

  beforeEach(async () => {
    repository = new FakeMembershipRepository();
    sectionRepository = new FakeSectionRepository();
    classRepository = new FakeClassRepository();

    // Mock user repository
    mockUserRepository = {
      getUserById: jest.fn((id: string) => {
        if (id === 'user-1') return Promise.resolve(mockUser1);
        if (id === 'user-2') return Promise.resolve(mockUser2);
        if (id === 'instructor-1') return Promise.resolve(mockInstructor);
        return Promise.resolve(null);
      }),
    };

    // Create actual sections and class in the fake repositories
    mockClass = await classRepository.createClass({
      namespaceId: 'default',
      name: 'CS 101',
      description: 'Introduction to CS',
      createdBy: 'instructor-1',
    });

    mockSection1 = await sectionRepository.createSection({
      namespaceId: 'default',
      classId: mockClass.id,
      name: 'Section A',
      active: true,
    });

    mockSection2 = await sectionRepository.createSection({
      namespaceId: 'default',
      classId: mockClass.id,
      name: 'Section B',
      active: true,
    });

    repository.setRepositories(mockUserRepository, sectionRepository, classRepository);
  });

  afterEach(() => {
    repository.clear();
    sectionRepository.clear();
    classRepository.clear();
  });

  describe('addMembership', () => {
    it('should create membership enrollment', async () => {
      const membershipData = {
        userId: 'user-1',
        sectionId: mockSection1.id,
        role: 'student' as const,
      };

      const created = await repository.addMembership(membershipData);

      expect(created).toBeDefined();
      expect(created.id).toMatch(/^membership-/);
      expect(created.userId).toBe('user-1');
      expect(created.sectionId).toBe(mockSection1.id);
      expect(created.role).toBe('student');
      expect(created.joinedAt).toBeInstanceOf(Date);
    });

    it('should create instructor membership', async () => {
      const membershipData = {
        userId: 'instructor-1',
        sectionId: mockSection1.id,
        role: 'instructor' as const,
      };

      const created = await repository.addMembership(membershipData);

      expect(created.role).toBe('instructor');
      expect(created.userId).toBe('instructor-1');
    });

    it('should throw error on duplicate membership', async () => {
      const membershipData = {
        userId: 'user-1',
        sectionId: mockSection1.id,
        role: 'student' as const,
      };

      await repository.addMembership(membershipData);

      await expect(
        repository.addMembership(membershipData)
      ).rejects.toThrow('User is already a member of this section');
    });

    it('should allow user to join multiple sections', async () => {
      await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection1.id,
        role: 'student',
      });

      await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection2.id,
        role: 'student',
      });

      const sections = await repository.getUserSections('user-1');
      expect(sections).toHaveLength(2);
    });

    it('should persist to disk', async () => {
      const created = await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection1.id,
        role: 'student',
      });

      // Verify membership is retrievable
      const membership = await repository.getMembership('user-1', mockSection1.id);
      expect(membership).not.toBeNull();
      expect(membership?.id).toBe(created.id);
    });
  });

  describe('removeMembership', () => {
    it('should delete enrollment', async () => {
      await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection1.id,
        role: 'student',
      });

      await repository.removeMembership('user-1', mockSection1.id);

      const isMember = await repository.isMember('user-1', mockSection1.id);
      expect(isMember).toBe(false);
    });

    it('should throw error for non-existent membership', async () => {
      await expect(
        repository.removeMembership('user-1', mockSection1.id)
      ).rejects.toThrow('Membership not found');
    });

    it('should update indexes after removal', async () => {
      await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection1.id,
        role: 'student',
      });

      await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection2.id,
        role: 'student',
      });

      await repository.removeMembership('user-1', mockSection1.id);

      const sections = await repository.getUserSections('user-1');
      expect(sections).toHaveLength(1);
      expect(sections[0].id).toBe(mockSection2.id);
    });
  });

  describe('getUserSections', () => {
    beforeEach(async () => {
      // Create test memberships for each test
      await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection1.id,
        role: 'student',
      });

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 5));

      await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection2.id,
        role: 'student',
      });

      await repository.addMembership({
        userId: 'instructor-1',
        sectionId: mockSection1.id,
        role: 'instructor',
      });
    });

    it('should return SectionWithClass array', async () => {
      const sections = await repository.getUserSections('user-1');

      expect(sections).toHaveLength(2);
      expect(sections[0]).toHaveProperty('id');
      expect(sections[0]).toHaveProperty('name');
      expect(sections[0]).toHaveProperty('class');
      expect(sections[0].class).toHaveProperty('id');
      expect(sections[0].class).toHaveProperty('name');
    });

    it('should filter by role when specified', async () => {
      const studentSections = await repository.getUserSections('user-1', 'student');
      expect(studentSections).toHaveLength(2);

      const instructorSections = await repository.getUserSections('user-1', 'instructor');
      expect(instructorSections).toHaveLength(0);
    });

    it('should return empty array for user with no memberships', async () => {
      const sections = await repository.getUserSections('user-2');
      expect(sections).toEqual([]);
    });

    it('should sort by joined date (most recent first)', async () => {
      const sections = await repository.getUserSections('user-1');

      // Verify sections are present
      expect(sections).toHaveLength(2);
      // The sorting is based on membership joinedAt, most recent first
      // section-2 was joined after section-1 in beforeEach
      expect(sections[0].id).toBe(mockSection2.id);
      expect(sections[1].id).toBe(mockSection1.id);
    });

    it('should throw error if repositories not configured', async () => {
      const repoWithoutDeps = new FakeMembershipRepository();

      await expect(
        repoWithoutDeps.getUserSections('user-1')
      ).rejects.toThrow('Repositories not configured');
    });
  });

  describe('getSectionMembers', () => {
    beforeEach(async () => {
      await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection1.id,
        role: 'student',
      });

      await repository.addMembership({
        userId: 'user-2',
        sectionId: mockSection1.id,
        role: 'student',
      });

      await repository.addMembership({
        userId: 'instructor-1',
        sectionId: mockSection1.id,
        role: 'instructor',
      });
    });

    it('should return User array', async () => {
      const members = await repository.getSectionMembers(mockSection1.id);

      expect(members).toHaveLength(3);
      expect(members[0]).toHaveProperty('id');
      expect(members[0]).toHaveProperty('email');
      expect(members[0]).toHaveProperty('role');
    });

    it('should filter by role when specified', async () => {
      const students = await repository.getSectionMembers(mockSection1.id, 'student');
      expect(students).toHaveLength(2);
      expect(students.every(u => u.role === 'student')).toBe(true);

      const instructors = await repository.getSectionMembers(mockSection1.id, 'instructor');
      expect(instructors).toHaveLength(1);
      expect(instructors[0].id).toBe('instructor-1');
    });

    it('should return empty array for section with no members', async () => {
      // Create a new section with no members
      const emptySection = await sectionRepository.createSection({
        namespaceId: 'default',
        classId: mockClass.id,
        name: 'Empty Section',
        active: true,
      });

      const members = await repository.getSectionMembers(emptySection.id);
      expect(members).toEqual([]);
    });

    it('should sort members by email', async () => {
      const members = await repository.getSectionMembers(mockSection1.id, 'student');

      expect(members[0].email).toBe('student1@example.com');
      expect(members[1].email).toBe('student2@example.com');
    });

    it('should throw error if user repository not configured', async () => {
      const repoWithoutDeps = new FakeMembershipRepository();

      await expect(
        repoWithoutDeps.getSectionMembers(mockSection1.id)
      ).rejects.toThrow('User repository not configured');
    });
  });

  describe('isMember', () => {
    it('should return true for existing membership', async () => {
      await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection1.id,
        role: 'student',
      });

      const result = await repository.isMember('user-1', mockSection1.id);
      expect(result).toBe(true);
    });

    it('should return false for non-existent membership', async () => {
      const result = await repository.isMember('user-1', mockSection1.id);
      expect(result).toBe(false);
    });

    it('should check membership correctly for instructors', async () => {
      await repository.addMembership({
        userId: 'instructor-1',
        sectionId: mockSection1.id,
        role: 'instructor',
      });

      const result = await repository.isMember('instructor-1', mockSection1.id);
      expect(result).toBe(true);
    });
  });

  describe('getMembership', () => {
    it('should return membership for user and section', async () => {
      const created = await repository.addMembership({
        userId: 'user-1',
        sectionId: mockSection1.id,
        role: 'student',
      });

      const membership = await repository.getMembership('user-1', mockSection1.id);

      expect(membership).not.toBeNull();
      expect(membership?.id).toBe(created.id);
      expect(membership?.userId).toBe('user-1');
      expect(membership?.sectionId).toBe(mockSection1.id);
    });

    it('should return null for non-existent membership', async () => {
      const membership = await repository.getMembership('user-1', mockSection1.id);
      expect(membership).toBeNull();
    });
  });

  describe('validateJoinCode', () => {
    it('should return section for valid active join code', async () => {
      const section = await repository.validateJoinCode(mockSection1.joinCode);

      expect(section).not.toBeNull();
      expect(section?.id).toBe(mockSection1.id);
      expect(section?.joinCode).toBe(mockSection1.joinCode);
    });

    it('should normalize join code (uppercase, trim)', async () => {
      const section1 = await repository.validateJoinCode(mockSection1.joinCode.toLowerCase());
      expect(section1).not.toBeNull();

      const section2 = await repository.validateJoinCode(`  ${mockSection1.joinCode}  `);
      expect(section2).not.toBeNull();
    });

    it('should return null for invalid format', async () => {
      const section = await repository.validateJoinCode('INVALID');
      expect(section).toBeNull();
    });

    it('should return null for non-existent join code', async () => {
      const section = await repository.validateJoinCode('XXX-999-YYY');
      expect(section).toBeNull();
    });

    it('should return null for inactive section', async () => {
      // Deactivate the section
      await sectionRepository.updateSection(mockSection1.id, { active: false });

      const section = await repository.validateJoinCode(mockSection1.joinCode);
      expect(section).toBeNull();

      // Reactivate for other tests
      await sectionRepository.updateSection(mockSection1.id, { active: true });
    });

    it('should throw error if section repository not configured', async () => {
      const repoWithoutDeps = new FakeMembershipRepository();

      await expect(
        repoWithoutDeps.validateJoinCode(mockSection1.joinCode)
      ).rejects.toThrow('Section repository not set');
    });
  });

  describe('joinSection', () => {
    it('should enroll student via join code', async () => {
      const membership = await repository.joinSection('user-1', mockSection1.joinCode);

      expect(membership).toBeDefined();
      expect(membership.userId).toBe('user-1');
      expect(membership.sectionId).toBe(mockSection1.id);
      expect(membership.role).toBe('student');
    });

    it('should normalize join code', async () => {
      const membership = await repository.joinSection('user-1', mockSection1.joinCode.toLowerCase());
      expect(membership.sectionId).toBe(mockSection1.id);
    });

    it('should be idempotent (return existing membership)', async () => {
      const membership1 = await repository.joinSection('user-1', mockSection1.joinCode);
      const membership2 = await repository.joinSection('user-1', mockSection1.joinCode);

      expect(membership1.id).toBe(membership2.id);

      // Verify only one membership exists
      const sections = await repository.getUserSections('user-1');
      expect(sections).toHaveLength(1);
    });

    it('should throw error for invalid join code', async () => {
      await expect(
        repository.joinSection('user-1', 'INVALID')
      ).rejects.toThrow('Invalid or inactive join code');
    });

    it('should throw error for non-existent join code', async () => {
      await expect(
        repository.joinSection('user-1', 'XXX-999-YYY')
      ).rejects.toThrow('Invalid or inactive join code');
    });

    it('should throw error for inactive section', async () => {
      // Create an inactive section
      const inactiveSection = await sectionRepository.createSection({
        namespaceId: 'default',
        classId: mockClass.id,
        name: 'Inactive Section',
        active: false,
      });

      await expect(
        repository.joinSection('user-1', inactiveSection.joinCode)
      ).rejects.toThrow('Invalid or inactive join code');
    });

    it('should allow student to join multiple sections', async () => {
      await repository.joinSection('user-1', mockSection1.joinCode);
      await repository.joinSection('user-1', mockSection2.joinCode);

      const sections = await repository.getUserSections('user-1');
      expect(sections).toHaveLength(2);
    });
  });
});
