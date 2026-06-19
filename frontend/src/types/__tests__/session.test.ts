/**
 * Tests for session type hierarchy and mapper functions.
 *
 * After PLAT-st42.2:
 * - Student.test_cases is IOTestCase[] (replaces execution_settings?: ExecutionSettings)
 * - Session.featured_test_cases is IOTestCase[] | null (replaces ExecutionSettings | null)
 * - api.ts Session and SessionPublicState.featured_test_cases are IOTestCase[] | null
 */
import type { Session as ApiSession, SessionPublicState, IOTestCase } from '../api';
import type { Student, Session as ClientSession } from '../session';
import { mapSession } from '../session';

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
    featured_test_cases: null,
    creator_id: 'u-1',
    participants: ['u-1', 'u-2'],
    status: 'active',
    created_at: '2025-01-15T10:00:00.000Z',
    last_activity: '2025-01-15T11:00:00.000Z',
    ended_at: '2025-01-15T12:00:00.000Z',
  };

  it('mapSession converts string timestamps to Date objects', () => {
    const client = mapSession(apiSession);
    expect(client.created_at).toBeInstanceOf(Date);
    expect(client.last_activity).toBeInstanceOf(Date);
    expect(client.ended_at).toBeInstanceOf(Date);
    expect(client.created_at.toISOString()).toBe('2025-01-15T10:00:00.000Z');
    expect(client.last_activity.toISOString()).toBe('2025-01-15T11:00:00.000Z');
    expect((client.ended_at as Date).toISOString()).toBe('2025-01-15T12:00:00.000Z');
  });

  it('mapSession preserves all scalar fields', () => {
    const client = mapSession(apiSession);
    expect(client.id).toBe('s-1');
    expect(client.namespace_id).toBe('ns-1');
    expect(client.section_id).toBe('sec-1');
    expect(client.section_name).toBe('Section A');
    expect(client.creator_id).toBe('u-1');
    expect(client.participants).toEqual(['u-1', 'u-2']);
    expect(client.status).toBe('active');
    expect(client.featured_student_id).toBe('u-2');
    expect(client.featured_code).toBe('print("hi")');
    expect(client.featured_test_cases).toBeNull();
  });

  it('mapSession handles null ended_at', () => {
    const session = { ...apiSession, ended_at: null };
    const client = mapSession(session);
    expect(client.ended_at).toBeNull();
  });

  it('mapSession maps the nested wire problem into a rich Problem (Date timestamps, normalized test_cases)', () => {
    const client = mapSession(apiSession);
    expect(client.problem).not.toBeNull();
    const problem = client.problem!;
    // Scalars carried through
    expect(problem.id).toBe('p-1');
    expect(problem.title).toBe('Test');
    expect(problem.description).toBe('A test problem');
    expect(problem.starter_code).toBe('print("hello")');
    expect(problem.language).toBe('python');
    // Wire null test_cases normalized to []
    expect(problem.test_cases).toEqual([]);
    // ISO-string timestamps parsed to Date objects
    expect(problem.created_at).toBeInstanceOf(Date);
    expect(problem.updated_at).toBeInstanceOf(Date);
    expect(problem.created_at.toISOString()).toBe('2025-01-15T10:00:00.000Z');
  });

  it('mapSession preserves the nested problem test_cases when present', () => {
    const testCases: IOTestCase[] = [
      { kind: 'io' as const, name: 'case 1', input: 'hello', match_type: 'exact', order: 0 },
    ];
    const session: ApiSession = {
      ...apiSession,
      problem: { ...apiSession.problem!, test_cases: testCases },
    };
    const client = mapSession(session);
    expect(client.problem!.test_cases).toEqual(testCases);
  });

  it('mapSession maps a blank session (null problem) to null', () => {
    const session: ApiSession = { ...apiSession, problem: null };
    const client = mapSession(session);
    expect(client.problem).toBeNull();
  });

  it('mapSession carries featured_test_cases through', () => {
    const testCases: IOTestCase[] = [
      { kind: 'io' as const, name: 'feat', input: 'in', match_type: 'exact', order: 0 },
    ];
    const session: ApiSession = { ...apiSession, featured_test_cases: testCases };
    const client = mapSession(session);
    expect(client.featured_test_cases).toEqual(testCases);
  });

  it('mapSession return type exposes a typed rich problem (Date timestamps)', () => {
    const mapped = mapSession(apiSession);
    // Access problem.created_at as a Date directly — only compiles if problem is
    // the rich Problem type (not the wire string-timestamp shape).
    if (mapped.problem !== null) {
      expect(mapped.problem.title).toBe('Test');
      expect(mapped.problem.created_at.getFullYear()).toBe(2025);
    }
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

  it('ApiSession.featured_test_cases accepts IOTestCase[] | null', () => {
    const testCases: IOTestCase[] = [
      { kind: 'io' as const, name: 'case 1', input: 'hello', match_type: 'exact', order: 0 },
    ];
    const sessionWithCases: ApiSession = { ...apiSession, featured_test_cases: testCases };
    expect(sessionWithCases.featured_test_cases).toEqual(testCases);
  });

  it('ApiSession.featured_test_cases accepts null', () => {
    const sessionNullCases: ApiSession = { ...apiSession, featured_test_cases: null };
    expect(sessionNullCases.featured_test_cases).toBeNull();
  });
});

describe('Student type', () => {
  it('Student has test_cases field typed as IOTestCase[]', () => {
    const testCases: IOTestCase[] = [
      { kind: 'io' as const, name: 'default', input: 'hello', match_type: 'exact', order: 0 },
    ];
    const student: Student = {
      user_id: 'u-1',
      name: 'Alice',
      code: 'print("hi")',
      last_update: new Date(),
      test_cases: testCases,
    };
    expect(student.test_cases).toEqual(testCases);
  });

  it('Student test_cases can be empty array', () => {
    const student: Student = {
      user_id: 'u-1',
      name: 'Alice',
      code: '',
      last_update: new Date(),
      test_cases: [],
    };
    expect(student.test_cases).toEqual([]);
  });

  it('Student.test_cases is optional (can be omitted)', () => {
    const student: Student = {
      user_id: 'u-1',
      name: 'Alice',
      code: '',
      last_update: new Date(),
    };
    expect(student.test_cases).toBeUndefined();
  });

  it('Student does NOT have execution_settings field', () => {
    const student: Student = {
      user_id: 'u-1',
      name: 'Alice',
      code: '',
      last_update: new Date(),
    };
    // @ts-expect-error execution_settings should not exist on Student
    expect(student.execution_settings).toBeUndefined();
  });
});

describe('ClientSession type', () => {
  it('Session.featured_test_cases accepts IOTestCase[]', () => {
    const testCases: IOTestCase[] = [
      { kind: 'io' as const, name: 'case', input: 'input', match_type: 'exact', order: 0 },
    ];
    const session: Partial<ClientSession> = {
      featured_test_cases: testCases,
    };
    expect(session.featured_test_cases).toEqual(testCases);
  });

  it('Session.featured_test_cases can be null', () => {
    const session: Partial<ClientSession> = {
      featured_test_cases: null,
    };
    expect(session.featured_test_cases).toBeNull();
  });
});

describe('SessionPublicState type', () => {
  it('SessionPublicState.problem is typed with title/description/starter_code', () => {
    const state: SessionPublicState = {
      problem: {
        id: 'p-1',
        namespace_id: 'ns-1',
        title: 'Test Problem',
        description: 'desc',
        starter_code: 'code',
        language: 'python',
        test_cases: null,
        author_id: 'u-1',
        class_id: null,
        tags: [],
        solution: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
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

  it('SessionPublicState.featured_test_cases accepts IOTestCase[]', () => {
    const testCases: IOTestCase[] = [
      { kind: 'io' as const, name: 'case', input: 'input', match_type: 'exact', order: 0 },
    ];
    const state: SessionPublicState = {
      problem: null,
      featured_student_id: 'u-1',
      featured_code: 'print("hello")',
      featured_test_cases: testCases,
      join_code: 'ABC',
      status: 'active',
    };
    expect(state.featured_test_cases).toEqual(testCases);
  });
});
