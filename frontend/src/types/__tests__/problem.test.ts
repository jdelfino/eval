/**
 * Tests for problem type hierarchy and mapper functions.
 *
 * Verifies that:
 * - Problem in api.ts is the wire type (string timestamps, nullable fields)
 * - Problem in problem.ts is the rich client type (Date timestamps, typed fields)
 * - mapApiProblem converts wire -> client
 * - IOTestCase and TestResult types have the correct shape
 */
import type { Problem as ApiProblem } from '../api';
import type { IOTestCase, TestResult } from '../problem';
import { mapApiProblem } from '../problem';

// A minimal IOTestCase for use in wire-format test data.
const sampleIOTestCase: IOTestCase = {
  name: 'basic',
  input: '1 2',
  expected_output: '3',
  match_type: 'exact',
  order: 0,
};

describe('Problem type hierarchy', () => {
  const apiProblem: ApiProblem = {
    id: 'p-1',
    namespace_id: 'ns-1',
    title: 'Two Sum',
    description: 'Find two numbers',
    starter_code: 'def solve():',
    test_cases: [sampleIOTestCase],
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

  it('mapApiProblem types test_cases as IOTestCase[]', () => {
    const client = mapApiProblem(apiProblem);
    expect(client.test_cases).toBeDefined();
    expect(Array.isArray(client.test_cases)).toBe(true);
    const tc = (client.test_cases as import('@/types/problem').IOTestCase[])[0];
    expect(tc.name).toBe('basic');
    expect(tc.input).toBe('1 2');
    expect(tc.expected_output).toBe('3');
    expect(tc.match_type).toBe('exact');
    expect(tc.order).toBe(0);
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

  it('mapApiProblem does not include execution_settings on client Problem', () => {
    const client = mapApiProblem(apiProblem);
    // execution_settings should not be a field on the client Problem type
    expect('execution_settings' in client).toBe(false);
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

describe('IOTestCase type shape', () => {
  it('accepts required fields', () => {
    const tc: IOTestCase = {
      name: 'test1',
      input: 'hello',
      match_type: 'exact',
      order: 0,
    };
    expect(tc.name).toBe('test1');
    expect(tc.input).toBe('hello');
    expect(tc.match_type).toBe('exact');
    expect(tc.order).toBe(0);
    expect(tc.expected_output).toBeUndefined();
  });

  it('accepts optional fields', () => {
    const tc: IOTestCase = {
      name: 'seeded',
      input: 'x',
      match_type: 'exact',
      order: 1,
      expected_output: 'y',
      random_seed: 42,
      attached_files: [{ name: 'data.txt', content: 'abc' }],
    };
    expect(tc.expected_output).toBe('y');
    expect(tc.random_seed).toBe(42);
    expect(tc.attached_files).toHaveLength(1);
    expect(tc.attached_files![0].name).toBe('data.txt');
  });

  it('accepts all MatchType variants', () => {
    const exact: IOTestCase = { name: 'a', input: '', match_type: 'exact', order: 0 };
    const contains: IOTestCase = { name: 'b', input: '', match_type: 'contains', order: 1 };
    const regex: IOTestCase = { name: 'c', input: '', match_type: 'regex', order: 2 };
    expect(exact.match_type).toBe('exact');
    expect(contains.match_type).toBe('contains');
    expect(regex.match_type).toBe('regex');
  });
});

describe('TestResult type shape', () => {
  it('accepts passed result', () => {
    const r: TestResult = {
      name: 'test1',
      type: 'io',
      status: 'passed',
      input: 'hello',
      expected: 'hello',
      actual: 'hello',
      time_ms: 12,
    };
    expect(r.status).toBe('passed');
    expect(r.type).toBe('io');
  });

  it('accepts failed result', () => {
    const r: TestResult = {
      name: 'test2',
      type: 'io',
      status: 'failed',
      input: 'hello',
      expected: 'HELLO',
      actual: 'hello',
      time_ms: 8,
    };
    expect(r.status).toBe('failed');
  });

  it('accepts error result with stderr', () => {
    const r: TestResult = {
      name: 'crash-test',
      type: 'io',
      status: 'error',
      time_ms: 5,
      stderr: 'NameError: name x is not defined',
    };
    expect(r.status).toBe('error');
    expect(r.stderr).toBeDefined();
    expect(r.input).toBeUndefined();
    expect(r.expected).toBeUndefined();
    expect(r.actual).toBeUndefined();
  });
});
