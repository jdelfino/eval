/**
 * Contract test setup — creates namespace, class, section, session via API.
 * Must run before all other contract tests (Jest runs files alphabetically;
 * prefix ensures order).
 */
import { contractFetch, CONTRACT_NS } from './helpers';
import { state } from './shared-state';

describe('contract setup', () => {
  it('creates a namespace', async () => {
    const res = await contractFetch('/api/v1/namespaces', undefined, {
      method: 'POST',
      body: JSON.stringify({
        id: CONTRACT_NS,
        display_name: 'Contract Test Namespace',
      }),
    });
    // 201 or 409/500 if already exists — either is fine for idempotent setup
    if (res.status === 201) {
      const ns = await res.json();
      expect(ns.id).toBe(CONTRACT_NS);
    }
    state.namespaceId = CONTRACT_NS;
  });

  it('creates a class', async () => {
    const res = await contractFetch('/api/v1/classes', undefined, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Contract Test Class',
        description: 'Created by contract tests',
      }),
    });
    expect(res.status).toBe(201);
    const cls = await res.json();
    expect(typeof cls.id).toBe('string');
    state.classId = cls.id;
  });

  it('creates a section', async () => {
    const res = await contractFetch(`/api/v1/classes/${state.classId}/sections`, undefined, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Contract Test Section',
        semester: 'Fall 2025',
      }),
    });
    expect(res.status).toBe(201);
    const sec = await res.json();
    expect(typeof sec.id).toBe('string');
    state.sectionId = sec.id;
    state.joinCode = sec.join_code;
  });

  it('creates a session', async () => {
    const res = await contractFetch('/api/v1/sessions', undefined, {
      method: 'POST',
      body: JSON.stringify({
        section_id: state.sectionId,
        section_name: 'Contract Test Section',
        problem: { id: 'test-problem', title: 'Hello World', description: 'Print hello' },
      }),
    });
    expect(res.status).toBe(201);
    const sess = await res.json();
    expect(typeof sess.id).toBe('string');
    state.sessionId = sess.id;
  });
});
