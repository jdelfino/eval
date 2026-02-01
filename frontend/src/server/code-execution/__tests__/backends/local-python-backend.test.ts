import { LocalPythonBackend } from '../../backends/local-python-backend';
import { CodeSubmission } from '../../interfaces';

describe('LocalPythonBackend', () => {
  let backend: LocalPythonBackend;

  beforeEach(() => {
    backend = new LocalPythonBackend();
  });

  describe('backendType', () => {
    it('should have backendType "local-python"', () => {
      expect(backend.backendType).toBe('local-python');
    });
  });

  describe('capabilities', () => {
    it('should have execute, trace, attachedFiles, stdin, randomSeed enabled', () => {
      expect(backend.capabilities.execute).toBe(true);
      expect(backend.capabilities.trace).toBe(true);
      expect(backend.capabilities.attachedFiles).toBe(true);
      expect(backend.capabilities.stdin).toBe(true);
      expect(backend.capabilities.randomSeed).toBe(true);
    });

    it('should have stateful and requiresWarmup disabled', () => {
      expect(backend.capabilities.stateful).toBe(false);
      expect(backend.capabilities.requiresWarmup).toBe(false);
    });
  });

  describe('execute()', () => {
    it('should execute simple Python code', async () => {
      const submission: CodeSubmission = {
        code: 'print("hello world")',
      };

      const result = await backend.execute(submission);

      expect(result.success).toBe(true);
      expect(result.output).toBe('hello world\n');
      expect(result.error).toBe('');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle code with syntax errors', async () => {
      const submission: CodeSubmission = {
        code: 'print("hello',
      };

      const result = await backend.execute(submission);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SyntaxError');
    });

    it('should handle code with runtime errors', async () => {
      const submission: CodeSubmission = {
        code: 'raise ValueError("test error")',
      };

      const result = await backend.execute(submission);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ValueError');
      expect(result.error).toContain('test error');
    });

    it('should handle stdin input', async () => {
      const submission: CodeSubmission = {
        code: 'name = input("Name: ")\nprint(f"Hello, {name}!")',
        executionSettings: {
          stdin: 'Alice\n',
        },
      };

      const result = await backend.execute(submission);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Hello, Alice!');
      expect(result.stdin).toBe('Alice\n');
    });

    it('should include stdin in result when provided', async () => {
      const submission: CodeSubmission = {
        code: 'print("test")',
        executionSettings: {
          stdin: 'test input',
        },
      };

      const result = await backend.execute(submission);

      expect(result.stdin).toBe('test input');
    });

    it('should handle timeout', async () => {
      const submission: CodeSubmission = {
        code: 'import time\ntime.sleep(10)',
      };

      const result = await backend.execute(submission, { timeout: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    }, 10000);

    describe('stdin-blocked detection', () => {
      it('should detect when program waits for input but none provided', async () => {
        const submission: CodeSubmission = {
          code: 'name = input("Enter name: ")',
          // No stdin provided
        };

        const result = await backend.execute(submission);

        expect(result.success).toBe(false);
        expect(result.error).toContain('waiting for input');
        expect(result.error).toContain('no more input was provided');
      }, 10000);

      it('should detect when program needs more input than provided (insufficient stdin)', async () => {
        const submission: CodeSubmission = {
          code: 'name = input("Name: ")\nage = input("Age: ")\nprint(f"{name} is {age}")',
          executionSettings: {
            stdin: 'Alice\n', // Only provides first input, missing second
          },
        };

        const result = await backend.execute(submission);

        expect(result.success).toBe(false);
        expect(result.error).toContain('waiting for input');
        expect(result.error).toContain('no more input was provided');
      }, 10000);

      it('should still work correctly when sufficient input is provided', async () => {
        const submission: CodeSubmission = {
          code: 'name = input("Name: ")\nage = input("Age: ")\nprint(f"{name} is {age}")',
          executionSettings: {
            stdin: 'Alice\n25\n', // Provides both inputs
          },
        };

        const result = await backend.execute(submission);

        expect(result.success).toBe(true);
        expect(result.output).toContain('Alice is 25');
      });

      it('should not trigger stdin-blocked for code that produces output before blocking', async () => {
        const submission: CodeSubmission = {
          code: 'print("Hello")\nimport time\ntime.sleep(5)',
        };

        // This code produces output first, so it shouldn't trigger the stdin-blocked error
        // It should trigger a normal timeout instead
        const result = await backend.execute(submission, { timeout: 200 });

        expect(result.success).toBe(false);
        expect(result.error).toContain('timed out');
        expect(result.error).not.toContain('waiting for input');
      }, 10000);
    });

    it('should inject random seed when provided', async () => {
      const submission: CodeSubmission = {
        code: 'import random\nprint(random.randint(1, 1000))',
        executionSettings: {
          randomSeed: 42,
        },
      };

      // Run twice with same seed, should get same result
      const result1 = await backend.execute(submission);
      const result2 = await backend.execute(submission);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.output).toBe(result2.output);
    });

    it('should handle attached files', async () => {
      const submission: CodeSubmission = {
        code: 'with open("data.txt") as f:\n    print(f.read().strip())',
        executionSettings: {
          attachedFiles: [
            { name: 'data.txt', content: 'Hello from file!' },
          ],
        },
      };

      const result = await backend.execute(submission);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello from file!\n');
    });

    it('should reject too many attached files', async () => {
      const submission: CodeSubmission = {
        code: 'print("test")',
        executionSettings: {
          attachedFiles: [
            { name: 'file1.txt', content: 'content1' },
            { name: 'file2.txt', content: 'content2' },
            { name: 'file3.txt', content: 'content3' },
            { name: 'file4.txt', content: 'content4' },
            { name: 'file5.txt', content: 'content5' },
            { name: 'file6.txt', content: 'content6' }, // Too many
          ],
        },
      };

      const result = await backend.execute(submission);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many files');
    });

    it('should sanitize filenames to prevent path traversal', async () => {
      const submission: CodeSubmission = {
        code: 'import os\nprint(os.listdir("."))',
        executionSettings: {
          attachedFiles: [
            { name: '../../../etc/passwd', content: 'safe content' },
          ],
        },
      };

      const result = await backend.execute(submission);

      // File should exist with sanitized name, not as path traversal
      expect(result.success).toBe(true);
      expect(result.output).toContain('_etc_passwd');
    });

    it('should handle submission without executionSettings', async () => {
      const submission: CodeSubmission = {
        code: 'print(1 + 1)',
      };

      const result = await backend.execute(submission);

      expect(result.success).toBe(true);
      expect(result.output).toBe('2\n');
      expect(result.stdin).toBeUndefined();
    });

    describe('environment variable isolation', () => {
      it('should not pass parent process environment variables to spawned Python', async () => {
        // Set a test environment variable in the parent process
        const originalTestVar = process.env.TEST_SECRET_VAR;
        process.env.TEST_SECRET_VAR = 'sensitive_secret_value';

        try {
          const submission: CodeSubmission = {
            code: 'import os\nprint(os.environ.get("TEST_SECRET_VAR", "not_found"))',
          };

          const result = await backend.execute(submission);

          expect(result.success).toBe(true);
          expect(result.output).toBe('not_found\n');
          expect(result.output).not.toContain('sensitive_secret_value');
        } finally {
          // Restore original value
          if (originalTestVar === undefined) {
            delete process.env.TEST_SECRET_VAR;
          } else {
            process.env.TEST_SECRET_VAR = originalTestVar;
          }
        }
      });

      it('should have minimal environment variables set (PATH, HOME, PYTHON vars)', async () => {
        const submission: CodeSubmission = {
          code: 'import os\nimport json\nprint(json.dumps(dict(os.environ)))',
        };

        const result = await backend.execute(submission);

        expect(result.success).toBe(true);
        const envVars = JSON.parse(result.output.trim());

        // Should have exactly these minimal environment variables
        expect(envVars.PATH).toBe('/usr/bin:/bin');
        expect(envVars.HOME).toBe('/tmp');
        expect(envVars.PYTHONDONTWRITEBYTECODE).toBe('1');
        expect(envVars.PYTHONUNBUFFERED).toBe('1');

        // Should NOT have common sensitive environment variables
        expect(envVars.DATABASE_URL).toBeUndefined();
        expect(envVars.SUPABASE_SECRET_KEY).toBeUndefined();
        expect(envVars.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      });
    });
  });

  describe('trace()', () => {
    it('should trace simple code execution', async () => {
      const result = await backend.trace('x = 1\ny = 2\nz = x + y');

      expect(result.exitCode).toBe(0);
      expect(result.truncated).toBe(false);
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.error).toBeNull();
    });

    it('should capture variable states', async () => {
      const result = await backend.trace('x = 42');

      expect(result.steps.length).toBeGreaterThan(0);

      // Find a step where x is defined
      const stepWithX = result.steps.find(
        (step) => step.locals['x'] !== undefined || step.globals['x'] !== undefined
      );
      expect(stepWithX).toBeDefined();
    });

    it('should capture stdout', async () => {
      const result = await backend.trace('print("hello")');

      expect(result.exitCode).toBe(0);
      // Find step with stdout captured
      const stepWithOutput = result.steps.find((step) => step.stdout.includes('hello'));
      expect(stepWithOutput).toBeDefined();
    });

    it('should handle stdin in tracing', async () => {
      const result = await backend.trace('name = input()\nprint(f"Hi {name}")', {
        executionSettings: { stdin: 'Alice' },
      });

      expect(result.exitCode).toBe(0);
      const stepWithOutput = result.steps.find((step) => step.stdout.includes('Alice'));
      expect(stepWithOutput).toBeDefined();
    });

    it('should respect maxSteps limit', async () => {
      const result = await backend.trace('for i in range(100):\n    x = i', {
        maxSteps: 10,
      });

      expect(result.truncated).toBe(true);
      expect(result.totalSteps).toBe(10);
      expect(result.steps.length).toBe(10);
    });

    it('should capture errors in traced code', async () => {
      const result = await backend.trace('raise ValueError("test error")');

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('ValueError');
      expect(result.error).toContain('test error');
    });

    it('should return call stack information', async () => {
      const result = await backend.trace('def foo():\n    x = 1\nfoo()');

      expect(result.exitCode).toBe(0);
      // Find a step inside the function
      const stepInFunction = result.steps.find(
        (step) => step.callStack.some((frame) => frame.functionName === 'foo')
      );
      expect(stepInFunction).toBeDefined();
    });

    it('should inject random seed when provided', async () => {
      // Run twice with same seed, should get same random values
      const code = 'import random\nx = random.randint(1, 1000)\nprint(x)';
      const result1 = await backend.trace(code, {
        executionSettings: { randomSeed: 42 },
      });
      const result2 = await backend.trace(code, {
        executionSettings: { randomSeed: 42 },
      });

      expect(result1.exitCode).toBe(0);
      expect(result2.exitCode).toBe(0);

      // Find steps with x defined and compare values
      const step1WithX = result1.steps.find(
        (step) => step.locals['x'] !== undefined
      );
      const step2WithX = result2.steps.find(
        (step) => step.locals['x'] !== undefined
      );

      expect(step1WithX).toBeDefined();
      expect(step2WithX).toBeDefined();
      expect(step1WithX!.locals['x']).toBe(step2WithX!.locals['x']);
    });

    it('should handle attached files in tracing', async () => {
      const result = await backend.trace(
        'with open("data.txt") as f:\n    content = f.read().strip()\nprint(content)',
        {
          executionSettings: {
            attachedFiles: [{ name: 'data.txt', content: 'Hello from file!' }],
          },
        }
      );

      expect(result.exitCode).toBe(0);
      // Find step where content is defined
      const stepWithContent = result.steps.find(
        (step) => step.locals['content'] !== undefined
      );
      expect(stepWithContent).toBeDefined();
      expect(stepWithContent!.locals['content']).toBe('Hello from file!');
    });

    it('should return error for too many attached files', async () => {
      const result = await backend.trace('print("test")', {
        executionSettings: {
          attachedFiles: [
            { name: 'file1.txt', content: 'content1' },
            { name: 'file2.txt', content: 'content2' },
            { name: 'file3.txt', content: 'content3' },
            { name: 'file4.txt', content: 'content4' },
            { name: 'file5.txt', content: 'content5' },
            { name: 'file6.txt', content: 'content6' }, // Too many
          ],
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('Too many files');
    });

    describe('environment variable isolation', () => {
      it('should not pass parent process environment variables to traced Python', async () => {
        // Set a test environment variable in the parent process
        const originalTestVar = process.env.TEST_SECRET_VAR;
        process.env.TEST_SECRET_VAR = 'sensitive_secret_value';

        try {
          const result = await backend.trace(
            'import os\nresult = os.environ.get("TEST_SECRET_VAR", "not_found")\nprint(result)'
          );

          expect(result.exitCode).toBe(0);
          // Find step with stdout that includes our output
          const stepWithOutput = result.steps.find((step) =>
            step.stdout.includes('not_found')
          );
          expect(stepWithOutput).toBeDefined();

          // Ensure it doesn't contain the secret
          const hasSecret = result.steps.some((step) =>
            step.stdout.includes('sensitive_secret_value')
          );
          expect(hasSecret).toBe(false);
        } finally {
          // Restore original value
          if (originalTestVar === undefined) {
            delete process.env.TEST_SECRET_VAR;
          } else {
            process.env.TEST_SECRET_VAR = originalTestVar;
          }
        }
      });

      it('should have minimal environment variables set for traced code', async () => {
        const result = await backend.trace(
          'import os\nhome = os.environ.get("HOME", "missing")\nprint(home)'
        );

        expect(result.exitCode).toBe(0);
        // Find step with stdout containing /tmp (the expected HOME value)
        const stepWithOutput = result.steps.find((step) =>
          step.stdout.includes('/tmp')
        );
        expect(stepWithOutput).toBeDefined();
      });
    });
  });

  describe('getStatus()', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return available when not on Vercel', async () => {
      delete process.env.VERCEL;

      const status = await backend.getStatus();

      expect(status.available).toBe(true);
      expect(status.healthy).toBe(true);
      expect(status.message).toContain('available');
      expect(status.metadata?.backendType).toBe('local-python');
      expect(status.metadata?.environment).toBe('local');
    });

    it('should return unavailable when on Vercel', async () => {
      process.env.VERCEL = '1';

      const status = await backend.getStatus();

      expect(status.available).toBe(false);
      expect(status.healthy).toBe(false);
      expect(status.message).toContain('not available on Vercel');
      expect(status.metadata?.environment).toBe('vercel');
    });
  });
});
