/**
 * Unit tests for ClassRepository
 *
 * Tests CRUD operations for course classes using in-memory storage
 */

import { FakeClassRepository, FakeSectionRepository } from '../../__tests__/test-utils/fake-classes';

describe('ClassRepository', () => {
  let repository: FakeClassRepository;
  let mockSectionRepository: FakeSectionRepository;

  beforeEach(() => {
    repository = new FakeClassRepository();
    mockSectionRepository = new FakeSectionRepository();
    repository.setSectionRepository(mockSectionRepository);
  });

  afterEach(() => {
    repository.clear();
    mockSectionRepository.clear();
  });

  describe('createClass', () => {
    it('should create class with valid data', async () => {
      const classData = {
        namespaceId: 'default',
        name: 'CS 101',
        description: 'Introduction to Computer Science',
        createdBy: 'instructor-1',
      };

      const created = await repository.createClass(classData);

      expect(created).toBeDefined();
      expect(created.id).toMatch(/^class-/);
      expect(created.name).toBe('CS 101');
      expect(created.description).toBe('Introduction to Computer Science');
      expect(created.createdBy).toBe('instructor-1');
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
      expect(created.createdAt.getTime()).toBe(created.updatedAt.getTime());
    });

    it('should create class without description', async () => {
      const classData = {
        namespaceId: 'default',
        name: 'CS 202',
        createdBy: 'instructor-2',
      };

      const created = await repository.createClass(classData);

      expect(created.name).toBe('CS 202');
      expect(created.description).toBeUndefined();
      expect(created.createdBy).toBe('instructor-2');
    });

    it('should assign unique IDs to multiple classes', async () => {
      const class1 = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      const class2 = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 202',
        createdBy: 'instructor-1',
      });

      expect(class1.id).not.toBe(class2.id);
    });

    it('should persist to disk', async () => {
      const classData = {
        namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      };

      const created = await repository.createClass(classData);

      // Verify class is retrievable
      const retrieved = await repository.getClass(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('CS 101');
    });
  });

  describe('getClass', () => {
    it('should retrieve existing class', async () => {
      const created = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      const retrieved = await repository.getClass(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('CS 101');
    });

    it('should return null for non-existent class', async () => {
      const result = await repository.getClass('non-existent-id');
      expect(result).toBeNull();
    });

    it('should handle date deserialization correctly', async () => {
      const created = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      // Retrieve should work correctly
      const retrieved = await repository.getClass(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.createdAt).toBeInstanceOf(Date);
      expect(retrieved?.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('updateClass', () => {
    it('should update class fields correctly', async () => {
      const created = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        description: 'Old description',
        createdBy: 'instructor-1',
      });

      await repository.updateClass(created.id, {
        name: 'CS 101 Updated',
        description: 'New description',
      });

      const updated = await repository.getClass(created.id);
      expect(updated?.name).toBe('CS 101 Updated');
      expect(updated?.description).toBe('New description');
      expect(updated?.createdBy).toBe('instructor-1'); // Should not change
    });

    it('should update updatedAt timestamp', async () => {
      const created = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await repository.updateClass(created.id, { name: 'CS 101 Updated' });

      const updated = await repository.getClass(created.id);
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    });

    it('should preserve ID and createdAt', async () => {
      const created = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      await repository.updateClass(created.id, {
        name: 'CS 101 Updated',
      });

      const updated = await repository.getClass(created.id);
      expect(updated?.id).toBe(created.id);
      expect(updated?.createdAt.getTime()).toBe(created.createdAt.getTime());
    });

    it('should throw error for non-existent class', async () => {
      await expect(
        repository.updateClass('non-existent-id', { name: 'Updated' })
      ).rejects.toThrow('Class not found');
    });

    it('should persist updates to disk', async () => {
      const created = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      await repository.updateClass(created.id, { name: 'CS 101 Updated' });

      // Retrieve should get updated value
      const retrieved = await repository.getClass(created.id);
      expect(retrieved?.name).toBe('CS 101 Updated');
    });
  });

  describe('deleteClass', () => {
    it('should remove class', async () => {
      const created = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      await repository.deleteClass(created.id);

      const retrieved = await repository.getClass(created.id);
      expect(retrieved).toBeNull();
    });

    it('should throw error for non-existent class', async () => {
      await expect(
        repository.deleteClass('non-existent-id')
      ).rejects.toThrow('Class not found');
    });

    it('should persist deletion to disk', async () => {
      const created = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      await repository.deleteClass(created.id);

      // Retrieve should return null
      const retrieved = await repository.getClass(created.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('listClasses', () => {
    it('should return all classes when no filter provided', async () => {
      await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      await repository.createClass({
      namespaceId: 'default',
        name: 'CS 202',
        createdBy: 'instructor-2',
      });

      const classes = await repository.listClasses();
      expect(classes).toHaveLength(2);
    });

    it('should filter classes by creator', async () => {
      await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      await repository.createClass({
      namespaceId: 'default',
        name: 'CS 202',
        createdBy: 'instructor-2',
      });

      await repository.createClass({
      namespaceId: 'default',
        name: 'CS 303',
        createdBy: 'instructor-1',
      });

      const classes = await repository.listClasses('instructor-1');
      expect(classes).toHaveLength(2);
      expect(classes.every(c => c.createdBy === 'instructor-1')).toBe(true);
    });

    it('should return empty array when no classes exist', async () => {
      const classes = await repository.listClasses();
      expect(classes).toEqual([]);
    });

    it('should sort classes by creation date (newest first)', async () => {
      const class1 = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const class2 = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 202',
        createdBy: 'instructor-1',
      });

      const classes = await repository.listClasses();
      expect(classes[0].id).toBe(class2.id); // Newer class first
      expect(classes[1].id).toBe(class1.id);
    });
  });

  describe('getClassSections', () => {
    it('should return sections for a class', async () => {
      const created = await repository.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      // Create sections using the mock repository
      await mockSectionRepository.createSection({
        namespaceId: 'default',
        classId: created.id,
        name: 'Section A',
        active: true,
      });

      await mockSectionRepository.createSection({
        namespaceId: 'default',
        classId: created.id,
        name: 'Section B',
        active: true,
      });

      const sections = await repository.getClassSections(created.id);

      expect(sections).toHaveLength(2);
      expect(sections.map(s => s.name)).toContain('Section A');
      expect(sections.map(s => s.name)).toContain('Section B');
    });

    it('should throw error for non-existent class', async () => {
      await expect(
        repository.getClassSections('non-existent-id')
      ).rejects.toThrow('Class not found');
    });

    it('should throw error if section repository not configured', async () => {
      // Create repository without section repository
      const repoWithoutSections = new FakeClassRepository();

      const created = await repoWithoutSections.createClass({
      namespaceId: 'default',
        name: 'CS 101',
        createdBy: 'instructor-1',
      });

      await expect(
        repoWithoutSections.getClassSections(created.id)
      ).rejects.toThrow('Section repository not configured');
    });
  });

  describe('namespace filtering', () => {
    it('should filter classes by namespace in listClasses()', async () => {
      // Create classes in different namespaces
      const class1 = await repository.createClass({
        namespaceId: 'namespace-a',
        name: 'CS 101 - Namespace A',
        createdBy: 'instructor-1',
      });

      const class2 = await repository.createClass({
        namespaceId: 'namespace-b',
        name: 'CS 202 - Namespace B',
        createdBy: 'instructor-1',
      });

      const class3 = await repository.createClass({
        namespaceId: 'namespace-a',
        name: 'CS 303 - Namespace A',
        createdBy: 'instructor-2',
      });

      // Get all classes (no filter) - should return all 3
      const allClasses = await repository.listClasses();
      expect(allClasses).toHaveLength(3);

      // Filter by namespace-a - should return 2
      const namespaceAClasses = await repository.listClasses(undefined, 'namespace-a');
      expect(namespaceAClasses).toHaveLength(2);
      expect(namespaceAClasses.every(c => c.name.includes('Namespace A'))).toBe(true);

      // Filter by namespace-b - should return 1
      const namespaceBClasses = await repository.listClasses(undefined, 'namespace-b');
      expect(namespaceBClasses).toHaveLength(1);
      expect(namespaceBClasses[0].name).toBe('CS 202 - Namespace B');

      // Filter by non-existent namespace - should return 0
      const emptyClasses = await repository.listClasses(undefined, 'non-existent');
      expect(emptyClasses).toHaveLength(0);
    });

    it('should combine namespace filter with creator filter', async () => {
      await repository.createClass({
        namespaceId: 'namespace-a',
        name: 'Class 1',
        createdBy: 'instructor-1',
      });

      await repository.createClass({
        namespaceId: 'namespace-a',
        name: 'Class 2',
        createdBy: 'instructor-2',
      });

      await repository.createClass({
        namespaceId: 'namespace-b',
        name: 'Class 3',
        createdBy: 'instructor-1',
      });

      // Get classes by creator and namespace
      const results = await repository.listClasses('instructor-1', 'namespace-a');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Class 1');

      // Get classes by different creator and namespace
      const results2 = await repository.listClasses('instructor-2', 'namespace-a');
      expect(results2).toHaveLength(1);
      expect(results2[0].name).toBe('Class 2');

      // Get all classes by creator in namespace-b
      const results3 = await repository.listClasses('instructor-1', 'namespace-b');
      expect(results3).toHaveLength(1);
      expect(results3[0].name).toBe('Class 3');
    });

    it('should enforce namespace isolation', async () => {
      const class1 = await repository.createClass({
        namespaceId: 'stanford',
        name: 'CS 101 - Stanford',
        createdBy: 'instructor-1',
      });

      const class2 = await repository.createClass({
        namespaceId: 'mit',
        name: 'CS 101 - MIT',
        createdBy: 'instructor-2',
      });

      // Namespace-a instructor should only see namespace-a classes
      const stanfordClasses = await repository.listClasses(undefined, 'stanford');
      expect(stanfordClasses).toHaveLength(1);
      expect(stanfordClasses[0].id).toBe(class1.id);

      // Namespace-b instructor should only see namespace-b classes
      const mitClasses = await repository.listClasses(undefined, 'mit');
      expect(mitClasses).toHaveLength(1);
      expect(mitClasses[0].id).toBe(class2.id);
    });
  });
});
