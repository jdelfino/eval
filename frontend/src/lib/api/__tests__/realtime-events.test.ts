/**
 * Unit tests for the typed realtime event parsing library.
 *
 * @jest-environment jsdom
 */

import { parseRealtimeEvent } from '../realtime-events';

describe('parseRealtimeEvent', () => {
  describe('valid events', () => {
    it('parses student_joined event', () => {
      const raw = {
        type: 'student_joined',
        data: { user_id: 'u1', display_name: 'Alice' },
        timestamp: '2026-01-01T00:00:00Z',
      };
      const parsed = parseRealtimeEvent(raw);
      expect(parsed.type).toBe('student_joined');
      expect(parsed.timestamp).toBe('2026-01-01T00:00:00Z');
      if (parsed.type === 'student_joined') {
        expect(parsed.data.user_id).toBe('u1');
        expect(parsed.data.display_name).toBe('Alice');
      }
    });

    it('parses student_code_updated event (without execution_settings)', () => {
      const raw = {
        type: 'student_code_updated',
        data: { user_id: 'u1', code: 'print("hello")' },
        timestamp: '2026-01-01T00:00:00Z',
      };
      const parsed = parseRealtimeEvent(raw);
      expect(parsed.type).toBe('student_code_updated');
      if (parsed.type === 'student_code_updated') {
        expect(parsed.data.user_id).toBe('u1');
        expect(parsed.data.code).toBe('print("hello")');
        expect(parsed.data.execution_settings).toBeUndefined();
      }
    });

    it('parses student_code_updated event (with execution_settings)', () => {
      const execSettings = { stdin: 'foo', random_seed: 42 };
      const raw = {
        type: 'student_code_updated',
        data: { user_id: 'u2', code: 'x = 1', execution_settings: execSettings },
        timestamp: '2026-01-01T00:00:00Z',
      };
      const parsed = parseRealtimeEvent(raw);
      expect(parsed.type).toBe('student_code_updated');
      if (parsed.type === 'student_code_updated') {
        expect(parsed.data.execution_settings).toEqual(execSettings);
      }
    });

    it('parses session_ended event', () => {
      const raw = {
        type: 'session_ended',
        data: { session_id: 'sess-1', reason: 'instructor_ended' },
        timestamp: '2026-01-01T00:00:00Z',
      };
      const parsed = parseRealtimeEvent(raw);
      expect(parsed.type).toBe('session_ended');
      if (parsed.type === 'session_ended') {
        expect(parsed.data.session_id).toBe('sess-1');
        expect(parsed.data.reason).toBe('instructor_ended');
      }
    });

    it('parses session_replaced event', () => {
      const raw = {
        type: 'session_replaced',
        data: { new_session_id: 'sess-2' },
        timestamp: '2026-01-01T00:00:00Z',
      };
      const parsed = parseRealtimeEvent(raw);
      expect(parsed.type).toBe('session_replaced');
      if (parsed.type === 'session_replaced') {
        expect(parsed.data.new_session_id).toBe('sess-2');
      }
    });

    it('parses featured_student_changed event', () => {
      const raw = {
        type: 'featured_student_changed',
        data: { user_id: 'u3', code: 'y = 2' },
        timestamp: '2026-01-01T00:00:00Z',
      };
      const parsed = parseRealtimeEvent(raw);
      expect(parsed.type).toBe('featured_student_changed');
      if (parsed.type === 'featured_student_changed') {
        expect(parsed.data.user_id).toBe('u3');
        expect(parsed.data.code).toBe('y = 2');
      }
    });

    it('parses problem_updated event', () => {
      const raw = {
        type: 'problem_updated',
        data: { problem_id: 'prob-1' },
        timestamp: '2026-01-01T00:00:00Z',
      };
      const parsed = parseRealtimeEvent(raw);
      expect(parsed.type).toBe('problem_updated');
      if (parsed.type === 'problem_updated') {
        expect(parsed.data.problem_id).toBe('prob-1');
      }
    });

    it('parses session_started_in_section event', () => {
      const raw = {
        type: 'session_started_in_section',
        data: { session_id: 'sess-5', problem: { id: 'p1' } },
        timestamp: '2026-01-01T00:00:00Z',
      };
      const parsed = parseRealtimeEvent(raw);
      expect(parsed.type).toBe('session_started_in_section');
      if (parsed.type === 'session_started_in_section') {
        expect(parsed.data.session_id).toBe('sess-5');
        expect(parsed.data.problem).toEqual({ id: 'p1' });
      }
    });

    it('parses session_ended_in_section event', () => {
      const raw = {
        type: 'session_ended_in_section',
        data: { session_id: 'sess-6' },
        timestamp: '2026-01-01T00:00:00Z',
      };
      const parsed = parseRealtimeEvent(raw);
      expect(parsed.type).toBe('session_ended_in_section');
      if (parsed.type === 'session_ended_in_section') {
        expect(parsed.data.session_id).toBe('sess-6');
      }
    });

    it('passes data through as-is without deep cloning', () => {
      const data = { user_id: 'u1', display_name: 'Bob' };
      const raw = { type: 'student_joined', data, timestamp: '2026-01-01T00:00:00Z' };
      const parsed = parseRealtimeEvent(raw);
      expect(parsed.data).toBe(data);
    });
  });

  describe('invalid input', () => {
    it('throws when input is null', () => {
      expect(() => parseRealtimeEvent(null)).toThrow();
    });

    it('throws when input is not an object', () => {
      expect(() => parseRealtimeEvent('string')).toThrow();
      expect(() => parseRealtimeEvent(42)).toThrow();
      expect(() => parseRealtimeEvent(undefined)).toThrow();
    });

    it('throws when type is missing', () => {
      expect(() => parseRealtimeEvent({ data: {}, timestamp: 'x' })).toThrow();
    });

    it('throws when type is not a string', () => {
      expect(() => parseRealtimeEvent({ type: 42, data: {}, timestamp: 'x' })).toThrow();
    });

    it('throws when type is an unknown event type', () => {
      expect(() =>
        parseRealtimeEvent({ type: 'unknown_event', data: {}, timestamp: 'x' })
      ).toThrow();
    });

    it('throws when data is missing', () => {
      expect(() =>
        parseRealtimeEvent({ type: 'student_joined', timestamp: 'x' })
      ).toThrow();
    });

    it('throws when timestamp is missing', () => {
      expect(() =>
        parseRealtimeEvent({ type: 'student_joined', data: {} })
      ).toThrow();
    });

    it('throws when timestamp is not a string', () => {
      expect(() =>
        parseRealtimeEvent({ type: 'student_joined', data: {}, timestamp: 42 })
      ).toThrow();
    });
  });
});
