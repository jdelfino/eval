/**
 * Client-side Problem-related types.
 *
 * Wire-format Problem lives in api.ts (string timestamps, nullable fields).
 * This file defines rich client types with Date timestamps and typed fields,
 * plus mapper functions for wire -> client conversion.
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */
import type { Problem as ApiProblem, IOTestCase } from './api';

// ---------------------------------------------------------------------------
// Problem (rich client type with Date timestamps)
// ---------------------------------------------------------------------------

export interface Problem {
  id: string;
  namespace_id: string;
  title: string;
  description: string | null;
  starter_code: string | null;
  test_cases: IOTestCase[];
  author_id: string;
  class_id: string | null;
  tags: string[];
  solution: string | null;
  language: string;
  created_at: Date;
  updated_at: Date;
}

export interface StudentProblem {
  id: string;
  title: string;
  description: string;
  starter_code?: string;
  test_cases: IOTestCase[];
}

export type ProblemInput = Omit<Problem, 'id' | 'created_at' | 'updated_at'>;

// ---------------------------------------------------------------------------
// Mapper: wire (api.ts) -> client
// ---------------------------------------------------------------------------

/**
 * Convert an API wire-format Problem to a rich client Problem with Date timestamps.
 * test_cases is normalized to IOTestCase[] — null/undefined from legacy wire data
 * becomes an empty array.
 */
export function mapApiProblem(api: ApiProblem): Problem {
  return {
    ...api,
    test_cases: (api.test_cases as IOTestCase[] | null) ?? [],
    created_at: new Date(api.created_at),
    updated_at: new Date(api.updated_at),
  };
}

