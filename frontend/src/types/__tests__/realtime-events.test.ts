/**
 * Unit tests for realtime event type definitions.
 *
 * Verifies that TypeScript interfaces match the JSON field names sent
 * by the Go backend exactly. After PLAT-st42.2, test_cases fields use
 * IOTestCase[] instead of ExecutionSettings.
 */

import type {
  StudentCodeUpdatedData,
  FeaturedStudentChangedData,
} from '../realtime-events';
import type { IOTestCase } from '../api';

describe('Realtime event types', () => {
  describe('StudentCodeUpdatedData', () => {
    it('should have test_cases field matching Go JSON tag', () => {
      // This test verifies that the TS interface declares test_cases,
      // not execution_settings. The Go backend sends test_cases as IOTestCase[].
      const data: StudentCodeUpdatedData = {
        user_id: 'user-1',
        code: 'print("test")',
        test_cases: [{ kind: 'io' as const, name: 'default', input: 'hello', match_type: 'exact', order: 0 }],
      };

      expect(data.test_cases).toHaveLength(1);
      expect((data.test_cases as IOTestCase[])[0].kind).toBe('io');
      const ioCase = (data.test_cases as IOTestCase[])[0];
      expect(ioCase.kind === 'io' ? ioCase.input : undefined).toBe('hello');
      // @ts-expect-error execution_settings should not exist
      expect(data.execution_settings).toBeUndefined();
    });

    it('should accept IOTestCase[] type for test_cases field', () => {
      const testCases: IOTestCase[] = [
        {
          kind: 'io',
          name: 'case 1',
          input: 'test input',
          match_type: 'exact',
          order: 0,
          random_seed: 123,
          attached_files: [{ name: 'data.txt', content: 'test data' }],
        },
      ];

      const data: StudentCodeUpdatedData = {
        user_id: 'user-1',
        code: 'print("test")',
        test_cases: testCases,
      };

      expect(data.test_cases).toBe(testCases);
    });

    it('should accept optional test_cases field', () => {
      const data: StudentCodeUpdatedData = {
        user_id: 'user-1',
        code: 'print("test")',
      };

      expect(data.test_cases).toBeUndefined();
    });

    it('should accept empty array for test_cases', () => {
      const data: StudentCodeUpdatedData = {
        user_id: 'user-1',
        code: 'print("test")',
        test_cases: [],
      };

      expect(data.test_cases).toEqual([]);
    });
  });

  describe('FeaturedStudentChangedData', () => {
    it('should have test_cases field matching Go JSON tag', () => {
      const data: FeaturedStudentChangedData = {
        user_id: 'user-1',
        code: 'print("featured")',
        test_cases: [{ kind: 'io' as const, name: 'default', input: 'input value', match_type: 'exact', order: 0 }],
      };

      expect(data.test_cases).toHaveLength(1);
      const featuredCase = (data.test_cases as IOTestCase[])[0];
      expect(featuredCase.kind === 'io' ? featuredCase.input : undefined).toBe('input value');
      // @ts-expect-error execution_settings should not exist
      expect(data.execution_settings).toBeUndefined();
    });

    it('should accept IOTestCase[] type for test_cases field', () => {
      const testCases: IOTestCase[] = [
        {
          kind: 'io',
          name: 'featured case',
          input: 'featured input',
          match_type: 'exact',
          order: 0,
          random_seed: 456,
        },
      ];

      const data: FeaturedStudentChangedData = {
        user_id: 'user-1',
        code: 'print("featured")',
        test_cases: testCases,
      };

      expect(data.test_cases).toBe(testCases);
    });

    it('should accept optional test_cases field', () => {
      const data: FeaturedStudentChangedData = {
        user_id: 'user-1',
        code: 'print("featured")',
      };

      expect(data.test_cases).toBeUndefined();
    });
  });
});
