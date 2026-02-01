/**
 * Analysis types for AI-powered code walkthrough (client-side).
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */

export type IssueSeverity = 'error' | 'misconception' | 'style' | 'good-pattern';

export interface AnalysisIssue {
  title: string;
  explanation: string;
  count: number;
  student_ids: string[];
  representative_student_label: string;
  representative_student_id: string;
  severity: IssueSeverity;
}

export interface WalkthroughSummary {
  total_submissions: number;
  filtered_out: number;
  analyzed_submissions: number;
  completion_estimate: {
    finished: number;
    in_progress: number;
    not_started: number;
  };
  warning?: string;
}

export interface WalkthroughScript {
  session_id: string;
  issues: AnalysisIssue[];
  summary: WalkthroughSummary;
  overall_note?: string;
  finished_student_ids: string[];
  generated_at: Date;
}

export interface AnalyzeCodeResponse {
  success: boolean;
  script?: WalkthroughScript;
  error?: string;
}
