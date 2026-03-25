/**
 * Unit tests for realtime event type definitions.
 *
 * Verifies that TypeScript interfaces match the JSON field names sent
 * by the Go backend exactly.
 */

import type {
  StudentCodeUpdatedData,
  FeaturedStudentChangedData,
  SessionStartedInSectionData,
} from '../realtime-events';
import type { ExecutionSettings } from '../problem';

describe('Realtime event types', () => {
  describe('StudentCodeUpdatedData', () => {
    it('should have test_cases field matching Go JSON tag', () => {
      // This test verifies that the TS interface declares test_cases,
      // not execution_settings. The Go backend sends test_cases.
      const data: StudentCodeUpdatedData = {
        user_id: 'user-1',
        code: 'print("test")',
        test_cases: { stdin: 'input', random_seed: 42 },
      };

      expect(data.test_cases).toEqual({ stdin: 'input', random_seed: 42 });
      // @ts-expect-error execution_settings should not exist
      expect(data.execution_settings).toBeUndefined();
    });

    it('should accept ExecutionSettings type for test_cases field', () => {
      const settings: ExecutionSettings = {
        stdin: 'test input',
        random_seed: 123,
        attached_files: [{ name: 'data.txt', content: 'test data' }],
      };

      const data: StudentCodeUpdatedData = {
        user_id: 'user-1',
        code: 'print("test")',
        test_cases: settings,
      };

      expect(data.test_cases).toBe(settings);
    });

    it('should accept optional test_cases field', () => {
      const data: StudentCodeUpdatedData = {
        user_id: 'user-1',
        code: 'print("test")',
      };

      expect(data.test_cases).toBeUndefined();
    });
  });

  describe('FeaturedStudentChangedData', () => {
    it('should have test_cases field matching Go JSON tag', () => {
      const data: FeaturedStudentChangedData = {
        user_id: 'user-1',
        code: 'print("featured")',
        test_cases: { stdin: 'input', random_seed: 99 },
      };

      expect(data.test_cases).toEqual({ stdin: 'input', random_seed: 99 });
      // @ts-expect-error execution_settings should not exist
      expect(data.execution_settings).toBeUndefined();
    });

    it('should accept ExecutionSettings type for test_cases field', () => {
      const settings: ExecutionSettings = {
        stdin: 'featured input',
        random_seed: 456,
      };

      const data: FeaturedStudentChangedData = {
        user_id: 'user-1',
        code: 'print("featured")',
        test_cases: settings,
      };

      expect(data.test_cases).toBe(settings);
    });

    it('should accept optional test_cases field', () => {
      const data: FeaturedStudentChangedData = {
        user_id: 'user-1',
        code: 'print("featured")',
      };

      expect(data.test_cases).toBeUndefined();
    });
  });

  describe('SessionStartedInSectionData', () => {
    it('should have problem field with concrete type, not unknown', () => {
      // The problem field should be typed as a Problem-like structure,
      // not unknown. This test verifies the type accepts standard problem fields.
      const data: SessionStartedInSectionData = {
        session_id: 'session-1',
        problem: {
          id: 'prob-1',
          namespace_id: 'ns-1',
          title: 'Test Problem',
          description: 'A test problem',
          starter_code: 'print("hello")',
          test_cases: null,
          execution_settings: null,
          author_id: 'author-1',
          class_id: null,
          tags: [],
          solution: null,
          language: 'python',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      };

      expect(data.problem.title).toBe('Test Problem');
      expect(data.problem.language).toBe('python');
    });

    it('should accept full Problem object', () => {
      const data: SessionStartedInSectionData = {
        session_id: 'session-1',
        problem: {
          id: 'prob-1',
          namespace_id: 'ns-1',
          title: 'Full Problem',
          description: 'Description',
          starter_code: 'pass',
          test_cases: null,
          execution_settings: null,
          author_id: 'author-1',
          class_id: null,
          tags: ['tag1'],
          solution: null,
          language: 'python',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      };

      expect(data.problem.title).toBe('Full Problem');
    });
  });
});
