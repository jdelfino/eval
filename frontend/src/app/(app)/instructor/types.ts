/**
 * Shared types for instructor session components.
 */

/** Common class fields used across instructor UI components. */
export interface ClassInfo {
  id: string;
  name: string;
  namespaceId?: string;
  description?: string;
}

/** ClassInfo extended with section count, used by ClassList. */
export interface ClassWithSections extends ClassInfo {
  sectionCount: number;
}

export interface Student {
  id: string;
  name: string;
  hasCode: boolean;
  executionSettings?: {
    randomSeed?: number;
    stdin?: string;
    attachedFiles?: Array<{ name: string; content: string }>;
  };
}

export interface RealtimeStudent {
  id: string;
  name: string;
  code?: string;
  executionSettings?: {
    randomSeed?: number;
    stdin?: string;
    attachedFiles?: Array<{ name: string; content: string }>;
  };
}

/** Problem summary as returned by the API for list views. */
export interface ProblemSummary {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  authorId: string;
  tags: string[];
  classId: string;
  testCaseCount?: number;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  executionTime: number;
}
