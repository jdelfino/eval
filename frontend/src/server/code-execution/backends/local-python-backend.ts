/**
 * Local Python Backend
 *
 * Executes Python code using a local Python 3 interpreter via child_process.spawn.
 * Supports stdin input, attached files, random seed injection, and execution tracing.
 *
 * This backend is designed for local development environments where Python 3 is available.
 * It is not suitable for production environments on serverless platforms like Vercel.
 */

import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  ICodeExecutionBackend,
  BackendCapabilities,
  BackendStatus,
  ExecuteOptions,
  TraceOptions,
  CodeSubmission,
  ExecutionResult,
  ExecutionTrace,
} from '../interfaces';
import {
  DEFAULT_TIMEOUT,
  validateAttachedFiles,
  sanitizeFilename,
  truncateOutput,
} from '../utils';
import { TRACER_SCRIPT, TRACER_PATH } from './tracer-script';

const DEFAULT_MAX_STEPS = 5000;
const TRACE_TIMEOUT = 10000; // 10 seconds

/**
 * Minimal environment variables for spawned Python processes.
 * Security: Only expose the bare minimum environment needed for Python to run.
 * This prevents accidental exposure of secrets (API keys, database URLs, etc.)
 * to user-submitted code. Matches the approach in sandbox.ts (lines 211-216).
 *
 * Note: NODE_ENV is required by Next.js type augmentation but is not sensitive.
 */
const MINIMAL_PYTHON_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PATH: '/usr/bin:/bin',
  HOME: '/tmp',
  PYTHONDONTWRITEBYTECODE: '1',
  PYTHONUNBUFFERED: '1',
};

export class LocalPythonBackend implements ICodeExecutionBackend {
  readonly backendType = 'local-python';

  readonly capabilities: BackendCapabilities = {
    execute: true,
    trace: true,
    attachedFiles: true,
    stdin: true,
    randomSeed: true,
    stateful: false,
    requiresWarmup: false,
  };

  async execute(
    submission: CodeSubmission,
    options?: ExecuteOptions
  ): Promise<ExecutionResult> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const { code, executionSettings } = submission;
    const stdin = executionSettings?.stdin;
    const randomSeed = executionSettings?.randomSeed;
    const attachedFiles = executionSettings?.attachedFiles;
    const startTime = Date.now();

    // Create temporary directory for attached files
    let tempDir: string | null = null;
    if (attachedFiles && attachedFiles.length > 0) {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-tool-'));

      // Validate and write attached files
      try {
        validateAttachedFiles(attachedFiles);
        for (const file of attachedFiles) {
          const sanitizedName = sanitizeFilename(file.name);
          const filePath = path.join(tempDir, sanitizedName);
          fs.writeFileSync(filePath, file.content, 'utf-8');
        }
      } catch (error: unknown) {
        // Clean up temp directory on error
        if (tempDir) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (cleanupError) {
            console.error('Failed to cleanup temp directory:', cleanupError);
          }
        }

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          output: '',
          error: `File attachment error: ${errorMessage}`,
          executionTime: Date.now() - startTime,
          stdin,
        };
      }
    }

    // Inject random seed if provided
    let executionCode = code;
    if (randomSeed !== undefined) {
      const seedInjection = `import random\nrandom.seed(${randomSeed})\n`;
      executionCode = seedInjection + code;
    }

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Spawn Python process with optional working directory
      // Security: Use minimal environment variables to follow principle of least privilege
      // This prevents exposure of secrets to user-submitted code
      const spawnOptions: SpawnOptionsWithoutStdio = {
        env: MINIMAL_PYTHON_ENV,
      };

      if (tempDir) {
        spawnOptions.cwd = tempDir;
      }

      const pythonProcess = spawn(
        'python3',
        ['-c', executionCode],
        spawnOptions
      );

      // Pipe stdin to the process if provided, then always close stdin
      // This ensures input() gets EOF immediately if no more input is available
      if (stdin !== undefined && stdin !== null) {
        pythonProcess.stdin.write(stdin);
      }
      pythonProcess.stdin.end();

      // Set up timeout handler
      const timeoutId = setTimeout(() => {
        timedOut = true;
        pythonProcess.kill('SIGTERM');

        // Force kill if it doesn't terminate
        setTimeout(() => {
          if (!pythonProcess.killed) {
            pythonProcess.kill('SIGKILL');
          }
        }, 1000);
      }, timeout);

      // Capture stdout
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Capture stderr
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      pythonProcess.on('close', (exitCode) => {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - startTime;

        // Clean up temp directory
        if (tempDir) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (error) {
            console.error('Failed to cleanup temp directory:', error);
          }
        }

        if (timedOut) {
          resolve({
            success: false,
            output: truncateOutput(stdout),
            error: `Execution timed out after ${timeout}ms`,
            executionTime,
            stdin,
          });
          return;
        }

        const success = exitCode === 0 && stderr.length === 0;

        // Check for EOF errors which indicate the program was waiting for more input
        let errorOutput = truncateOutput(stderr);
        if (stderr.includes('EOFError') && stderr.includes('reading a line')) {
          errorOutput =
            'Program appears to be waiting for input, but no more input was provided. ' +
            'Make sure your code has all the input it needs, or check for extra input() calls.';
        }

        resolve({
          success,
          output: truncateOutput(stdout),
          error: errorOutput,
          executionTime,
          stdin, // Include stdin in the result
        });
      });

      // Handle process errors
      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - startTime;

        // Clean up temp directory
        if (tempDir) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (cleanupError) {
            console.error('Failed to cleanup temp directory:', cleanupError);
          }
        }

        resolve({
          success: false,
          output: truncateOutput(stdout),
          error: `Failed to execute code: ${error.message}`,
          executionTime,
          stdin,
        });
      });
    });
  }

  async trace(code: string, options?: TraceOptions): Promise<ExecutionTrace> {
    const stdin = options?.executionSettings?.stdin ?? '';
    const randomSeed = options?.executionSettings?.randomSeed;
    const attachedFiles = options?.executionSettings?.attachedFiles;
    const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;

    // Write tracer script to temp location
    const tracerDir = path.dirname(TRACER_PATH);
    if (!fs.existsSync(tracerDir)) {
      fs.mkdirSync(tracerDir, { recursive: true });
    }
    fs.writeFileSync(TRACER_PATH, TRACER_SCRIPT, 'utf-8');

    // Inject random seed if provided
    let executionCode = code;
    if (randomSeed !== undefined) {
      const seedInjection = `import random\nrandom.seed(${randomSeed})\n`;
      executionCode = seedInjection + code;
    }

    // Create temporary directory for attached files
    let tempDir: string | null = null;
    if (attachedFiles && attachedFiles.length > 0) {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-tool-trace-'));

      try {
        validateAttachedFiles(attachedFiles);
        for (const file of attachedFiles) {
          const sanitizedName = sanitizeFilename(file.name);
          const filePath = path.join(tempDir, sanitizedName);
          fs.writeFileSync(filePath, file.content, 'utf-8');
        }
      } catch (error: unknown) {
        // Clean up temp directory on error
        if (tempDir) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (cleanupError) {
            console.error('Failed to cleanup temp directory:', cleanupError);
          }
        }

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          steps: [],
          totalSteps: 0,
          exitCode: 1,
          error: `File attachment error: ${errorMessage}`,
          truncated: false,
        };
      }
    }

    return new Promise((resolve, reject) => {
      // Build spawn options
      // Security: Use minimal environment variables to follow principle of least privilege
      // This prevents exposure of secrets to user-submitted code
      const spawnOptions: SpawnOptionsWithoutStdio = {
        env: MINIMAL_PYTHON_ENV,
      };

      if (tempDir) {
        spawnOptions.cwd = tempDir;
      }

      // Spawn Python process with tracer script
      const pythonProcess = spawn(
        'python3',
        [TRACER_PATH, executionCode, stdin, maxSteps.toString()],
        spawnOptions
      );

      let outputData = '';
      let errorData = '';

      // Helper to clean up temp directory
      const cleanupTempDir = () => {
        if (tempDir) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (cleanupError) {
            console.error('Failed to cleanup temp directory:', cleanupError);
          }
        }
      };

      // Set timeout
      const timeout = setTimeout(() => {
        pythonProcess.kill();
        cleanupTempDir();
        reject(new Error('Trace execution timeout exceeded'));
      }, TRACE_TIMEOUT);

      pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
      });

      pythonProcess.on('close', (exitCode) => {
        clearTimeout(timeout);
        cleanupTempDir();

        if (exitCode !== 0 && exitCode !== null) {
          // Non-zero exit but might still have valid trace data
          console.error('Tracer stderr:', errorData);
        }

        try {
          // Parse JSON output from tracer
          const result: ExecutionTrace = JSON.parse(outputData);
          resolve(result);
        } catch {
          // Failed to parse - return error trace
          resolve({
            steps: [],
            totalSteps: 0,
            exitCode: 1,
            error: errorData || 'Failed to parse trace output',
            truncated: false,
          });
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeout);
        cleanupTempDir();
        reject(error);
      });
    });
  }

  async getStatus(): Promise<BackendStatus> {
    // Local Python is available when not on Vercel
    const isVercel = !!process.env.VERCEL;

    return {
      available: !isVercel,
      healthy: !isVercel,
      message: isVercel
        ? 'Local Python backend not available on Vercel'
        : 'Local Python backend available',
      metadata: {
        backendType: this.backendType,
        environment: isVercel ? 'vercel' : 'local',
      },
    };
  }
}
