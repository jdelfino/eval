/**
 * Shared types for instructor session components.
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */

/** Common class fields used across instructor UI components. */
export interface ClassInfo {
  id: string;
  name: string;
  namespace_id?: string;
  description?: string;
}

/** ClassInfo extended with section count, used by ClassList. */
export interface ClassWithSections extends ClassInfo {
  section_count: number;
}

export interface Student {
  id: string;
  name: string;
  has_code: boolean;
  execution_settings?: {
    random_seed?: number;
    stdin?: string;
    attached_files?: Array<{ name: string; content: string }>;
  };
}

export interface RealtimeStudent {
  id: string;
  name: string;
  code?: string;
  execution_settings?: {
    random_seed?: number;
    stdin?: string;
    attached_files?: Array<{ name: string; content: string }>;
  };
}

/** Problem summary as returned by the API for list views. */
export interface ProblemSummary {
  id: string;
  title: string;
  description?: string;
  created_at: string;
  author_id: string;
  tags: string[];
  class_id: string;
  test_case_count?: number;
}

/**
 * Re-export ExecutionResult from api.ts to avoid duplication.
 */
export type { ExecutionResult } from '@/types/api';
