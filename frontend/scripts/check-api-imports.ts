/**
 * API import boundary checker.
 *
 * Ensures that no application code imports base HTTP helpers (api-client,
 * public-api-client) directly. All API access must go through the typed
 * client library in src/lib/api/*.
 *
 * Usage: npx tsx scripts/check-api-imports.ts
 *
 * Exits 0 if no violations, 1 otherwise.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Violation {
  /** File path relative to frontend/src/ */
  file: string;
  /** The disallowed module that was imported */
  importedModule: string;
}

export interface CheckResult {
  violations: Violation[];
  scannedFiles: number;
}

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------

/**
 * Files allowed to import from @/lib/api-client or @/lib/public-api-client.
 * Paths are relative to src/.
 */
const ALLOWED_PATTERNS: RegExp[] = [
  // Base client implementations
  /^lib\/api-client\.ts$/,
  /^lib\/public-api-client\.ts$/,
  /^lib\/api-utils\.ts$/,

  // Typed client library (its job is to wrap base helpers)
  /^lib\/api\//,

  // Infrastructure with legitimate direct access
  /^lib\/centrifugo\.ts$/,
  /^contexts\/AuthContext\.tsx$/,
  /^contexts\/PreviewContext\.tsx$/,

  // Test files
  /__tests__\//,
  /__mocks__\//,
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
];

// ---------------------------------------------------------------------------
// Core logic (exported for testing)
// ---------------------------------------------------------------------------

/** Regex matching imports from the base HTTP client modules. */
const BASE_CLIENT_IMPORT =
  /from\s+['"]@\/lib\/(api-client|public-api-client)['"]/;

/**
 * Check whether a source file imports from the base HTTP client modules.
 */
export function importsBaseClient(source: string): string | null {
  const match = BASE_CLIENT_IMPORT.exec(source);
  return match ? match[1] : null;
}

/**
 * Check whether a file path (relative to src/) is in the allowlist.
 */
export function isAllowed(relPath: string): boolean {
  return ALLOWED_PATTERNS.some((pattern) => pattern.test(relPath));
}

/**
 * Recursively collect all .ts/.tsx files under a directory.
 */
function collectSourceFiles(dir: string, base: string): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      results.push(...collectSourceFiles(fullPath, base));
    } else if (/\.tsx?$/.test(entry.name)) {
      results.push(path.relative(base, fullPath));
    }
  }

  return results;
}

/**
 * Scan source files and return any that violate the import boundary.
 */
export function checkImportBoundary(srcDir: string): CheckResult {
  const files = collectSourceFiles(srcDir, srcDir);
  const violations: Violation[] = [];

  for (const relPath of files) {
    if (isAllowed(relPath)) continue;

    const source = fs.readFileSync(path.join(srcDir, relPath), 'utf-8');
    const importedModule = importsBaseClient(source);

    if (importedModule) {
      violations.push({ file: relPath, importedModule });
    }
  }

  return { violations, scannedFiles: files.length };
}

/**
 * Format check results into a human-readable report.
 */
export function formatReport(result: CheckResult): string {
  const lines: string[] = [];

  lines.push('API Import Boundary Check');
  lines.push('=========================');
  lines.push('');

  if (result.violations.length === 0) {
    lines.push(`Scanned ${result.scannedFiles} files`);
    lines.push('PASS: No disallowed base-client imports found');
  } else {
    lines.push('Violations:');
    for (const v of result.violations) {
      lines.push(`  \u2717 src/${v.file} imports @/lib/${v.importedModule}`);
    }
    lines.push('');
    lines.push(
      `FAIL: ${result.violations.length} file(s) import base HTTP clients directly`
    );
    lines.push(
      'Move API calls into typed functions in src/lib/api/ instead.'
    );
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const srcDir = path.resolve(__dirname, '..', 'src');

  if (!fs.existsSync(srcDir)) {
    console.error(`Error: src directory not found: ${srcDir}`);
    process.exit(1);
  }

  const result = checkImportBoundary(srcDir);
  console.log(formatReport(result));
  process.exit(result.violations.length === 0 ? 0 : 1);
}

if (require.main === module) {
  main();
}
