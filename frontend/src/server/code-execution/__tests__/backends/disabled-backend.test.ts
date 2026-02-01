import { DisabledBackend } from '../../backends/disabled-backend';
import { CodeSubmission } from '../../interfaces';

describe('DisabledBackend', () => {
  let backend: DisabledBackend;

  beforeEach(() => {
    backend = new DisabledBackend();
  });

  describe('execute()', () => {
    it('should return an error result', async () => {
      const submission: CodeSubmission = {
        code: 'print("hello")',
      };

      const result = await backend.execute(submission);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toBe('Code execution is not available in this environment.');
      expect(result.executionTime).toBe(0);
    });

    it('should preserve stdin from submission in the result', async () => {
      const submission: CodeSubmission = {
        code: 'input()',
        executionSettings: {
          stdin: 'test input',
        },
      };

      const result = await backend.execute(submission);

      expect(result.stdin).toBe('test input');
    });

    it('should handle submission without executionSettings', async () => {
      const submission: CodeSubmission = {
        code: 'print("hello")',
      };

      const result = await backend.execute(submission);

      expect(result.stdin).toBeUndefined();
    });
  });

  describe('trace()', () => {
    it('should return an error trace', async () => {
      const result = await backend.trace('print("hello")');

      expect(result.steps).toEqual([]);
      expect(result.totalSteps).toBe(0);
      expect(result.exitCode).toBe(1);
      expect(result.error).toBe('Code tracing is not available in this environment.');
      expect(result.truncated).toBe(false);
    });

    it('should return error trace regardless of options', async () => {
      const result = await backend.trace('x = 1', { executionSettings: { stdin: 'test' }, maxSteps: 100 });

      expect(result.error).toBe('Code tracing is not available in this environment.');
      expect(result.steps).toEqual([]);
    });
  });

  describe('getStatus()', () => {
    it('should return available and healthy status', async () => {
      const status = await backend.getStatus();

      expect(status.available).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.message).toBe('Code execution disabled');
    });
  });
});
