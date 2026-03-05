/**
 * Regression test: API_PROXY_URL must NOT be baked into the frontend Dockerfile.
 *
 * With the staging nginx proxy in place (PLAT-rgqe.3), the proxy is no longer
 * needed at build time. It is still used for local dev via run-e2e-tests.sh,
 * which sets API_PROXY_URL at runtime — but the Dockerfile must not hard-code it.
 */

import * as fs from 'fs';
import * as path from 'path';

const DOCKERFILE = path.resolve(__dirname, '../../Dockerfile');

describe('frontend Dockerfile', () => {
  let contents: string;

  beforeAll(() => {
    contents = fs.readFileSync(DOCKERFILE, 'utf8');
  });

  it('does not hard-code API_PROXY_URL (staging nginx proxy handles routing now)', () => {
    expect(contents).not.toContain('API_PROXY_URL=http://go-api');
  });

  it('does not contain any ENV API_PROXY_URL directive', () => {
    expect(contents).not.toMatch(/^\s*ENV\s+API_PROXY_URL\s*=/m);
  });
});
