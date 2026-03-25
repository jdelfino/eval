/**
 * Wire-type unknown field checker.
 *
 * Greps the wire type files (types/api.ts and types/realtime-events.ts) for
 * field declarations typed as `: unknown` or `: unknown[]`. Such fields defeat
 * structural validation (including typia) and hide type errors that would
 * otherwise be caught at compile time.
 *
 * Ignores:
 * - Generic type parameter defaults: `<T = unknown>` — valid use of unknown
 * - Comments: lines starting with // or *
 *
 * Usage: npx tsx scripts/check-unknown-wire-types.ts
 *
 * Exits 0 if no violations, 1 otherwise.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single field declaration typed as unknown in a wire type file. */
export interface UnknownFieldViolation {
  /** File path relative to frontend/src/ */
  file: string;
  /** 1-based line number */
  lineNumber: number;
  /** The full line text */
  line: string;
}

export interface UnknownCheckResult {
  violations: UnknownFieldViolation[];
  scannedFiles: number;
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Core logic (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Regex matching field declarations typed as `: unknown` or `: unknown[]`.
 *
 * Matches lines of the form:
 *   fieldName: unknown;
 *   fieldName: unknown[];
 *   fieldName?: unknown;
 *   fieldName?: unknown[];
 *
 * Does NOT match generic defaults like `<T = unknown>` because those do not
 * contain a colon followed by a space before "unknown".
 */
const UNKNOWN_FIELD_RE = /:\s+unknown(\[\])?[;,\s]/;

/**
 * Check a single source file for `: unknown` field declarations.
 *
 * @param relPath - File path (used only for reporting)
 * @param source  - File contents
 * @returns Array of violations found in this file
 */
export function checkForUnknownFields(
  relPath: string,
  source: string
): UnknownFieldViolation[] {
  const violations: UnknownFieldViolation[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comment lines
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue;
    }

    if (UNKNOWN_FIELD_RE.test(line)) {
      violations.push({
        file: relPath,
        lineNumber: i + 1,
        line,
      });
    }
  }

  return violations;
}

/**
 * Run the unknown-field check against the wire type files.
 */
export function runCheck(srcDir: string): UnknownCheckResult {
  const wireTypeFiles = [
    'types/api.ts',
    'types/realtime-events.ts',
  ];

  const violations: UnknownFieldViolation[] = [];
  let scannedFiles = 0;

  for (const relPath of wireTypeFiles) {
    const fullPath = path.join(srcDir, relPath);

    if (!fs.existsSync(fullPath)) {
      // Skip gracefully — file may not exist in all configurations
      continue;
    }

    scannedFiles++;
    const source = fs.readFileSync(fullPath, 'utf-8');
    violations.push(...checkForUnknownFields(relPath, source));
  }

  return {
    violations,
    scannedFiles,
    passed: violations.length === 0,
  };
}

/**
 * Format check results into a human-readable report.
 */
export function formatReport(result: UnknownCheckResult): string {
  const lines: string[] = [];

  lines.push('Wire Type Unknown Field Check');
  lines.push('============================');
  lines.push('');

  if (result.passed) {
    lines.push(`Scanned ${result.scannedFiles} file(s)`);
    lines.push('PASS: No `: unknown` fields found in wire type files');
  } else {
    lines.push('Violations:');
    for (const v of result.violations) {
      lines.push(`  \u2717 ${v.file}:${v.lineNumber}: ${v.line.trim()}`);
    }
    lines.push('');
    lines.push(
      `FAIL: ${result.violations.length} field(s) typed as \`unknown\` in wire type files`
    );
    lines.push(
      'Replace \`unknown\` with a concrete type. See types/api.ts and types/realtime-events.ts.'
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

  const result = runCheck(srcDir);
  console.log(formatReport(result));
  process.exit(result.passed ? 0 : 1);
}

if (require.main === module) {
  main();
}
