/**
 * Tests for setBaseUrl() in public-api-client.
 *
 * Verifies that the base URL is configurable at runtime, which enables
 * E2E test fixtures to point the typed public API client at the test server.
 */
export {};

const SAVED_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...SAVED_ENV, NEXT_PUBLIC_API_URL: 'http://default-server:8080' };
  global.fetch = jest.fn();

  jest.mock('@/lib/api-utils', () => ({
    ...jest.requireActual('@/lib/api-utils'),
    withRetry: jest.fn((fn: () => Promise<any>) => fn()),
  }));
});

afterAll(() => {
  process.env = SAVED_ENV;
});

describe('public-api-client setBaseUrl', () => {
  it('uses NEXT_PUBLIC_API_URL by default', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { publicGet } = require('../public-api-client');
    await publicGet('/auth/register-student?code=ABC');

    const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0];
    expect(calledUrl).toBe('http://default-server:8080/auth/register-student?code=ABC');
  });

  it('uses the overridden URL after setBaseUrl is called', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { setBaseUrl, publicGet } = require('../public-api-client');
    setBaseUrl('http://localhost:8080/api/v1');
    await publicGet('/auth/register-student?code=ABC');

    const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0];
    expect(calledUrl).toBe('http://localhost:8080/api/v1/auth/register-student?code=ABC');
  });

  it('subsequent calls reflect the latest setBaseUrl value', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { setBaseUrl, publicGet } = require('../public-api-client');

    setBaseUrl('http://server-a/api/v1');
    await publicGet('/auth/register-student?code=XYZ');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://server-a/api/v1/auth/register-student?code=XYZ');

    (global.fetch as jest.Mock).mockClear();

    setBaseUrl('http://server-b/api/v1');
    await publicGet('/auth/register-student?code=XYZ');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://server-b/api/v1/auth/register-student?code=XYZ');
  });
});
