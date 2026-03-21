/**
 * Types for test execution responses.
 *
 * The backend returns {results[], summary} via the unified /execute endpoint.
 * These types are shared across execute.ts and UI components.
 */

import type { TestResult } from '@/types/problem';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  run: number;
  time_ms: number;
}

export interface TestResponse {
  results: TestResult[];
  summary: TestSummary;
}
