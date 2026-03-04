/**
 * Tests for docker-entrypoint.sh tenant ID substitution logic.
 *
 * The SWC compiler removes the if-guard in firebase.ts at build time because
 * the placeholder `__NEXT_PUBLIC_FIREBASE_TENANT_ID__` is truthy, producing:
 *   o.tenantId="__NEXT_PUBLIC_FIREBASE_TENANT_ID__"
 *
 * The entrypoint must substitute the placeholder correctly:
 * - Production (no tenant): replace the quoted placeholder with `null`
 *   so Firebase uses project-level auth. Empty string would cause tenant-id-mismatch.
 * - Staging (tenant set): replace the bare placeholder with the actual tenant ID string.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

const ENTRYPOINT = path.resolve(__dirname, '../../docker-entrypoint.sh');

/**
 * Creates a temporary directory with a fake .next/static/chunks/main.js
 * containing the given JS content, runs docker-entrypoint.sh with the
 * provided env vars (replacing /app/.next with the temp dir), and returns
 * the resulting file content.
 */
function runEntrypointSed(
  jsContent: string,
  env: Record<string, string | undefined>
): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entrypoint-test-'));
  try {
    const staticDir = path.join(tmpDir, 'static', 'chunks');
    fs.mkdirSync(staticDir, { recursive: true });
    const jsFile = path.join(staticDir, 'main.js');
    fs.writeFileSync(jsFile, jsContent, 'utf8');

    // Read the entrypoint script and replace /app/.next with the temp dir
    // so we don't need a real Docker environment.
    const script = fs.readFileSync(ENTRYPOINT, 'utf8');
    const patched = script.replace(/\/app\/.next/g, tmpDir);

    // Write the patched script to a temp file and execute it
    const scriptFile = path.join(tmpDir, 'entrypoint.sh');
    fs.writeFileSync(scriptFile, patched, { mode: 0o755 });

    // Build env object — only pass the vars we care about for these tests
    // (other vars are not set to avoid affecting real files).
    // NODE_ENV is required by the Next.js-augmented ProcessEnv type.
    const execEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      NODE_ENV: 'test',
    };
    for (const [k, v] of Object.entries(env)) {
      if (v !== undefined) {
        execEnv[k] = v;
      }
    }

    // We pass `true` as the last arg to exec to ignore non-zero exit codes
    // (the script's `exec "$@"` at the end will fail with no args — that's OK)
    try {
      execSync(`sh "${scriptFile}"`, { env: execEnv });
    } catch {
      // Ignore errors — exec "$@" with no args exits non-zero, which is fine
    }

    return fs.readFileSync(jsFile, 'utf8');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Simulated compiled JS that the SWC compiler produces when the if-guard is
// optimised away (because the build-time placeholder is truthy).
const COMPILED_JS_WITH_PLACEHOLDER = 'o.tenantId="__NEXT_PUBLIC_FIREBASE_TENANT_ID__"';

describe('docker-entrypoint.sh tenant ID substitution', () => {
  it('replaces quoted placeholder with null when NEXT_PUBLIC_FIREBASE_TENANT_ID is unset', () => {
    const result = runEntrypointSed(COMPILED_JS_WITH_PLACEHOLDER, {
      NEXT_PUBLIC_FIREBASE_TENANT_ID: undefined,
    });
    // Production: tenantId must be null (JS literal), not empty string
    expect(result).toBe('o.tenantId=null');
  });

  it('replaces quoted placeholder with null when NEXT_PUBLIC_FIREBASE_TENANT_ID is empty string', () => {
    const result = runEntrypointSed(COMPILED_JS_WITH_PLACEHOLDER, {
      NEXT_PUBLIC_FIREBASE_TENANT_ID: '',
    });
    expect(result).toBe('o.tenantId=null');
  });

  it('replaces placeholder with actual tenant ID string when NEXT_PUBLIC_FIREBASE_TENANT_ID is set', () => {
    const result = runEntrypointSed(COMPILED_JS_WITH_PLACEHOLDER, {
      NEXT_PUBLIC_FIREBASE_TENANT_ID: 'test-staging-tenant',
    });
    // Staging: tenantId must be the actual tenant string (quotes preserved)
    expect(result).toBe('o.tenantId="test-staging-tenant"');
  });

  it('does not produce empty string tenantId in production (regression for tenant-id-mismatch)', () => {
    const result = runEntrypointSed(COMPILED_JS_WITH_PLACEHOLDER, {
      NEXT_PUBLIC_FIREBASE_TENANT_ID: undefined,
    });
    // Must not result in tenantId="" which Firebase treats as an explicit invalid tenant
    expect(result).not.toContain('tenantId=""');
    expect(result).not.toContain("tenantId=''");
  });
});
