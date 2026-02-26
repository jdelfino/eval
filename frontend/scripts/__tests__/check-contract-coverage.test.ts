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
  extractDataInterfaces,
  extractExportedValidators,
  extractImportedValidators,
  computeRealtimeCoverage,
  formatRealtimeSection,
  type RealtimeCoverageResult,
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

    const result = computeCoverage(apiModules, coveredImports, {});

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

    const result = computeCoverage(apiModules, coveredImports, {});

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
      ['admin', ['getAdminStats', 'listNamespaceUsers']],
    ]);
    const coveredImports = new Map<string, string[]>();

    const result = computeCoverage(apiModules, coveredImports, {});

    expect(result.modules[0].covered).toEqual([]);
    expect(result.modules[0].uncovered).toEqual([
      'getAdminStats',
      'listNamespaceUsers',
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

    const result = computeCoverage(apiModules, coveredImports, {});

    expect(result.totalFunctions).toBe(5);
    expect(result.coveredFunctions).toBe(2);
    expect(result.percentage).toBe(40);
  });

  it('returns 100% when no functions exist', () => {
    const apiModules = new Map<string, string[]>();
    const coveredImports = new Map<string, string[]>();

    const result = computeCoverage(apiModules, coveredImports, {});

    expect(result.totalFunctions).toBe(0);
    expect(result.coveredFunctions).toBe(0);
    expect(result.percentage).toBe(100);
  });

  it('excludes functions listed in exclusions', () => {
    const apiModules = new Map<string, string[]>([
      ['auth', ['getCurrentUser', 'bootstrapUser', 'secretFunc']],
    ]);
    const coveredImports = new Map<string, string[]>([
      ['auth', ['getCurrentUser', 'bootstrapUser']],
    ]);
    const exclusions = { 'auth/secretFunc': 'Requires special infra' };

    const result = computeCoverage(apiModules, coveredImports, exclusions);

    expect(result.modules[0].covered).toEqual(['getCurrentUser', 'bootstrapUser']);
    expect(result.modules[0].uncovered).toEqual([]);
    expect(result.totalFunctions).toBe(2);
    expect(result.coveredFunctions).toBe(2);
    expect(result.percentage).toBe(100);
  });

  it('sorts modules alphabetically', () => {
    const apiModules = new Map<string, string[]>([
      ['sessions', ['createSession']],
      ['auth', ['getCurrentUser']],
      ['classes', ['listClasses']],
    ]);
    const coveredImports = new Map<string, string[]>();

    const result = computeCoverage(apiModules, coveredImports, {});

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
      new Map([['auth', ['getCurrentUser']]]),
      {}
    );
    const report = formatReport(coverage, {});

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
      new Map([['auth', ['getCurrentUser']]]),
      {}
    );
    const report = formatReport(coverage, {});

    expect(report).toContain('PASS');
    expect(report).not.toContain('FAIL');
  });

  it('marks covered functions with checkmark and uncovered with X', () => {
    const coverage = computeCoverage(
      new Map([['auth', ['getCurrentUser', 'bootstrapUser']]]),
      new Map([['auth', ['getCurrentUser']]]),
      {}
    );
    const report = formatReport(coverage, {});

    // Covered function gets a checkmark
    expect(report).toContain('\u2713 getCurrentUser');
    // Uncovered function gets an X
    expect(report).toContain('\u2717 bootstrapUser');
  });
});

// ---------------------------------------------------------------------------
// Realtime event coverage
// ---------------------------------------------------------------------------

describe('extractDataInterfaces', () => {
  it('extracts exported interface names matching *Data pattern', () => {
    const source = `
export interface StudentJoinedData {
  user_id: string;
  display_name: string;
}

export interface SessionEndedData {
  session_id: string;
  reason: string;
}
`;
    expect(extractDataInterfaces(source)).toEqual([
      'StudentJoinedData',
      'SessionEndedData',
    ]);
  });

  it('ignores non-exported interfaces', () => {
    const source = `
interface InternalData {
  foo: string;
}

export interface StudentJoinedData {
  user_id: string;
}
`;
    expect(extractDataInterfaces(source)).toEqual(['StudentJoinedData']);
  });

  it('ignores exported interfaces not matching *Data pattern', () => {
    const source = `
export interface RealtimeEventEnvelope<T = unknown> {
  type: string;
  data: T;
}

export interface StudentJoinedData {
  user_id: string;
}
`;
    expect(extractDataInterfaces(source)).toEqual(['StudentJoinedData']);
  });

  it('ignores exported type aliases', () => {
    const source = `
export type RealtimeEventType = 'student_joined' | 'session_ended';

export interface StudentJoinedData {
  user_id: string;
}
`;
    expect(extractDataInterfaces(source)).toEqual(['StudentJoinedData']);
  });

  it('returns empty array when no *Data interfaces', () => {
    const source = `
export interface Foo { bar: string; }
`;
    expect(extractDataInterfaces(source)).toEqual([]);
  });
});

describe('extractExportedValidators', () => {
  it('extracts exported validate*Shape function names', () => {
    const source = `
export function validateStudentJoinedShape(obj: StudentJoinedData) {
  expect(typeof obj.user_id).toBe('string');
}

export function validateSessionEndedShape(obj: SessionEndedData) {
  expect(typeof obj.session_id).toBe('string');
}
`;
    expect(extractExportedValidators(source)).toEqual([
      'validateStudentJoinedShape',
      'validateSessionEndedShape',
    ]);
  });

  it('ignores non-exported validate*Shape functions', () => {
    const source = `
function validateInternalShape(obj: object) {}

export function validateStudentJoinedShape(obj: StudentJoinedData) {}
`;
    expect(extractExportedValidators(source)).toEqual(['validateStudentJoinedShape']);
  });

  it('ignores exported functions not matching validate*Shape pattern', () => {
    const source = `
export function expectSnakeCaseKeys(obj: object, label: string) {}
export function validateStudentJoinedShape(obj: StudentJoinedData) {}
export function validateUserShape(user: User) {}
`;
    // validateUserShape does NOT match validate*Shape (because Shape is at the end)
    // Actually it does match validate*Shape - let's verify the pattern matches validateUserShape too
    expect(extractExportedValidators(source)).toEqual([
      'validateStudentJoinedShape',
      'validateUserShape',
    ]);
  });

  it('returns empty array when no validate*Shape functions', () => {
    const source = `
export function expectSnakeCaseKeys(obj: object) {}
`;
    expect(extractExportedValidators(source)).toEqual([]);
  });
});

describe('extractImportedValidators', () => {
  it('extracts validate*Shape imports from ./validators', () => {
    const source = `
import {
  validateStudentJoinedShape,
  validateSessionEndedShape,
} from './validators';
`;
    expect(extractImportedValidators(source)).toEqual([
      'validateStudentJoinedShape',
      'validateSessionEndedShape',
    ]);
  });

  it('extracts single-line imports from ./validators', () => {
    const source = `import { validateStudentJoinedShape } from './validators';`;
    expect(extractImportedValidators(source)).toEqual(['validateStudentJoinedShape']);
  });

  it('ignores non-validate*Shape imports from ./validators', () => {
    const source = `
import {
  validateStudentJoinedShape,
  expectSnakeCaseKeys,
  configureTestAuth,
} from './validators';
`;
    const result = extractImportedValidators(source);
    expect(result).toContain('validateStudentJoinedShape');
    expect(result).not.toContain('expectSnakeCaseKeys');
    expect(result).not.toContain('configureTestAuth');
  });

  it('ignores imports from other sources (not ./validators)', () => {
    const source = `
import { validateStudentJoinedShape } from './helpers';
import { validateSessionEndedShape } from './validators';
`;
    expect(extractImportedValidators(source)).toEqual(['validateSessionEndedShape']);
  });

  it('returns empty array when no matching imports', () => {
    const source = `
import { expectSnakeCaseKeys } from './validators';
`;
    expect(extractImportedValidators(source)).toEqual([]);
  });
});

describe('computeRealtimeCoverage', () => {
  it('marks event type as covered when validator exists and is imported in tests', () => {
    const dataInterfaces = ['StudentJoinedData', 'SessionEndedData'];
    const validatorNames = new Set(['validateStudentJoinedShape', 'validateSessionEndedShape']);
    const importedValidators = new Set(['validateStudentJoinedShape', 'validateSessionEndedShape']);

    const result = computeRealtimeCoverage(dataInterfaces, validatorNames, importedValidators);

    expect(result.covered).toEqual(['StudentJoinedData', 'SessionEndedData']);
    expect(result.uncovered).toEqual([]);
    expect(result.percentage).toBe(100);
  });

  it('marks event type as uncovered when validator is missing', () => {
    const dataInterfaces = ['StudentJoinedData', 'SessionEndedData'];
    const validatorNames = new Set(['validateStudentJoinedShape']);
    const importedValidators = new Set(['validateStudentJoinedShape']);

    const result = computeRealtimeCoverage(dataInterfaces, validatorNames, importedValidators);

    expect(result.covered).toEqual(['StudentJoinedData']);
    expect(result.uncovered).toEqual(['SessionEndedData']);
    expect(result.percentage).toBe(50);
  });

  it('marks event type as uncovered when validator exists but is not imported in tests', () => {
    const dataInterfaces = ['StudentJoinedData', 'SessionEndedData'];
    const validatorNames = new Set(['validateStudentJoinedShape', 'validateSessionEndedShape']);
    const importedValidators = new Set(['validateStudentJoinedShape']); // SessionEnded not imported

    const result = computeRealtimeCoverage(dataInterfaces, validatorNames, importedValidators);

    expect(result.covered).toEqual(['StudentJoinedData']);
    expect(result.uncovered).toEqual(['SessionEndedData']);
    expect(result.percentage).toBe(50);
  });

  it('returns 100% when no data interfaces exist', () => {
    const result = computeRealtimeCoverage([], new Set(), new Set());

    expect(result.covered).toEqual([]);
    expect(result.uncovered).toEqual([]);
    expect(result.percentage).toBe(100);
  });

  it('computes correct percentage for partial coverage', () => {
    const dataInterfaces = ['AData', 'BData', 'CData', 'DData'];
    const validatorNames = new Set(['validateAShape', 'validateBShape', 'validateCShape', 'validateDShape']);
    const importedValidators = new Set(['validateAShape', 'validateBShape']); // 2 of 4

    const result = computeRealtimeCoverage(dataInterfaces, validatorNames, importedValidators);

    expect(result.covered).toEqual(['AData', 'BData']);
    expect(result.uncovered).toEqual(['CData', 'DData']);
    expect(result.percentage).toBe(50);
  });
});

describe('formatRealtimeSection', () => {
  it('includes realtime coverage section header', () => {
    const coverage: RealtimeCoverageResult = {
      covered: ['StudentJoinedData'],
      uncovered: [],
      percentage: 100,
    };
    const report = formatRealtimeSection(coverage);
    expect(report).toContain('Realtime Event Coverage');
  });

  it('shows PASS when all event types are covered', () => {
    const coverage: RealtimeCoverageResult = {
      covered: ['StudentJoinedData', 'SessionEndedData'],
      uncovered: [],
      percentage: 100,
    };
    const report = formatRealtimeSection(coverage);
    expect(report).toContain('PASS');
    expect(report).not.toContain('FAIL');
  });

  it('shows FAIL when some event types are uncovered', () => {
    const coverage: RealtimeCoverageResult = {
      covered: ['StudentJoinedData'],
      uncovered: ['SessionEndedData'],
      percentage: 50,
    };
    const report = formatRealtimeSection(coverage);
    expect(report).toContain('FAIL');
  });

  it('marks covered types with checkmark and uncovered with X', () => {
    const coverage: RealtimeCoverageResult = {
      covered: ['StudentJoinedData'],
      uncovered: ['SessionEndedData'],
      percentage: 50,
    };
    const report = formatRealtimeSection(coverage);
    expect(report).toContain('\u2713 StudentJoinedData');
    expect(report).toContain('\u2717 SessionEndedData');
  });

  it('includes summary line with counts', () => {
    const coverage: RealtimeCoverageResult = {
      covered: ['StudentJoinedData'],
      uncovered: ['SessionEndedData'],
      percentage: 50,
    };
    const report = formatRealtimeSection(coverage);
    expect(report).toContain('1/2');
  });
});
