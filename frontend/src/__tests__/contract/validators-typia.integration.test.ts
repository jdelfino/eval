/**
 * Unit tests for the contract validators acceptance criteria.
 *
 * These tests verify that typia.assert<T>() properly enforces structural
 * correctness — rejecting mismatched field names, extra fields, and missing
 * required fields. This is the core contract of the typia migration:
 * validators must fail when the wire shape deviates from the TypeScript type.
 *
 * If typia is not properly wired (e.g., the AST transformer is missing), these
 * tests will pass vacuously, which would be a false negative. The transformer
 * config in jest.config.js must be present for these to work correctly.
 */

import {
  validateUserShape,
  validateSessionShape,
  validateSessionStudentShape,
  validateTestResponseShape,
  validateStudentWorkShape,
  validateStudentProgressShape,
  validateStudentJoinedShape,
  validateSessionEndedShape,
} from './validators';

// ---------------------------------------------------------------------------
// Epic acceptance test #1: field name mismatch → validator rejects it
// ---------------------------------------------------------------------------

describe('typia validators — field name mismatch', () => {
  it('rejects a User with a wrong field name (Email instead of email)', () => {
    // Simulate a backend bug that returns PascalCase instead of snake_case
    const badUser = {
      id: 'u1',
      Email: 'test@example.com', // wrong field name
      role: 'student',
      external_id: null,
      namespace_id: null,
      display_name: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    expect(() => validateUserShape(badUser as any)).toThrow();
  });

  it('rejects a SessionStudent with wrong field name (userId instead of user_id)', () => {
    const bad = {
      id: 's1',
      session_id: 'sess1',
      userId: 'u1', // wrong field name
      name: 'Alice',
      code: 'print("hi")',
      test_cases: null,
      joined_at: '2024-01-01T00:00:00Z',
    };
    expect(() => validateSessionStudentShape(bad as any)).toThrow();
  });

  it('rejects a StudentJoinedData with wrong field name (displayName instead of display_name)', () => {
    const bad = {
      user_id: 'u1',
      displayName: 'Alice', // wrong field name — camelCase instead of snake_case
    };
    expect(() => validateStudentJoinedShape(bad as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Epic acceptance test #2: unexpected field → validator rejects it
// ---------------------------------------------------------------------------

describe('typia validators — unexpected extra fields', () => {
  it('rejects a User with an unexpected extra field', () => {
    const extraFieldUser = {
      id: 'u1',
      email: 'test@example.com',
      role: 'student',
      external_id: null,
      namespace_id: null,
      display_name: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      extra_field: 'should not be here', // unexpected
    };
    expect(() => validateUserShape(extraFieldUser as any)).toThrow();
  });

  it('rejects a SessionStudent with an unexpected extra field', () => {
    const extra = {
      id: 's1',
      session_id: 'sess1',
      user_id: 'u1',
      name: 'Alice',
      code: 'print("hi")',
      test_cases: null,
      joined_at: '2024-01-01T00:00:00Z',
      unexpected: true, // unexpected
    };
    expect(() => validateSessionStudentShape(extra as any)).toThrow();
  });

  it('rejects a SessionEndedData with an unexpected extra field', () => {
    const extra = {
      session_id: 'sess1',
      reason: 'completed',
      extra: 'oops', // unexpected
    };
    expect(() => validateSessionEndedShape(extra as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Epic acceptance test #3: missing required field → validator rejects it
// ---------------------------------------------------------------------------

describe('typia validators — missing required fields', () => {
  it('rejects a User missing the email field', () => {
    const missing = {
      id: 'u1',
      // email missing
      role: 'student',
      external_id: null,
      namespace_id: null,
      display_name: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    expect(() => validateUserShape(missing as any)).toThrow();
  });

  it('rejects a TestResponse missing the summary field', () => {
    const missing = {
      results: [],
      // summary missing
    };
    expect(() => validateTestResponseShape(missing as any)).toThrow();
  });

  it('rejects a StudentWork missing the user_id field', () => {
    const missing = {
      id: 'sw1',
      // user_id missing
      section_id: 'sec1',
      problem_id: 'prob1',
      code: 'print("hi")',
      test_cases: [],
      last_update: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(() => validateStudentWorkShape(missing as any)).toThrow();
  });

  it('rejects a StudentProgress missing the problems_started field', () => {
    const missing = {
      user_id: 'u1',
      display_name: 'Alice',
      email: 'alice@example.com',
      // problems_started missing
      total_problems: 5,
      last_active: null,
    };
    expect(() => validateStudentProgressShape(missing as any)).toThrow();
  });

  it('rejects a SessionStudent missing the joined_at field', () => {
    const missing = {
      id: 's1',
      session_id: 'sess1',
      user_id: 'u1',
      name: 'Alice',
      code: '',
      test_cases: null,
      // joined_at missing
    };
    expect(() => validateSessionStudentShape(missing as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Sanity: valid objects pass validators
// ---------------------------------------------------------------------------

describe('typia validators — valid objects pass', () => {
  it('accepts a well-formed User', () => {
    const valid = {
      id: 'u1',
      email: 'test@example.com',
      role: 'student' as const,
      external_id: null,
      namespace_id: null,
      display_name: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    expect(() => validateUserShape(valid)).not.toThrow();
  });

  it('accepts a well-formed SessionStudent', () => {
    const valid = {
      id: 's1',
      session_id: 'sess1',
      user_id: 'u1',
      name: 'Alice',
      code: 'print("hi")',
      test_cases: null,
      joined_at: '2024-01-01T00:00:00Z',
    };
    expect(() => validateSessionStudentShape(valid)).not.toThrow();
  });

  it('accepts a well-formed StudentJoinedData', () => {
    const valid = {
      user_id: 'u1',
      display_name: 'Alice',
    };
    expect(() => validateStudentJoinedShape(valid)).not.toThrow();
  });

  it('accepts a well-formed SessionEndedData', () => {
    const valid = {
      session_id: 'sess1',
      reason: 'completed',
    };
    expect(() => validateSessionEndedShape(valid)).not.toThrow();
  });
});
