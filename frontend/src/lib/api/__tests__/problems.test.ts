/**
 * Unit tests for the problems API client.
 *
 * Verifies that listProblems sends correct snake_case query parameter names
 * that match backend handler expectations.
 *
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: jest.fn(),
  apiPatch: jest.fn(),
  apiDelete: jest.fn(),
  apiFetch: jest.fn(),
}));

jest.mock('@/lib/public-api-client', () => ({
  publicGet: jest.fn(),
}));

import { listProblems } from '../problems';

describe('listProblems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue([]);
  });

  it('sends no query params when no filters provided', async () => {
    await listProblems();
    expect(mockApiGet).toHaveBeenCalledWith('/problems');
  });

  it('sends author_id param', async () => {
    await listProblems({ author_id: 'user-123' });
    expect(mockApiGet).toHaveBeenCalledWith('/problems?author_id=user-123');
  });

  it('sends class_id param', async () => {
    await listProblems({ class_id: 'class-456' });
    expect(mockApiGet).toHaveBeenCalledWith('/problems?class_id=class-456');
  });

  it('sends include_public as snake_case (not includePublic)', async () => {
    await listProblems({ include_public: true });
    const callArg: string = mockApiGet.mock.calls[0][0];
    expect(callArg).toContain('include_public=true');
    expect(callArg).not.toContain('includePublic');
  });

  it('sends sort_by as snake_case (not sortBy)', async () => {
    await listProblems({ sort_by: 'title' });
    const callArg: string = mockApiGet.mock.calls[0][0];
    expect(callArg).toContain('sort_by=title');
    expect(callArg).not.toContain('sortBy');
  });

  it('sends sort_order as snake_case (not sortOrder)', async () => {
    await listProblems({ sort_order: 'desc' });
    const callArg: string = mockApiGet.mock.calls[0][0];
    expect(callArg).toContain('sort_order=desc');
    expect(callArg).not.toContain('sortOrder');
  });

  it('sends combined filters with correct param names', async () => {
    await listProblems({
      class_id: 'class-abc',
      include_public: true,
      sort_by: 'created_at',
      sort_order: 'asc',
    });
    const callArg: string = mockApiGet.mock.calls[0][0];
    expect(callArg).toContain('class_id=class-abc');
    expect(callArg).toContain('include_public=true');
    expect(callArg).toContain('sort_by=created_at');
    expect(callArg).toContain('sort_order=asc');
  });

  it('does not include include_public param when false', async () => {
    await listProblems({ include_public: false });
    const callArg: string = mockApiGet.mock.calls[0][0];
    expect(callArg).not.toContain('include_public');
  });
});
