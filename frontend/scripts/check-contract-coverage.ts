/**
 * Contract-coverage checking script.
 *
 * Scans API modules in frontend/src/lib/api/ and contract tests in
 * frontend/src/__tests__/contract/ to determine which typed API functions
 * have at least one contract test that imports them.
 *
 * Usage: npx tsx scripts/check-contract-coverage.ts
 *
 * Exits 0 if 100% coverage, 1 otherwise.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Exclusions — functions intentionally without contract tests
// ---------------------------------------------------------------------------

/**
 * Functions excluded from contract coverage because they require infrastructure
 * not available in CI. Each entry maps "module/function" to a reason.
 *
 * When the infrastructure becomes available, remove the exclusion and add a
 * proper contract test.
 */
export const EXCLUDED_FUNCTIONS: Record<string, string> = {
  'realtime-token/getRealtimeToken': 'Requires Centrifugo — covered by PLAT-pp4r.4',
  'system/resendSystemInvitation': 'Requires Resend email service',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModuleCoverage {
  name: string;
  covered: string[];
  uncovered: string[];
}

export interface CoverageResult {
  modules: ModuleCoverage[];
  totalFunctions: number;
  coveredFunctions: number;
  /** Coverage percentage (0-100). 100 if no functions exist. */
  percentage: number;
}

// ---------------------------------------------------------------------------
// Core logic (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Extract all exported async function names from a TypeScript source string.
 * Matches patterns like: `export async function NAME(`
 */
export function extractExportedFunctions(source: string): string[] {
  const regex = /export\s+async\s+function\s+(\w+)\s*\(/g;
  const functions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    functions.push(match[1]);
  }
  return functions;
}

/**
 * Extract all value imports from `@/lib/api/*` modules in a source string.
 * Handles both single-line and multi-line import statements.
 * Ignores `import type` statements.
 *
 * Returns a Map from module name (e.g. "auth") to array of imported names.
 */
export function extractImportedFunctions(source: string): Map<string, string[]> {
  const result = new Map<string, string[]>();

  // Match import statements from @/lib/api/*
  // This handles both single-line and multi-line imports:
  //   import { foo, bar } from '@/lib/api/module';
  //   import {
  //     foo,
  //     bar,
  //   } from '@/lib/api/module';
  //
  // Excludes `import type { ... }` statements.
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]@\/lib\/api\/([^'"]+)['"]/g;

  // Also need to exclude lines starting with `import type`
  // We'll process the full source but filter out type-only imports
  // by checking if the import starts with `import type`
  const typeImportRegex = /import\s+type\s+\{[^}]+\}\s+from\s+['"]@\/lib\/api\/[^'"]+['"]/g;

  // Collect positions of type-only imports so we can skip them
  const typeImportPositions = new Set<number>();
  let typeMatch: RegExpExecArray | null;
  while ((typeMatch = typeImportRegex.exec(source)) !== null) {
    typeImportPositions.add(typeMatch.index);
  }

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    // Skip type-only imports
    if (typeImportPositions.has(match.index)) {
      continue;
    }

    const importedNames = match[1]
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    const moduleName = match[2];

    const existing = result.get(moduleName) || [];
    result.set(moduleName, [...existing, ...importedNames]);
  }

  return result;
}

/**
 * Compute coverage by comparing API module exports against contract test imports.
 *
 * @param apiModules - Map from module name to list of exported function names
 * @param coveredImports - Map from module name to list of imported function names
 * @returns CoverageResult with per-module and aggregate statistics
 */
export function computeCoverage(
  apiModules: Map<string, string[]>,
  coveredImports: Map<string, string[]>,
  exclusions: Record<string, string> = EXCLUDED_FUNCTIONS
): CoverageResult {
  const modules: ModuleCoverage[] = [];
  let totalFunctions = 0;
  let coveredFunctions = 0;

  // Sort modules alphabetically
  const sortedModuleNames = [...apiModules.keys()].sort();

  for (const moduleName of sortedModuleNames) {
    const exported = apiModules.get(moduleName)!;
    const imported = new Set(coveredImports.get(moduleName) || []);

    const covered: string[] = [];
    const uncovered: string[] = [];

    for (const fn of exported) {
      const exclusionKey = `${moduleName}/${fn}`;
      if (exclusionKey in exclusions) {
        // Skip excluded functions — they don't count as covered or uncovered
        continue;
      }
      if (imported.has(fn)) {
        covered.push(fn);
      } else {
        uncovered.push(fn);
      }
    }

    modules.push({ name: moduleName, covered, uncovered });
    totalFunctions += covered.length + uncovered.length;
    coveredFunctions += covered.length;
  }

  const percentage = totalFunctions === 0 ? 100 : (coveredFunctions / totalFunctions) * 100;

  return { modules, totalFunctions, coveredFunctions, percentage };
}

/**
 * Format a coverage result into a human-readable report string.
 */
export function formatReport(
  coverage: CoverageResult,
  exclusions: Record<string, string> = EXCLUDED_FUNCTIONS
): string {
  const lines: string[] = [];

  lines.push('Contract Test Coverage Report');
  lines.push('=============================');
  lines.push('');

  for (const mod of coverage.modules) {
    // Count excluded functions for this module
    const excludedForModule = Object.keys(exclusions)
      .filter((k) => k.startsWith(`${mod.name}/`));
    const total = mod.covered.length + mod.uncovered.length + excludedForModule.length;
    lines.push(`${mod.name}.ts (${mod.covered.length}/${total} covered, ${excludedForModule.length} excluded)`);

    for (const fn of mod.covered) {
      lines.push(`  \u2713 ${fn}`);
    }
    for (const fn of mod.uncovered) {
      lines.push(`  \u2717 ${fn}`);
    }
    for (const key of excludedForModule) {
      const fnName = key.split('/')[1];
      lines.push(`  \u2014 ${fnName} (excluded: ${exclusions[key]})`);
    }

    lines.push('');
  }

  const excludedCount = Object.keys(exclusions).length;
  lines.push(
    `Summary: ${coverage.coveredFunctions}/${coverage.totalFunctions} functions covered (${coverage.percentage.toFixed(1)}%)` +
    (excludedCount > 0 ? `, ${excludedCount} excluded` : '')
  );

  if (coverage.percentage === 100) {
    lines.push('PASS: All API functions have contract test coverage');
  } else {
    lines.push('FAIL: Contract coverage is not 100%');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// File scanning (main execution)
// ---------------------------------------------------------------------------

/**
 * Scan API modules directory and return a map of module name to exported functions.
 */
function scanApiModules(apiDir: string): Map<string, string[]> {
  const modules = new Map<string, string[]>();
  const files = fs.readdirSync(apiDir).filter((f) => {
    return (
      f.endsWith('.ts') &&
      f !== 'index.ts' &&
      !f.endsWith('.test.ts') &&
      !f.endsWith('.spec.ts')
    );
  });

  for (const file of files) {
    const source = fs.readFileSync(path.join(apiDir, file), 'utf-8');
    const functions = extractExportedFunctions(source);
    if (functions.length > 0) {
      const moduleName = file.replace(/\.ts$/, '');
      modules.set(moduleName, functions);
    }
  }

  return modules;
}

/**
 * Scan contract test files and return a merged map of module name to imported functions.
 */
function scanContractTests(contractDir: string): Map<string, string[]> {
  const merged = new Map<string, string[]>();

  const files = fs.readdirSync(contractDir).filter((f) => {
    return f.endsWith('.integration.test.ts');
  });

  for (const file of files) {
    const source = fs.readFileSync(path.join(contractDir, file), 'utf-8');
    const imports = extractImportedFunctions(source);

    for (const [moduleName, functions] of imports) {
      const existing = merged.get(moduleName) || [];
      merged.set(moduleName, [...existing, ...functions]);
    }
  }

  // Deduplicate per module
  for (const [moduleName, functions] of merged) {
    merged.set(moduleName, [...new Set(functions)]);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const frontendRoot = path.resolve(__dirname, '..');
  const apiDir = path.join(frontendRoot, 'src', 'lib', 'api');
  const contractDir = path.join(frontendRoot, 'src', '__tests__', 'contract');

  if (!fs.existsSync(apiDir)) {
    console.error(`Error: API directory not found: ${apiDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(contractDir)) {
    console.error(`Error: Contract test directory not found: ${contractDir}`);
    process.exit(1);
  }

  const apiModules = scanApiModules(apiDir);
  const coveredImports = scanContractTests(contractDir);
  const coverage = computeCoverage(apiModules, coveredImports);
  const report = formatReport(coverage);

  console.log(report);

  process.exit(coverage.percentage === 100 ? 0 : 1);
}

// Only run main when executed directly (not when imported for testing)
if (require.main === module) {
  main();
}
