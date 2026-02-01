/**
 * Integration tests for Vercel Sandbox Backend
 *
 * These tests run against the actual Vercel Sandbox API and require credentials.
 * They are excluded from the default test run and only executed:
 * - Locally when credentials are available
 * - In CI on merges to main with secrets configured
 *
 * Prerequisites:
 * - VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID environment variables
 * - Or: VERCEL_OIDC_TOKEN (when running on Vercel)
 * - For local testing: `npx vercel link && npx vercel env pull`
 *
 * Run with: npm run test:integration:sandbox
 */

import { Sandbox } from '@vercel/sandbox';

// Check for credentials - skip entire suite if missing
const hasOidcToken = Boolean(process.env.VERCEL_OIDC_TOKEN);
const hasApiToken = Boolean(
  process.env.VERCEL_TOKEN &&
  process.env.VERCEL_TEAM_ID &&
  process.env.VERCEL_PROJECT_ID
);
const hasCredentials = hasOidcToken || hasApiToken;

// Build credentials object for API token auth (used in CI)
const credentials = hasApiToken ? {
  token: process.env.VERCEL_TOKEN!,
  teamId: process.env.VERCEL_TEAM_ID!,
  projectId: process.env.VERCEL_PROJECT_ID!,
} : undefined;

// Use conditional describe to skip when no credentials
const describeWithCredentials = hasCredentials ? describe : describe.skip;

describeWithCredentials('Vercel Sandbox Integration', () => {
  // Increase timeout for integration tests (sandbox creation can take time)
  jest.setTimeout(60_000);

  let sandbox: Sandbox | null = null;

  afterAll(async () => {
    // Cleanup sandbox after all tests
    if (sandbox) {
      try {
        await sandbox.stop();
        console.log('Sandbox stopped successfully');
      } catch (error) {
        console.log('Failed to stop sandbox (may already be stopped):', error);
      }
    }
  });

  it('creates sandbox, executes Python code, and reuses sandbox for multiple executions', async () => {
    // Step 1: Create sandbox
    sandbox = await Sandbox.create({
      runtime: 'python3.13',
      timeout: 60_000, // 1 minute timeout for test
      ...credentials,
    });

    expect(sandbox).toBeDefined();
    expect(sandbox.sandboxId).toBeDefined();
    console.log(`Created sandbox: ${sandbox.sandboxId}, status: ${sandbox.status}`);

    // Wait for sandbox to be ready (may start as "pending")
    if (sandbox.status !== 'running') {
      console.log('Waiting for sandbox to become ready...');
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max wait
      while (sandbox.status !== 'running' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Re-fetch sandbox status
        sandbox = await Sandbox.get({ sandboxId: sandbox.sandboxId, ...credentials });
        attempts++;
      }
      console.log(`Sandbox ready after ${attempts} seconds, status: ${sandbox.status}`);
    }
    expect(sandbox.status).toBe('running');

    // Step 2: First execution - simple print
    await sandbox.writeFiles([
      { path: 'test1.py', content: Buffer.from('print("Hello from sandbox")') },
    ]);

    const result1 = await sandbox.runCommand({
      cmd: 'python3',
      args: ['test1.py'],
      cwd: '/vercel/sandbox',
    });

    const stdout1 = await result1.stdout();
    const stderr1 = await result1.stderr();

    expect(result1.exitCode).toBe(0);
    expect(stdout1).toContain('Hello from sandbox');
    expect(stderr1).toBe('');
    console.log(`First execution output: ${stdout1.trim()}`);

    // Step 3: Second execution - arithmetic to verify sandbox reuse
    await sandbox.writeFiles([
      { path: 'test2.py', content: Buffer.from('print(2 + 2)') },
    ]);

    const result2 = await sandbox.runCommand({
      cmd: 'python3',
      args: ['test2.py'],
      cwd: '/vercel/sandbox',
    });

    const stdout2 = await result2.stdout();
    const stderr2 = await result2.stderr();

    expect(result2.exitCode).toBe(0);
    expect(stdout2).toContain('4');
    expect(stderr2).toBe('');
    console.log(`Second execution output: ${stdout2.trim()}`);

    // Step 4: Third execution - verify variables and state isolation
    await sandbox.writeFiles([
      {
        path: 'test3.py',
        content: Buffer.from(`
x = 10
y = 20
print(f"Sum: {x + y}")
`),
      },
    ]);

    const result3 = await sandbox.runCommand({
      cmd: 'python3',
      args: ['test3.py'],
      cwd: '/vercel/sandbox',
    });

    const stdout3 = await result3.stdout();

    expect(result3.exitCode).toBe(0);
    expect(stdout3).toContain('Sum: 30');
    console.log(`Third execution output: ${stdout3.trim()}`);
  });

  it('handles Python errors correctly', async () => {
    // Use existing sandbox from previous test if available, otherwise create new
    if (!sandbox) {
      sandbox = await Sandbox.create({
        runtime: 'python3.13',
        timeout: 60_000,
        ...credentials,
      });
    }

    // Write code with a runtime error
    await sandbox.writeFiles([
      {
        path: 'error_test.py',
        content: Buffer.from('print(undefined_variable)'),
      },
    ]);

    const result = await sandbox.runCommand({
      cmd: 'python3',
      args: ['error_test.py'],
      cwd: '/vercel/sandbox',
    });

    const stderr = await result.stderr();

    expect(result.exitCode).not.toBe(0);
    expect(stderr).toContain('NameError');
    console.log(`Error test stderr: ${stderr.substring(0, 200)}`);
  });
});

// Log skip reason if credentials are missing
if (!hasCredentials) {
  console.log(
    'Skipping Vercel Sandbox integration tests: credentials not set. ' +
    'Need either VERCEL_OIDC_TOKEN or (VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID)'
  );
}
