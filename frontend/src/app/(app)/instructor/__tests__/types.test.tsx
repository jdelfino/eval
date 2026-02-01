/**
 * Tests for shared instructor UI types.
 * Verifies the ClassInfo interface is exported and has the expected shape.
 */
import type { ClassInfo, ClassWithSections, ProblemSummary } from '../types';

describe('Instructor shared types', () => {
  it('ClassInfo has required id and name fields', () => {
    const info: ClassInfo = { id: '1', name: 'Test' };
    expect(info.id).toBe('1');
    expect(info.name).toBe('Test');
  });

  it('ClassInfo accepts optional namespaceId and description', () => {
    const info: ClassInfo = {
      id: '1',
      name: 'Test',
      namespaceId: 'ns-1',
      description: 'A class',
    };
    expect(info.namespaceId).toBe('ns-1');
    expect(info.description).toBe('A class');
  });

  it('ProblemSummary has required fields for problem list views', () => {
    const problem: ProblemSummary = {
      id: 'p-1',
      title: 'Two Sum',
      createdAt: '2025-01-01T00:00:00.000Z',
      authorId: 'user-1',
      tags: ['arrays'],
      classId: 'class-1',
    };
    expect(problem.id).toBe('p-1');
    expect(problem.title).toBe('Two Sum');
    expect(problem.tags).toEqual(['arrays']);
    expect(problem.classId).toBe('class-1');
  });

  it('ProblemSummary accepts optional description and testCaseCount', () => {
    const problem: ProblemSummary = {
      id: 'p-2',
      title: 'Three Sum',
      createdAt: '2025-06-01T00:00:00.000Z',
      authorId: 'user-2',
      tags: [],
      classId: 'class-2',
      description: 'Find three numbers',
      testCaseCount: 5,
    };
    expect(problem.description).toBe('Find three numbers');
    expect(problem.testCaseCount).toBe(5);
  });

  it('ClassWithSections extends ClassInfo with sectionCount', () => {
    const info: ClassWithSections = {
      id: '1',
      name: 'Test',
      description: 'desc',
      sectionCount: 3,
    };
    expect(info.sectionCount).toBe(3);
  });
});
