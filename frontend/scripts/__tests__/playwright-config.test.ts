/**
 * Tests for Playwright baseURL environment variable support.
 *
 * The in-cluster test runner overrides baseURL via BASE_URL env var so that
 * Playwright targets staging services (http://frontend) rather than localhost.
 */

describe('getPlaywrightBaseUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns localhost:3000 by default when BASE_URL is not set', async () => {
    delete process.env.BASE_URL;
    const { getPlaywrightBaseUrl } = await import('../../playwright-base-url');
    expect(getPlaywrightBaseUrl()).toBe('http://localhost:3000');
  });

  it('returns BASE_URL env var when set', async () => {
    process.env.BASE_URL = 'http://frontend';
    const { getPlaywrightBaseUrl } = await import('../../playwright-base-url');
    expect(getPlaywrightBaseUrl()).toBe('http://frontend');
  });

  it('returns a custom URL when BASE_URL is set to an arbitrary value', async () => {
    process.env.BASE_URL = 'http://staging.example.com:8080';
    const { getPlaywrightBaseUrl } = await import('../../playwright-base-url');
    expect(getPlaywrightBaseUrl()).toBe('http://staging.example.com:8080');
  });
});
