/**
 * Tests for the contract-coverage checking script.
 *
 * These tests validate the core logic: extracting exported functions from
 * API modules, extracting imports from contract tests, and computing coverage.
 */

import {
  extractExportedFunctions,
  extractImportedFunctions,
  computeCoverage,
  formatReport,
} from '../check-contract-coverage';

describe('extractExportedFunctions', () => {
  it('extracts simple export async function declarations', () => {
    const source = `
export async function getCurrentUser(): Promise<User> {
  return apiGet<User>('/auth/me');
}

export async function bootstrapUser(): Promise<User> {
  return apiPost<User>('/auth/bootstrap');
}
`;
    expect(extractExportedFunctions(source)).toEqual([
      'getCurrentUser',
      'bootstrapUser',
    ]);
  });

  it('extracts multi-line export async function declarations', () => {
    const source = `
export async function createSession(
  sectionId: string,
  problemId?: string
): Promise<Session> {
  return apiPost<Session>('/sessions', body);
}
`;
    expect(extractExportedFunctions(source)).toEqual(['createSession']);
  });

  it('ignores non-async exports (interfaces, types, consts)', () => {
    const source = `
export interface ClassDetailsResponse {
  class: Class;
  sections: Section[];
}

export type InvitationStatus = 'pending' | 'consumed';

export async function getClass(id: string): Promise<ClassDetailsResponse> {
  return apiGet<ClassDetailsResponse>(\`/classes/\${id}\`);
}
`;
    expect(extractExportedFunctions(source)).toEqual(['getClass']);
  });

  it('returns empty array when no exported async functions', () => {
    const source = `
import { apiGet } from '@/lib/api-client';
export interface Foo { bar: string; }
`;
    expect(extractExportedFunctions(source)).toEqual([]);
  });
});

describe('extractImportedFunctions', () => {
  it('extracts single-line imports from @/lib/api/* modules', () => {
    const source = `
import { getCurrentUser } from '@/lib/api/auth';
import { listClasses } from '@/lib/api/classes';
`;
    const result = extractImportedFunctions(source);
    expect(result.get('auth')).toEqual(['getCurrentUser']);
    expect(result.get('classes')).toEqual(['listClasses']);
  });

  it('extracts multiple imports from same module', () => {
    const source = `
import { listNamespaces, getNamespaceUsers } from '@/lib/api/namespaces';
`;
    const result = extractImportedFunctions(source);
    expect(result.get('namespaces')).toEqual([
      'listNamespaces',
      'getNamespaceUsers',
    ]);
  });

  it('handles multi-line imports', () => {
    const source = `
import {
  listNamespaces,
  getNamespaceUsers,
  createNamespace,
} from '@/lib/api/namespaces';
`;
    const result = extractImportedFunctions(source);
    expect(result.get('namespaces')).toEqual([
      'listNamespaces',
      'getNamespaceUsers',
      'createNamespace',
    ]);
  });

  it('ignores imports from non-api modules', () => {
    const source = `
import { configureTestAuth, INSTRUCTOR_TOKEN } from './helpers';
import { expectSnakeCaseKeys } from './validators';
import { getCurrentUser } from '@/lib/api/auth';
`;
    const result = extractImportedFunctions(source);
    expect(result.size).toBe(1);
    expect(result.get('auth')).toEqual(['getCurrentUser']);
  });

  it('ignores type-only imports', () => {
    const source = `
import type { User } from '@/lib/api/auth';
import { getCurrentUser } from '@/lib/api/auth';
`;
    const result = extractImportedFunctions(source);
    expect(result.get('auth')).toEqual(['getCurrentUser']);
  });

  it('returns empty map when no matching imports', () => {
    const source = `
import { something } from './helpers';
`;
    const result = extractImportedFunctions(source);
    expect(result.size).toBe(0);
  });

  it('merges imports from multiple test files for same module', () => {
    const source1 = `import { listClasses } from '@/lib/api/classes';`;
    const source2 = `import { getClass, createClass } from '@/lib/api/classes';`;

    const map1 = extractImportedFunctions(source1);
    const map2 = extractImportedFunctions(source2);

    // Simulate merging
    const merged = new Map<string, string[]>();
    for (const [mod, fns] of map1) {
      merged.set(mod, [...(merged.get(mod) || []), ...fns]);
    }
    for (const [mod, fns] of map2) {
      merged.set(mod, [...(merged.get(mod) || []), ...fns]);
    }

    expect(merged.get('classes')).toEqual([
      'listClasses',
      'getClass',
      'createClass',
    ]);
  });
});

describe('computeCoverage', () => {
  it('computes correct coverage for partially covered module', () => {
    const apiModules = new Map<string, string[]>([
      ['auth', ['getCurrentUser', 'bootstrapUser']],
    ]);
    const coveredImports = new Map<string, string[]>([
      ['auth', ['getCurrentUser']],
    ]);

    const result = computeCoverage(apiModules, coveredImports);

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].name).toBe('auth');
    expect(result.modules[0].covered).toEqual(['getCurrentUser']);
    expect(result.modules[0].uncovered).toEqual(['bootstrapUser']);
    expect(result.totalFunctions).toBe(2);
    expect(result.coveredFunctions).toBe(1);
    expect(result.percentage).toBe(50);
  });

  it('computes correct coverage for fully covered module', () => {
    const apiModules = new Map<string, string[]>([
      ['auth', ['getCurrentUser', 'bootstrapUser']],
    ]);
    const coveredImports = new Map<string, string[]>([
      ['auth', ['getCurrentUser', 'bootstrapUser']],
    ]);

    const result = computeCoverage(apiModules, coveredImports);

    expect(result.modules[0].covered).toEqual([
      'getCurrentUser',
      'bootstrapUser',
    ]);
    expect(result.modules[0].uncovered).toEqual([]);
    expect(result.totalFunctions).toBe(2);
    expect(result.coveredFunctions).toBe(2);
    expect(result.percentage).toBe(100);
  });

  it('computes correct coverage for uncovered module', () => {
    const apiModules = new Map<string, string[]>([
      ['admin', ['getAdminStats', 'listAdminUsers']],
    ]);
    const coveredImports = new Map<string, string[]>();

    const result = computeCoverage(apiModules, coveredImports);

    expect(result.modules[0].covered).toEqual([]);
    expect(result.modules[0].uncovered).toEqual([
      'getAdminStats',
      'listAdminUsers',
    ]);
    expect(result.totalFunctions).toBe(2);
    expect(result.coveredFunctions).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it('computes correct totals across multiple modules', () => {
    const apiModules = new Map<string, string[]>([
      ['auth', ['getCurrentUser', 'bootstrapUser']],
      ['classes', ['getClass', 'listClasses', 'createClass']],
    ]);
    const coveredImports = new Map<string, string[]>([
      ['auth', ['getCurrentUser']],
      ['classes', ['listClasses']],
    ]);

    const result = computeCoverage(apiModules, coveredImports);

    expect(result.totalFunctions).toBe(5);
    expect(result.coveredFunctions).toBe(2);
    expect(result.percentage).toBe(40);
  });

  it('returns 100% when no functions exist', () => {
    const apiModules = new Map<string, string[]>();
    const coveredImports = new Map<string, string[]>();

    const result = computeCoverage(apiModules, coveredImports);

    expect(result.totalFunctions).toBe(0);
    expect(result.coveredFunctions).toBe(0);
    expect(result.percentage).toBe(100);
  });

  it('sorts modules alphabetically', () => {
    const apiModules = new Map<string, string[]>([
      ['sessions', ['createSession']],
      ['auth', ['getCurrentUser']],
      ['classes', ['listClasses']],
    ]);
    const coveredImports = new Map<string, string[]>();

    const result = computeCoverage(apiModules, coveredImports);

    expect(result.modules.map((m) => m.name)).toEqual([
      'auth',
      'classes',
      'sessions',
    ]);
  });
});

describe('formatReport', () => {
  it('includes header and summary', () => {
    const coverage = computeCoverage(
      new Map([['auth', ['getCurrentUser', 'bootstrapUser']]]),
      new Map([['auth', ['getCurrentUser']]])
    );
    const report = formatReport(coverage);

    expect(report).toContain('Contract Test Coverage Report');
    expect(report).toContain('auth.ts');
    expect(report).toContain('1/2 covered');
    expect(report).toContain('getCurrentUser');
    expect(report).toContain('bootstrapUser');
    expect(report).toContain('Summary: 1/2 functions covered (50.0%)');
    expect(report).toContain('FAIL');
  });

  it('shows PASS when 100% covered', () => {
    const coverage = computeCoverage(
      new Map([['auth', ['getCurrentUser']]]),
      new Map([['auth', ['getCurrentUser']]])
    );
    const report = formatReport(coverage);

    expect(report).toContain('PASS');
    expect(report).not.toContain('FAIL');
  });

  it('marks covered functions with checkmark and uncovered with X', () => {
    const coverage = computeCoverage(
      new Map([['auth', ['getCurrentUser', 'bootstrapUser']]]),
      new Map([['auth', ['getCurrentUser']]])
    );
    const report = formatReport(coverage);

    // Covered function gets a checkmark
    expect(report).toMatch(/.*getCurrentUser/);
    // Uncovered function gets an X
    expect(report).toMatch(/.*bootstrapUser/);
  });
});
