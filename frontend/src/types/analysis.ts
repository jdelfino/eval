/**
 * Analysis types for AI-powered code walkthrough (client-side).
 *
 * Migrated from @/server/types/analysis — these are pure type
 * definitions with no server dependencies.
 */

export type IssueSeverity = 'error' | 'misconception' | 'style' | 'good-pattern';

export interface AnalysisIssue {
  title: string;
  explanation: string;
  count: number;
  studentIds: string[];
  representativeStudentLabel: string;
  representativeStudentId: string;
  severity: IssueSeverity;
}

export interface WalkthroughSummary {
  totalSubmissions: number;
  filteredOut: number;
  analyzedSubmissions: number;
  completionEstimate: {
    finished: number;
    inProgress: number;
    notStarted: number;
  };
  warning?: string;
}

export interface WalkthroughScript {
  sessionId: string;
  issues: AnalysisIssue[];
  summary: WalkthroughSummary;
  overallNote?: string;
  finishedStudentIds: string[];
  generatedAt: Date;
}

export interface AnalyzeCodeResponse {
  success: boolean;
  script?: WalkthroughScript;
  error?: string;
}
