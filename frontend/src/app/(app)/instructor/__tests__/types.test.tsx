/**
 * Tests for shared instructor UI types.
 * Verifies the ClassInfo interface is exported and has the expected shape.
 */
import type { ClassInfo, ClassWithSections, ProblemSummary } from '../types';

describe('Instructor shared types', () => {
  it('ClassInfo has required id and name fields', () => {
    const info: ClassInfo = { id: '1', name: 'Test', namespace_id: 'ns-1', description: null };
    expect(info.id).toBe('1');
    expect(info.name).toBe('Test');
  });

  it('ClassInfo accepts optional namespace_id and description', () => {
    const info: ClassInfo = {
      id: '1',
      name: 'Test',
      namespace_id: 'ns-1',
      description: 'A class',
    };
    expect(info.namespace_id).toBe('ns-1');
    expect(info.description).toBe('A class');
  });

  it('ProblemSummary has required fields for problem list views', () => {
    const problem: ProblemSummary = {
      id: 'p-1',
      title: 'Two Sum',
      created_at: '2025-01-01T00:00:00.000Z',
      author_id: 'user-1',
      tags: ['arrays'],
      class_id: 'class-1',
      description: null,
    };
    expect(problem.id).toBe('p-1');
    expect(problem.title).toBe('Two Sum');
    expect(problem.tags).toEqual(['arrays']);
    expect(problem.class_id).toBe('class-1');
  });

  it('ProblemSummary accepts optional description', () => {
    const problem: ProblemSummary = {
      id: 'p-2',
      title: 'Three Sum',
      created_at: '2025-06-01T00:00:00.000Z',
      author_id: 'user-2',
      tags: [],
      class_id: 'class-2',
      description: 'Find three numbers',
    };
    expect(problem.description).toBe('Find three numbers');
  });

  it('ClassWithSections extends ClassInfo with section_count', () => {
    const info: ClassWithSections = {
      id: '1',
      name: 'Test',
      namespace_id: 'ns-1',
      description: 'desc',
      section_count: 3,
    };
    expect(info.section_count).toBe(3);
  });
});
