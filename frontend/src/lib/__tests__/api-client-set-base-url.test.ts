/**
 * Tests for setBaseUrl() in api-client.
 *
 * Verifies that the base URL is configurable at runtime, which enables
 * E2E test fixtures to point the typed API client at the test server.
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

describe('api-client setBaseUrl', () => {
  it('exports a setBaseUrl function', () => {
    const mod = require('../api-client');
    expect(typeof mod.setBaseUrl).toBe('function');
  });

  it('uses NEXT_PUBLIC_API_URL by default', async () => {
    const { configureTestAuth } = require('../auth-provider');
    configureTestAuth('test:u1:u1@test.local');

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { apiGet } = require('../api-client');
    await apiGet('/namespaces');

    const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0];
    expect(calledUrl).toBe('http://default-server:8080/namespaces');
  });

  it('uses the overridden URL after setBaseUrl is called', async () => {
    const { configureTestAuth } = require('../auth-provider');
    configureTestAuth('test:u1:u1@test.local');

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { setBaseUrl, apiGet } = require('../api-client');
    setBaseUrl('http://localhost:8080/api/v1');
    await apiGet('/namespaces');

    const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0];
    expect(calledUrl).toBe('http://localhost:8080/api/v1/namespaces');
  });

  it('subsequent calls reflect the latest setBaseUrl value', async () => {
    const { configureTestAuth } = require('../auth-provider');
    configureTestAuth('test:u1:u1@test.local');

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { setBaseUrl, apiGet } = require('../api-client');

    setBaseUrl('http://server-a/api/v1');
    await apiGet('/classes');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://server-a/api/v1/classes');

    (global.fetch as jest.Mock).mockClear();

    setBaseUrl('http://server-b/api/v1');
    await apiGet('/classes');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://server-b/api/v1/classes');
  });
});
