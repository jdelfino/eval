/**
 * Unit tests for SectionRepository
 *
 * Tests section management, join code generation, and collision handling
 */

import { FakeSectionRepository, FakeMembershipRepository } from '../../__tests__/test-utils/fake-classes';

// Mock the join code service to make tests deterministic
jest.mock('../join-code-service', () => {
  let counter = 0;
  return {
    generateJoinCode: jest.fn(() => {
      // Generate deterministic codes for testing
      const codes = ['ABC-123-XYZ', 'DEF-456-GHI', 'JKL-789-MNO', 'PQR-234-STU', 'VWX-567-YZA'];
      return codes[counter++ % codes.length];
    }),
  };
});

import { generateJoinCode } from '../join-code-service';

describe('SectionRepository', () => {
  let repository: FakeSectionRepository;
  let mockMembershipRepository: FakeMembershipRepository;

  beforeEach(() => {
    repository = new FakeSectionRepository();

    // Reset mock counter
    (generateJoinCode as jest.Mock).mockClear();
    let counter = 0;
    (generateJoinCode as jest.Mock).mockImplementation(() => {
      const codes = ['ABC-123-XYZ', 'DEF-456-GHI', 'JKL-789-MNO', 'PQR-234-STU', 'VWX-567-YZA'];
      return codes[counter++ % codes.length];
    });

    mockMembershipRepository = new FakeMembershipRepository();
    repository.setMembershipRepository(mockMembershipRepository);
  });

  afterEach(() => {
    repository.clear();
    mockMembershipRepository.clear();
  });

  describe('createSection', () => {
    it('should create section with auto-generated join code', async () => {
      const sectionData = {
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        semester: 'Fall 2025',
        instructorIds: ['instructor-1'],
        active: true,
      };

      const created = await repository.createSection(sectionData);

      expect(created).toBeDefined();
      expect(created.id).toMatch(/^section-/);
      expect(created.classId).toBe('class-1');
      expect(created.name).toBe('Section A');
      expect(created.semester).toBe('Fall 2025');
      expect(created.joinCode).toBe('ABC-123-XYZ');
      expect(created.active).toBe(true);
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it('should create section with optional semester', async () => {
      const sectionData = {
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        semester: 'Spring 2026',
        active: true,
      };

      const created = await repository.createSection(sectionData);

      expect(created.semester).toBe('Spring 2026');
    });

    it('should generate unique join codes', async () => {
      const section1 = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      const section2 = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section B',
        active: true,
      });

      expect(section1.joinCode).toBe('ABC-123-XYZ');
      expect(section2.joinCode).toBe('DEF-456-GHI');
      expect(section1.joinCode).not.toBe(section2.joinCode);
    });

    it('should handle join code collision and retry', async () => {
      // Create first section with ABC-123-XYZ
      await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      // Mock to return duplicate code first, then unique code
      (generateJoinCode as jest.Mock).mockReset();
      let attemptCount = 0;
      (generateJoinCode as jest.Mock).mockImplementation(() => {
        attemptCount++;
        return attemptCount === 1 ? 'ABC-123-XYZ' : 'NEW-UNQ-COD';
      });

      const section2 = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section B',
        active: true,
      });

      expect(section2.joinCode).toBe('NEW-UNQ-COD');
      expect(generateJoinCode).toHaveBeenCalledTimes(2); // Called twice due to collision
    });

    it('should persist to disk', async () => {
      const created = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      // Verify section is retrievable
      const retrieved = await repository.getSection(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Section A');
    });
  });

  describe('getSection', () => {
    it('should retrieve existing section', async () => {
      const created = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      const retrieved = await repository.getSection(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Section A');
    });

    it('should return null for non-existent section', async () => {
      const result = await repository.getSection('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getSectionByJoinCode', () => {
    it('should find section by join code', async () => {
      const created = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      const retrieved = await repository.getSectionByJoinCode(created.joinCode);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.joinCode).toBe(created.joinCode);
    });

    it('should return null for non-existent join code', async () => {
      const result = await repository.getSectionByJoinCode('XXX-999-YYY');
      expect(result).toBeNull();
    });

    it('should maintain join code index across multiple operations', async () => {
      const section1 = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      const section2 = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section B',
        active: true,
      });

      const retrieved1 = await repository.getSectionByJoinCode(section1.joinCode);
      const retrieved2 = await repository.getSectionByJoinCode(section2.joinCode);

      expect(retrieved1?.id).toBe(section1.id);
      expect(retrieved2?.id).toBe(section2.id);
    });
  });

  describe('updateSection', () => {
    it('should update section fields correctly', async () => {
      const created = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        semester: 'Fall 2025',
        active: true,
      });

      await repository.updateSection(created.id, {
        name: 'Section A Updated',
        semester: 'Spring 2026',
      });

      const updated = await repository.getSection(created.id);
      expect(updated?.name).toBe('Section A Updated');
      expect(updated?.semester).toBe('Spring 2026');
    });

    it('should update active status', async () => {
      const created = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      await repository.updateSection(created.id, { active: false });

      const updated = await repository.getSection(created.id);
      expect(updated?.active).toBe(false);
    });

    it('should update updatedAt timestamp', async () => {
      const created = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await repository.updateSection(created.id, { name: 'Updated' });

      const updated = await repository.getSection(created.id);
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    });

    it('should throw error for non-existent section', async () => {
      await expect(
        repository.updateSection('non-existent-id', { name: 'Updated' })
      ).rejects.toThrow('Section not found');
    });

    it('should update join code and maintain index', async () => {
      const created = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      const oldJoinCode = created.joinCode;

      await repository.updateSection(created.id, {
        joinCode: 'NEW-JON-COD',
      });

      // Old code should not find section
      const byOldCode = await repository.getSectionByJoinCode(oldJoinCode);
      expect(byOldCode).toBeNull();

      // New code should find section
      const byNewCode = await repository.getSectionByJoinCode('NEW-JON-COD');
      expect(byNewCode?.id).toBe(created.id);
    });

    it('should throw error when updating to duplicate join code', async () => {
      const section1 = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      const section2 = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section B',
        active: true,
      });

      await expect(
        repository.updateSection(section2.id, { joinCode: section1.joinCode })
      ).rejects.toThrow('Join code already in use');
    });
  });

  describe('deleteSection', () => {
    it('should remove section', async () => {
      const created = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      await repository.deleteSection(created.id);

      const retrieved = await repository.getSection(created.id);
      expect(retrieved).toBeNull();
    });

    it('should remove join code from index', async () => {
      const created = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      const joinCode = created.joinCode;
      await repository.deleteSection(created.id);

      const retrieved = await repository.getSectionByJoinCode(joinCode);
      expect(retrieved).toBeNull();
    });

    it('should throw error for non-existent section', async () => {
      await expect(
        repository.deleteSection('non-existent-id')
      ).rejects.toThrow('Section not found');
    });
  });

  describe('listSections', () => {
    beforeEach(async () => {
      // Create test sections
      await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section B',
        active: true,
      });

      await repository.createSection({
        namespaceId: 'default',
        classId: 'class-2',
        name: 'Section C',
        active: true,
      });

      await repository.createSection({
        namespaceId: 'default',
        classId: 'class-2',
        name: 'Section D',
        active: false,
      });
    });

    it('should return all sections when no filters provided', async () => {
      const sections = await repository.listSections({});
      expect(sections).toHaveLength(4);
    });

    it('should filter by classId', async () => {
      const sections = await repository.listSections({ classId: 'class-1' });
      expect(sections).toHaveLength(2);
      expect(sections.every(s => s.classId === 'class-1')).toBe(true);
    });

    it('should filter by active status', async () => {
      const activeSections = await repository.listSections({ active: true });
      expect(activeSections).toHaveLength(3);
      expect(activeSections.every(s => s.active === true)).toBe(true);

      const inactiveSections = await repository.listSections({ active: false });
      expect(inactiveSections).toHaveLength(1);
      expect(inactiveSections[0].active).toBe(false);
    });

    it('should combine multiple filters', async () => {
      const sections = await repository.listSections({
        classId: 'class-2',
        active: true,
      });

      expect(sections).toHaveLength(1);
      expect(sections[0].classId).toBe('class-2');
      expect(sections[0].active).toBe(true);
    });

    it('should return empty array when no sections match filters', async () => {
      const sections = await repository.listSections({
        classId: 'non-existent-class',
      });

      expect(sections).toEqual([]);
    });
  });

  describe('regenerateJoinCode', () => {
    it('should generate new join code for section', async () => {
      const created = await repository.createSection({
        namespaceId: 'default',
        classId: 'class-1',
        name: 'Section A',
        active: true,
      });

      const oldJoinCode = created.joinCode;

      const newJoinCode = await repository.regenerateJoinCode(created.id);

      expect(newJoinCode).not.toBe(oldJoinCode);

      // Verify section was updated
      const section = await repository.getSection(created.id);
      expect(section?.joinCode).toBe(newJoinCode);

      // Old code should not work
      const byOldCode = await repository.getSectionByJoinCode(oldJoinCode);
      expect(byOldCode).toBeNull();

      // New code should work
      const byNewCode = await repository.getSectionByJoinCode(newJoinCode);
      expect(byNewCode?.id).toBe(created.id);
    });

    it('should throw error for non-existent section', async () => {
      await expect(
        repository.regenerateJoinCode('non-existent-id')
      ).rejects.toThrow('Section not found');
    });
  });
});
