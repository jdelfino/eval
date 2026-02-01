/**
 * Tests for session type hierarchy and mapper functions.
 */
import type { Session as ApiSession } from '../api';
import { mapApiSession } from '../session';

describe('Session type hierarchy', () => {
  const apiSession: ApiSession = {
    id: 's-1',
    namespace_id: 'ns-1',
    section_id: 'sec-1',
    section_name: 'Section A',
    problem: { id: 'p-1', title: 'Test' },
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
});
