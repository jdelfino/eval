/**
 * Contract test: traceCode()
 * Validates that the standalone trace API function works against the real backend.
 *
 * Requires the executor service to be running.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { traceCode } from '@/lib/api/trace';

describe('traceCode()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns ExecutionTrace with steps array', async () => {
    const trace = await traceCode('x = 1\nprint(x)', 'python', {});
    expect('steps' in trace).toBe(true);
    expect(Array.isArray(trace.steps)).toBe(true);
    expect(trace.steps.length).toBeGreaterThan(0);
  });
});
