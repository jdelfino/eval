/**
 * Contract test: GET /api/v1/realtime/token
 * Validates the token response shape.
 * Note: This endpoint requires CentrifugoTokenSecret to be configured.
 * If not configured, the endpoint won't exist and we expect 404.
 */
import { contractFetch } from './helpers';
import { expectSnakeCaseKeys, expectString } from './validators';

describe('GET /api/v1/realtime/token', () => {
  it('returns a token response with correct shape (or 404 if not configured)', async () => {
    const res = await contractFetch('/api/v1/realtime/token');

    if (res.status === 404) {
      // Centrifugo not configured — acceptable in test environments
      console.warn('Realtime token endpoint not configured (404)');
      return;
    }

    expect(res.status).toBe(200);
    const body = await res.json();

    expectString(body, 'token');
    expectSnakeCaseKeys(body, 'tokenResponse');
  });
});
