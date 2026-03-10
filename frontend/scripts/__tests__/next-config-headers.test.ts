/**
 * Tests for next.config.js HTTP response headers.
 *
 * Verifies that all required security and cache headers are configured
 * on HTML pages served by Next.js.
 */

import * as path from 'path';

const NEXT_CONFIG = path.resolve(__dirname, '../../next.config.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require(NEXT_CONFIG) as { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> };

describe('next.config.js headers()', () => {
  let allRouteHeaders: Array<{ key: string; value: string }>;

  beforeAll(async () => {
    const headerRules = await nextConfig.headers();
    const catchAll = headerRules.find((rule) => rule.source === '/:path*');
    allRouteHeaders = catchAll?.headers ?? [];
  });

  it('sets Cross-Origin-Opener-Policy to same-origin-allow-popups on all routes', () => {
    const coopHeader = allRouteHeaders.find((h) => h.key === 'Cross-Origin-Opener-Policy');
    expect(coopHeader).toBeDefined();
    expect(coopHeader?.value).toBe('same-origin-allow-popups');
  });

  it('sets Cache-Control to no-cache on all routes to prevent stale HTML after deploys', () => {
    const cacheHeader = allRouteHeaders.find((h) => h.key === 'Cache-Control');
    expect(cacheHeader).toBeDefined();
    expect(cacheHeader?.value).toBe('no-cache');
  });
});
