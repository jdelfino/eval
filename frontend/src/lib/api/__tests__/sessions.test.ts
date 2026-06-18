/**
 * Unit tests for the sessions API client.
 *
 * Verifies the createSession request body contract against the section-pointer
 * backend (T1): `set_current` is sent ONLY when explicitly false; otherwise it is
 * omitted so the server default (true) applies. Catches contract drift with T1.
 *
 * @jest-environment jsdom
 */

const mockApiPost = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: jest.fn(),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPatch: jest.fn(),
  apiDelete: jest.fn(),
  apiFetch: jest.fn(),
}));

import { createSession } from '../sessions';

describe('createSession request body', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue({ id: 'session-1' });
  });

  it('omits set_current when opts not provided (server default true)', async () => {
    await createSession('sec-1', 'prob-1', false);
    expect(mockApiPost).toHaveBeenCalledWith('/sessions', {
      section_id: 'sec-1',
      problem_id: 'prob-1',
      show_solution: false,
    });
    const body = mockApiPost.mock.calls[0][1];
    expect('set_current' in body).toBe(false);
  });

  it('omits set_current when setCurrent is true (server default true)', async () => {
    await createSession('sec-1', 'prob-1', undefined, { setCurrent: true });
    const body = mockApiPost.mock.calls[0][1];
    expect('set_current' in body).toBe(false);
  });

  it('includes set_current:false only when setCurrent is explicitly false', async () => {
    await createSession('sec-1', 'prob-1', undefined, { setCurrent: false });
    expect(mockApiPost).toHaveBeenCalledWith('/sessions', {
      section_id: 'sec-1',
      problem_id: 'prob-1',
      set_current: false,
    });
  });

  it('omits problem_id and show_solution for a blank session', async () => {
    await createSession('sec-1');
    expect(mockApiPost).toHaveBeenCalledWith('/sessions', { section_id: 'sec-1' });
  });
});
