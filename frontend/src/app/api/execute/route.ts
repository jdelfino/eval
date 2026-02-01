/**
 * API Route: Execute Code (Instructor Preview)
 *
 * POST /api/execute
 * Executes Python code for instructors creating/editing problems.
 * On Vercel: Creates an ephemeral sandbox, executes, then destroys it immediately.
 * Locally: Uses the local Python backend.
 *
 * IMPORTANT: This endpoint is for instructors only.
 * For session-based execution, use /api/sessions/[id]/execute instead.
 *
 * Request body:
 * - code: string (required) - Python code to execute
 * - stdin?: string - Standard input for the program
 * - randomSeed?: number - Random seed for deterministic execution
 * - attachedFiles?: Array<{name: string, content: string}> - Files to make available
 * - timeout?: number - Execution timeout in milliseconds (default: 10000, max: 30000)
 *
 * Returns:
 * - success: boolean
 * - output: string
 * - error: string
 * - executionTime: number
 */

import { NextRequest, NextResponse } from 'next/server';
import { Sandbox } from '@vercel/sandbox';
import { getAuthenticatedUserWithToken } from '@/server/auth/api-auth';
import { validateCodeSize, validateStdinSize, sanitizeFilename, truncateOutput, sanitizeError } from '@/server/code-execution/utils';
import { rateLimit } from '@/server/rate-limit';

// Sandbox timeout: 60 seconds (short-lived for preview)
const SANDBOX_TIMEOUT_MS = 60_000;

// Default execution timeout: 10 seconds
const DEFAULT_EXECUTION_TIMEOUT_MS = 10_000;

// Max execution timeout: 30 seconds
const MAX_EXECUTION_TIMEOUT_MS = 30_000;

// Working directory for code execution
const SANDBOX_CWD = '/vercel/sandbox';

export async function POST(request: NextRequest) {
  // Authenticate user
  let user;
  try {
    const auth = await getAuthenticatedUserWithToken(request);
    user = auth.user;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Restrict to instructors only
  if (user.role !== 'instructor' &&
      user.role !== 'namespace-admin' &&
      user.role !== 'system-admin') {
    return NextResponse.json(
      { error: 'Forbidden: Only instructors can use this endpoint' },
      { status: 403 }
    );
  }

  // Rate limit
  const limited = await rateLimit('execute', request, user.id);
  if (limited) return limited;

  // Parse request body
  const body = await request.json();
  const { code, stdin, randomSeed, attachedFiles, timeout: requestedTimeout } = body;

  // Validate required fields
  if (!code || typeof code !== 'string') {
    return NextResponse.json(
      { error: 'Code is required and must be a string' },
      { status: 400 }
    );
  }

  // Validate input sizes
  try {
    validateCodeSize(code);
    validateStdinSize(stdin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // Local development: use executor service
  if (process.env.VERCEL !== '1' || process.env.VERCEL_SANDBOX_ENABLED !== '1') {
    try {
      const { getExecutorService } = await import('@/server/code-execution');

      const result = await getExecutorService().executeCode(
        { code, executionSettings: { stdin, randomSeed, attachedFiles } },
        requestedTimeout
      );

      return NextResponse.json(result);
    } catch (error: unknown) {
      console.error('Code execution error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      );
    }
  }

  // Vercel production: use ephemeral sandbox
  let sandbox: Sandbox | null = null;

  try {
    // Clamp timeout
    const timeout = Math.min(
      requestedTimeout ?? DEFAULT_EXECUTION_TIMEOUT_MS,
      MAX_EXECUTION_TIMEOUT_MS
    );

    const startTime = Date.now();

    // Create ephemeral sandbox
    sandbox = await Sandbox.create({
      runtime: 'python3.13',
      timeout: SANDBOX_TIMEOUT_MS,
    });

    // Prepare code with random seed injection if needed
    let executionCode = code;
    if (randomSeed !== undefined) {
      const seedInjection = `import random\nrandom.seed(${randomSeed})\n`;
      executionCode = seedInjection + code;
    }

    // Build files to write
    const filesToWrite: Array<{ path: string; content: Buffer }> = [
      { path: 'main.py', content: Buffer.from(executionCode) },
    ];

    // Add stdin file if provided
    if (stdin !== undefined && stdin !== null) {
      filesToWrite.push({ path: '/tmp/stdin.txt', content: Buffer.from(stdin) });
    }

    // Add attached files
    if (attachedFiles && Array.isArray(attachedFiles)) {
      for (const file of attachedFiles) {
        if (file.name && file.content) {
          const sanitizedName = sanitizeFilename(file.name);
          filesToWrite.push({ path: sanitizedName, content: Buffer.from(file.content) });
        }
      }
    }

    // Write all files
    await sandbox.writeFiles(filesToWrite);

    // Execute with timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Vercel Sandbox runCommand doesn't support stdin piping, so when
      // stdin is provided we use shell redirection from the stdin file.
      const hasStdin = stdin !== undefined && stdin !== null;
      const result = await sandbox.runCommand({
        cmd: hasStdin ? 'bash' : 'python3',
        args: hasStdin
          ? ['-c', 'python3 main.py < /tmp/stdin.txt']
          : ['main.py'],
        cwd: SANDBOX_CWD,
        signal: controller.signal,
      });

      const stdout = await result.stdout();
      const stderr = await result.stderr();
      const executionTime = Date.now() - startTime;
      const success = result.exitCode === 0 && stderr.length === 0;

      return NextResponse.json({
        success,
        output: truncateOutput(stdout),
        error: success ? '' : sanitizeError(truncateOutput(stderr)),
        executionTime,
        stdin,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error: unknown) {
    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({
        success: false,
        output: '',
        error: 'Execution timed out',
        executionTime: 0,
      });
    }

    console.error('Code execution error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  } finally {
    // Always destroy sandbox
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch (e) {
        console.error('Failed to stop sandbox:', e);
      }
    }
  }
}
