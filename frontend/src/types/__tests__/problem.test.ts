/**
 * Tests for problem type hierarchy and mapper functions.
 *
 * Verifies that:
 * - Problem in api.ts is the wire type (string timestamps, unknown fields)
 * - Problem in problem.ts is the rich client type (Date timestamps, typed fields)
 * - mapApiProblem converts wire -> client
 */
import type { Problem as ApiProblem } from '../api';
import type { Problem as ClientProblem } from '../problem';
import { mapApiProblem } from '../problem';

describe('Problem type hierarchy', () => {
  const apiProblem: ApiProblem = {
    id: 'p-1',
    namespace_id: 'ns-1',
    title: 'Two Sum',
    description: 'Find two numbers',
    starter_code: 'def solve():',
    test_cases: [{ name: 'basic', input: '1 2', expected_output: '3', match_type: 'exact', order: 0 }],
    author_id: 'u-1',
    class_id: 'c-1',
    tags: ['arrays'],
    solution: 'return a+b',
    language: 'python',
    created_at: '2025-01-15T10:00:00.000Z',
    updated_at: '2025-01-16T12:00:00.000Z',
  };

  it('mapApiProblem converts string timestamps to Date objects', () => {
    const client = mapApiProblem(apiProblem);
    expect(client.created_at).toBeInstanceOf(Date);
    expect(client.updated_at).toBeInstanceOf(Date);
    expect(client.created_at.toISOString()).toBe('2025-01-15T10:00:00.000Z');
    expect(client.updated_at.toISOString()).toBe('2025-01-16T12:00:00.000Z');
  });

  it('mapApiProblem preserves all scalar fields', () => {
    const client = mapApiProblem(apiProblem);
    expect(client.id).toBe('p-1');
    expect(client.namespace_id).toBe('ns-1');
    expect(client.title).toBe('Two Sum');
    expect(client.description).toBe('Find two numbers');
    expect(client.starter_code).toBe('def solve():');
    expect(client.author_id).toBe('u-1');
    expect(client.class_id).toBe('c-1');
    expect(client.tags).toEqual(['arrays']);
    expect(client.solution).toBe('return a+b');
  });

  it('mapApiProblem passes through test_cases from wire format (IOTestCase[])', () => {
    const client = mapApiProblem(apiProblem);
    expect(client.test_cases).toBeDefined();
    expect(Array.isArray(client.test_cases)).toBe(true);
    const tcArray = client.test_cases as import('@/types/api').IOTestCase[];
    expect(tcArray[0].name).toBe('basic');
    expect(tcArray[0].input).toBe('1 2');
    expect(tcArray[0].match_type).toBe('exact');
  });

  it('mapApiProblem handles null optional fields', () => {
    const minimal: ApiProblem = {
      ...apiProblem,
      description: null,
      starter_code: null,
      test_cases: null,
      class_id: null,
      solution: null,
    };
    const client = mapApiProblem(minimal);
    expect(client.description).toBeNull();
    expect(client.starter_code).toBeNull();
    expect(client.test_cases).toBeNull();
    expect(client.class_id).toBeNull();
    expect(client.solution).toBeNull();
  });

  it('mapApiProblem passes through language field', () => {
    const client = mapApiProblem(apiProblem);
    expect(client.language).toBe('python');
  });

  it('mapApiProblem passes through java language field', () => {
    const javaApiProblem: ApiProblem = { ...apiProblem, language: 'java' };
    const client = mapApiProblem(javaApiProblem);
    expect(client.language).toBe('java');
  });
});
