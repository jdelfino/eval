/**
 * Tests for session type hierarchy and mapper functions.
 */
import type { Session as ApiSession, Problem, SessionPublicState } from '../api';
import { mapApiSession } from '../session';

describe('Session type hierarchy', () => {
  const apiSession: ApiSession = {
    id: 's-1',
    namespace_id: 'ns-1',
    section_id: 'sec-1',
    section_name: 'Section A',
    problem: {
      id: 'p-1',
      namespace_id: 'ns-1',
      title: 'Test',
      description: 'A test problem',
      starter_code: 'print("hello")',
      test_cases: null,
      execution_settings: null,
      author_id: 'u-1',
      class_id: null,
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2025-01-15T10:00:00.000Z',
      updated_at: '2025-01-15T10:00:00.000Z',
    },
    featured_student_id: 'u-2',
    featured_code: 'print("hi")',
    creator_id: 'u-1',
    participants: ['u-1', 'u-2'],
    status: 'active',
    created_at: '2025-01-15T10:00:00.000Z',
    last_activity: '2025-01-15T11:00:00.000Z',
    ended_at: '2025-01-15T12:00:00.000Z',
  };

  it('mapApiSession converts string timestamps to Date objects', () => {
    const client = mapApiSession(apiSession);
    expect(client.created_at).toBeInstanceOf(Date);
    expect(client.last_activity).toBeInstanceOf(Date);
    expect(client.ended_at).toBeInstanceOf(Date);
  });

  it('mapApiSession preserves all scalar fields', () => {
    const client = mapApiSession(apiSession);
    expect(client.id).toBe('s-1');
    expect(client.namespace_id).toBe('ns-1');
    expect(client.section_id).toBe('sec-1');
    expect(client.section_name).toBe('Section A');
    expect(client.creator_id).toBe('u-1');
    expect(client.participants).toEqual(['u-1', 'u-2']);
    expect(client.status).toBe('active');
    expect(client.featured_student_id).toBe('u-2');
    expect(client.featured_code).toBe('print("hi")');
  });

  it('mapApiSession handles null ended_at', () => {
    const session = { ...apiSession, ended_at: null };
    const client = mapApiSession(session);
    expect(client.ended_at).toBeNull();
  });

  it('Session.problem is typed as Problem | null, not unknown', () => {
    // Access typed fields directly without casts — this compiles only if problem is Problem | null
    const session = apiSession;
    const problem = session.problem;
    if (problem !== null) {
      expect(problem.title).toBe('Test');
      expect(problem.description).toBe('A test problem');
      expect(problem.starter_code).toBe('print("hello")');
    }
  });

  it('Session.problem null case is accepted by type', () => {
    const session: ApiSession = { ...apiSession, problem: null };
    expect(session.problem).toBeNull();
  });

  it('mapApiSession return type has typed problem field (Problem | null)', () => {
    const mapped = mapApiSession(apiSession);
    // Access problem.title directly — only compiles if problem is typed (not unknown)
    if (mapped.problem !== null) {
      expect(mapped.problem.title).toBe('Test');
      expect(mapped.problem.description).toBe('A test problem');
      expect(mapped.problem.starter_code).toBe('print("hello")');
    }
  });
});

describe('SessionPublicState type', () => {
  it('SessionPublicState.problem is typed with title/description/starter_code', () => {
    const state: SessionPublicState = {
      problem: { title: 'Test Problem', description: 'desc', starter_code: 'code', language: 'python' },
      featured_student_id: null,
      featured_code: null,
      featured_test_cases: null,
      join_code: 'ABC',
      status: 'active',
    };
    // Access typed fields directly — only compiles if problem is not unknown
    if (state.problem !== null) {
      expect(state.problem.title).toBe('Test Problem');
      expect(state.problem.description).toBe('desc');
      expect(state.problem.starter_code).toBe('code');
    }
  });

  it('SessionPublicState.problem null case is accepted', () => {
    const state: SessionPublicState = {
      problem: null,
      featured_student_id: null,
      featured_code: null,
      featured_test_cases: null,
      join_code: 'ABC',
      status: 'active',
    };
    expect(state.problem).toBeNull();
  });
});
