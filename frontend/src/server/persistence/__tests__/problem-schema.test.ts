/**
 * Tests for problem schema validation
 */

import { validateProblemSchema, PROBLEM_VALIDATION_RULES, serializeProblem, deserializeProblem } from '../problem-schema';
import { Problem } from '../../types/problem';

describe('validateProblemSchema', () => {
  const validProblem: Partial<Problem> = {
    title: 'Hello World',
    authorId: 'author-123',
    classId: 'class-1',
    tags: ['loops', 'basics'],
  };

  describe('tags validation', () => {
    it('should accept valid tags', () => {
      const errors = validateProblemSchema({ ...validProblem, tags: ['loops', 'basics'] });
      const tagErrors = errors.filter((e) => e.field === 'tags');
      expect(tagErrors).toHaveLength(0);
    });

    it('should accept empty tags array', () => {
      const errors = validateProblemSchema({ ...validProblem, tags: [] });
      const tagErrors = errors.filter((e) => e.field === 'tags');
      expect(tagErrors).toHaveLength(0);
    });

    it('should reject more than 10 tags', () => {
      const tags = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
      const errors = validateProblemSchema({ ...validProblem, tags });
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'tags', code: 'MAX_COUNT' })
      );
    });

    it('should reject tags longer than 30 characters', () => {
      const errors = validateProblemSchema({
        ...validProblem,
        tags: ['a'.repeat(31)],
      });
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'tags', code: 'MAX_LENGTH' })
      );
    });

    it('should reject tags with invalid characters', () => {
      const errors = validateProblemSchema({
        ...validProblem,
        tags: ['invalid tag!'],
      });
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'tags', code: 'INVALID_FORMAT' })
      );
    });

    it('should accept tags with alphanumeric, hyphens, slashes, and spaces', () => {
      const errors = validateProblemSchema({
        ...validProblem,
        tags: ['my-tag-1', 'another-tag', 'week 1/intro', 'loops/recursion'],
      });
      const tagErrors = errors.filter((e) => e.field === 'tags');
      expect(tagErrors).toHaveLength(0);
    });

    it('should reject empty string tags', () => {
      const errors = validateProblemSchema({
        ...validProblem,
        tags: [''],
      });
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'tags', code: 'INVALID_FORMAT' })
      );
    });
  });

  describe('solution validation', () => {
    it('should accept a valid solution string', () => {
      const errors = validateProblemSchema({ ...validProblem, solution: 'print("hello")' });
      const solutionErrors = errors.filter((e) => e.field === 'solution');
      expect(solutionErrors).toHaveLength(0);
    });

    it('should accept omitted solution', () => {
      const errors = validateProblemSchema(validProblem);
      const solutionErrors = errors.filter((e) => e.field === 'solution');
      expect(solutionErrors).toHaveLength(0);
    });

    it('should reject solution exceeding max length', () => {
      const errors = validateProblemSchema({
        ...validProblem,
        solution: 'x'.repeat(PROBLEM_VALIDATION_RULES.solution.maxLength + 1),
      });
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'solution', code: 'MAX_LENGTH' })
      );
    });
  });

  describe('classId validation', () => {
    it('should require classId', () => {
      const errors = validateProblemSchema({ title: 'Test', authorId: 'a', tags: [] });
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'classId', code: 'REQUIRED_FIELD' })
      );
    });

    it('should accept valid classId', () => {
      const errors = validateProblemSchema(validProblem);
      const classErrors = errors.filter((e) => e.field === 'classId');
      expect(classErrors).toHaveLength(0);
    });
  });
});

describe('serializeProblem / deserializeProblem', () => {
  const baseProblem: Problem = {
    id: 'p-1',
    namespaceId: 'ns-1',
    title: 'Test Problem',
    description: 'A description',
    starterCode: 'print("hi")',
    testCases: [],
    executionSettings: undefined,
    authorId: 'author-1',
    classId: 'class-1',
    tags: ['basics'],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
  };

  it('should round-trip solution through serialize/deserialize', () => {
    const withSolution: Problem = { ...baseProblem, solution: 'def solve(): return 42' };
    const serialized = serializeProblem(withSolution);
    expect(serialized.solution).toBe('def solve(): return 42');
    const deserialized = deserializeProblem(serialized);
    expect(deserialized.solution).toBe('def solve(): return 42');
  });

  it('should handle undefined solution in round-trip', () => {
    const serialized = serializeProblem(baseProblem);
    expect(serialized.solution).toBeUndefined();
    const deserialized = deserializeProblem(serialized);
    expect(deserialized.solution).toBeUndefined();
  });
});
