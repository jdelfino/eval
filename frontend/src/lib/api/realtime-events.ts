/**
 * Typed realtime event parsing library.
 *
 * Mirrors how lib/api/*.ts wraps REST endpoints with typed functions.
 * Hooks import parseRealtimeEvent() and switch on the returned discriminated
 * union — TypeScript narrows .data automatically per event type.
 *
 * The raw Centrifugo wire envelope is RealtimeEventEnvelope (types/realtime-events.ts).
 * This module exposes the RealtimeEvent discriminated union for consumer type-safety.
 */

import type {
  RealtimeEventType,
  StudentJoinedData,
  StudentCodeUpdatedData,
  SessionEndedData,
  SessionReplacedData,
  FeaturedStudentChangedData,
  ProblemUpdatedData,
  SessionStartedInSectionData,
  SessionEndedInSectionData,
} from '@/types/realtime-events';

// ---------------------------------------------------------------------------
// Discriminated union — one member per event type
// ---------------------------------------------------------------------------

interface ParsedEvent<T extends RealtimeEventType, D> {
  type: T;
  data: D;
  timestamp: string;
}

export type RealtimeEvent =
  | ParsedEvent<'student_joined', StudentJoinedData>
  | ParsedEvent<'student_code_updated', StudentCodeUpdatedData>
  | ParsedEvent<'session_ended', SessionEndedData>
  | ParsedEvent<'session_replaced', SessionReplacedData>
  | ParsedEvent<'featured_student_changed', FeaturedStudentChangedData>
  | ParsedEvent<'problem_updated', ProblemUpdatedData>
  | ParsedEvent<'session_started_in_section', SessionStartedInSectionData>
  | ParsedEvent<'session_ended_in_section', SessionEndedInSectionData>;

// ---------------------------------------------------------------------------
// Known event type set for validation
// ---------------------------------------------------------------------------

const KNOWN_EVENT_TYPES = new Set<RealtimeEventType>([
  'student_joined',
  'student_code_updated',
  'session_ended',
  'session_replaced',
  'featured_student_changed',
  'problem_updated',
  'session_started_in_section',
  'session_ended_in_section',
]);

function isKnownEventType(value: string): value is RealtimeEventType {
  return KNOWN_EVENT_TYPES.has(value as RealtimeEventType);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw Centrifugo publication payload into a typed discriminated union.
 *
 * Validates that the envelope has the required fields (type, data, timestamp)
 * and that the type is a known RealtimeEventType. Throws an Error for any
 * invalid input so callers are never silently given bad data.
 *
 * @param raw - The ctx.data value from a Centrifugo publication callback.
 * @returns A RealtimeEvent whose .data type is narrowed by .type.
 */
export function parseRealtimeEvent(raw: unknown): RealtimeEvent {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(
      `parseRealtimeEvent: expected an object, got ${raw === null ? 'null' : typeof raw}`
    );
  }

  const envelope = raw as Record<string, unknown>;

  if (!('type' in envelope)) {
    throw new Error('parseRealtimeEvent: missing required field "type"');
  }
  if (typeof envelope.type !== 'string') {
    throw new Error(
      `parseRealtimeEvent: "type" must be a string, got ${typeof envelope.type}`
    );
  }
  if (!isKnownEventType(envelope.type)) {
    throw new Error(
      `parseRealtimeEvent: unknown event type "${envelope.type}"`
    );
  }

  if (!('data' in envelope)) {
    throw new Error('parseRealtimeEvent: missing required field "data"');
  }

  if (!('timestamp' in envelope)) {
    throw new Error('parseRealtimeEvent: missing required field "timestamp"');
  }
  if (typeof envelope.timestamp !== 'string') {
    throw new Error(
      `parseRealtimeEvent: "timestamp" must be a string, got ${typeof envelope.timestamp}`
    );
  }

  // The data field is passed through as-is; we trust the backend wire format
  // matches the typed interface. Contract tests (PLAT-pp4r.4) enforce this.
  return {
    type: envelope.type,
    data: envelope.data,
    timestamp: envelope.timestamp,
  } as RealtimeEvent;
}
