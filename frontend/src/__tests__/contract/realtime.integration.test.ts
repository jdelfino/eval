/**
 * Integration test: getRealtimeToken()
 * Validates that the typed API function works correctly against the real backend.
 *
 * Note: This endpoint requires CentrifugoTokenSecret to be configured.
 * If not configured, the endpoint will return 404.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { getRealtimeToken } from '@/lib/api/realtime-token';
import { expectSnakeCaseKeys } from './validators';

describe('getRealtimeToken()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns token response with correct shape (or throws if not configured)', async () => {
    try {
      const response = await getRealtimeToken();

      expect(typeof response.token).toBe('string');
      expectSnakeCaseKeys(response, 'tokenResponse');
    } catch (error) {
      // 404 is acceptable if Centrifugo not configured in test environment
      const status = (error as { status?: number }).status;
      if (status === 404) {
        console.warn('Realtime token endpoint not configured (404)');
        return;
      }
      throw error;
    }
  });
});
