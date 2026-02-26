/**
 * Tests for realtime event payload type interfaces (PLAT-pp4r.1).
 * Verifies that all 8 event payload interfaces and the envelope type
 * match the Go backend struct definitions in go-backend/internal/realtime/events.go.
 */
import type {
  RealtimeEventType,
  RealtimeEventEnvelope,
  StudentJoinedData,
  StudentCodeUpdatedData,
  SessionEndedData,
  SessionReplacedData,
  FeaturedStudentChangedData,
  ProblemUpdatedData,
  SessionStartedInSectionData,
  SessionEndedInSectionData,
} from '../realtime-events';

describe('RealtimeEventType union', () => {
  it('accepts all 8 valid event type strings', () => {
    const types: RealtimeEventType[] = [
      'student_joined',
      'student_code_updated',
      'session_ended',
      'session_replaced',
      'featured_student_changed',
      'problem_updated',
      'session_started_in_section',
      'session_ended_in_section',
    ];
    expect(types).toHaveLength(8);
  });
});

describe('RealtimeEventEnvelope', () => {
  it('has type, data, and timestamp fields', () => {
    const envelope: RealtimeEventEnvelope<StudentJoinedData> = {
      type: 'student_joined',
      data: { user_id: 'u-1', display_name: 'Alice' },
      timestamp: '2026-02-26T18:00:00.000Z',
    };
    expect(envelope.type).toBe('student_joined');
    expect(envelope.timestamp).toBe('2026-02-26T18:00:00.000Z');
  });

  it('defaults generic parameter to unknown', () => {
    const envelope: RealtimeEventEnvelope = {
      type: 'session_ended',
      data: { session_id: 's-1', reason: 'manual' },
      timestamp: '2026-02-26T18:00:00.000Z',
    };
    expect(envelope.data).toBeDefined();
  });
});

describe('StudentJoinedData', () => {
  it('has user_id and display_name fields (matching Go JSON tags)', () => {
    const data: StudentJoinedData = {
      user_id: 'u-1',
      display_name: 'Alice',
    };
    expect(data.user_id).toBe('u-1');
    expect(data.display_name).toBe('Alice');
  });
});

describe('StudentCodeUpdatedData', () => {
  it('has user_id, code, and optional execution_settings fields', () => {
    const data: StudentCodeUpdatedData = {
      user_id: 'u-1',
      code: 'print("hello")',
    };
    expect(data.user_id).toBe('u-1');
    expect(data.code).toBe('print("hello")');
    expect(data.execution_settings).toBeUndefined();
  });

  it('accepts execution_settings when provided', () => {
    const data: StudentCodeUpdatedData = {
      user_id: 'u-1',
      code: 'print("hello")',
      execution_settings: { stdin: 'input' },
    };
    expect(data.execution_settings).toEqual({ stdin: 'input' });
  });
});

describe('SessionEndedData', () => {
  it('has session_id and reason fields (matching Go JSON tags)', () => {
    const data: SessionEndedData = {
      session_id: 's-1',
      reason: 'manual',
    };
    expect(data.session_id).toBe('s-1');
    expect(data.reason).toBe('manual');
  });
});

describe('SessionReplacedData', () => {
  it('has new_session_id field in snake_case (matching Go JSON tag)', () => {
    const data: SessionReplacedData = {
      new_session_id: 's-2',
    };
    expect(data.new_session_id).toBe('s-2');
  });
});

describe('FeaturedStudentChangedData', () => {
  it('has user_id, code, and optional execution_settings fields', () => {
    const data: FeaturedStudentChangedData = {
      user_id: 'u-2',
      code: 'print("featured")',
    };
    expect(data.user_id).toBe('u-2');
    expect(data.code).toBe('print("featured")');
  });

  it('accepts execution_settings when provided', () => {
    const data: FeaturedStudentChangedData = {
      user_id: 'u-2',
      code: 'print("featured")',
      execution_settings: { stdin: 'val' },
    };
    expect(data.execution_settings).toEqual({ stdin: 'val' });
  });
});

describe('ProblemUpdatedData', () => {
  it('has problem_id field (matching Go JSON tag)', () => {
    const data: ProblemUpdatedData = {
      problem_id: 'p-1',
    };
    expect(data.problem_id).toBe('p-1');
  });
});

describe('SessionStartedInSectionData', () => {
  it('has session_id and problem fields (problem is unknown/json.RawMessage)', () => {
    const data: SessionStartedInSectionData = {
      session_id: 's-1',
      problem: { id: 'p-1', title: 'Test Problem' },
    };
    expect(data.session_id).toBe('s-1');
    expect(data.problem).toBeDefined();
  });
});

describe('SessionEndedInSectionData', () => {
  it('has session_id field (matching Go JSON tag)', () => {
    const data: SessionEndedInSectionData = {
      session_id: 's-1',
    };
    expect(data.session_id).toBe('s-1');
  });
});

describe('RealtimeEventEnvelope with all event types', () => {
  it('works as a typed envelope for each event payload', () => {
    const studentJoined: RealtimeEventEnvelope<StudentJoinedData> = {
      type: 'student_joined',
      data: { user_id: 'u-1', display_name: 'Alice' },
      timestamp: '2026-02-26T18:00:00.000Z',
    };
    const sessionEnded: RealtimeEventEnvelope<SessionEndedData> = {
      type: 'session_ended',
      data: { session_id: 's-1', reason: 'manual' },
      timestamp: '2026-02-26T18:01:00.000Z',
    };
    const sectionSessionStarted: RealtimeEventEnvelope<SessionStartedInSectionData> = {
      type: 'session_started_in_section',
      data: { session_id: 's-1', problem: null },
      timestamp: '2026-02-26T18:02:00.000Z',
    };

    expect(studentJoined.data.user_id).toBe('u-1');
    expect(sessionEnded.data.reason).toBe('manual');
    expect(sectionSessionStarted.data.session_id).toBe('s-1');
  });
});
