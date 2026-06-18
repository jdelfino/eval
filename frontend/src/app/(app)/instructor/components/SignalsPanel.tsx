'use client';

/**
 * SignalsPanel - right column (320px) of the G4 instructor live dashboard
 * (eval-cej.8.9, T9). Reskin of the analysis stack per
 * docs/design/handoff/v4/instructor-signals.jsx, MINUS the dropped
 * "Stuck > 3min" card (locked decision) and MINUS the "Discuss as class"
 * button (the discuss mechanism stays on the public view, owned by T10).
 *
 * Two signal cards over live websocket state:
 *   - "Joined N/M"  : realtimeStudents.length / enrolled.length
 *   - "Passing X · Failing Y · at last run" : a client-side reduce over each
 *     joined student's LAST run summary using the locked deriveStudentStatus
 *     semantics. Passing = all tests passed; Failing = failures or errors-only;
 *     idle / never-ran / not-joined students are excluded from both counts. The
 *     "at last run" label (plan-review #7) reminds the instructor this lags live
 *     edits — it is last-known test state, not a live pass/fail count.
 *
 * Below the cards: the re-homed bug-cluster analysis flow (useAnalysisGroups +
 * GroupNavigationHeader + StudentAnalysisDetails, Analyze button + options),
 * preserving every e2e selector so T11's re-selectoring stays minimal.
 *
 * Cross-column side effects (plan-review #10):
 *   - When the active analysis group changes, auto-focus that group's
 *     recommended student via onFocusStudent so the center column follows.
 *   - Per-group student chips render HERE (not inside StudentAnalysisDetails,
 *     which is reused untouched); each chip click focuses that student.
 *   - Roster group-filtering is intentionally DROPPED (cut scope) — this panel
 *     wires no roster filtering.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import GroupNavigationHeader from './GroupNavigationHeader';
import StudentAnalysisDetails from './StudentAnalysisDetails';
import useAnalysisGroups from '../hooks/useAnalysisGroups';
import { deriveStudentStatus } from '../lib/studentStatus';
import { RealtimeStudent } from '../types';
import type { RunSummary } from '@/types/api';
import type { EnrolledStudent } from './InstructorRoster';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

// DEFAULT_PROMPT must match the backend's DefaultCustomDirections in
// go-backend/internal/ai/prompt.go. When the instructor clicks Analyze without
// editing, this is exactly what the backend uses. Keeping them in sync ensures
// the pre-filled UI text reflects actual backend behavior.
const DEFAULT_PROMPT =
  `Identify distinct bugs, misconceptions, or patterns across all student submissions. Group students by issue. A student can appear in multiple issues. Order issues by frequency (most common first).\n\n` +
  `Severity guidelines:\n` +
  `- "error": A logical or correctness bug (e.g., off-by-one, wrong operator, incorrect algorithm)\n` +
  `- "misconception": A conceptual misunderstanding (e.g., confusing iteration with recursion, wrong mental model)\n` +
  `- "style": A code quality concern that does not affect correctness (e.g., redundant variable, unclear naming)\n` +
  `- "good-pattern": A positive practice worth highlighting to the class\n\n` +
  `Constraints:\n` +
  `- Be CONCISE — instructor reads this live during lecture.\n` +
  `- Maximum 5 issues. Only include issues that are pedagogically interesting.\n` +
  `- Title: short (3-8 words).\n` +
  `- Explanation: one sentence, actionable.\n` +
  `- Each issue must have at least 1 student.\n` +
  `- Omit students with empty or unmodified starter code from issue lists.\n` +
  `- Set overall_note to a 1-2 sentence summary of the class's performance.`;

/**
 * Live status fields that real realtime students carry from useRealtimeSession
 * (last_run_summary + honest last-activity) but which the locked RealtimeStudent
 * prop type does not declare. Read defensively so the cards work when present and
 * degrade gracefully (idle) when absent.
 */
type RealtimeStudentWithStatus = RealtimeStudent & {
  last_run_summary?: RunSummary | null;
  last_activity?: Date | string | null;
  last_update?: Date | string | null;
};

const SECTION_LABEL_CLASS =
  'text-[11px] font-semibold uppercase tracking-wide text-gray-500';

/** Small label/value signal card, reskinned per instructor-signals.jsx. */
function SigCard({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-gray-900">{children}</div>
    </div>
  );
}

export interface SignalsPanelProps {
  /** Session id for the analyze API flow. */
  session_id: string;
  /** Raw realtime students for client-side aggregate reduce. */
  realtimeStudents: RealtimeStudent[];
  /** Enrolled roster for the "Joined N/M" card. */
  enrolled: EnrolledStudent[];
  /** Focus a student (chips / group navigation focus the center column). */
  onFocusStudent: (userId: string) => void;
}

export function SignalsPanel({
  session_id,
  realtimeStudents,
  enrolled,
  onFocusStudent,
}: SignalsPanelProps) {
  // Analysis options state.
  const [showAnalysisOptions, setShowAnalysisOptions] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_PROMPT);

  const {
    analysisState,
    error: analysisError,
    groups,
    activeGroupIndex,
    overall_note,
    completion_estimate,
    analyze,
    navigateGroup,
    dismissGroup,
  } = useAnalysisGroups();

  // --- Signal-card reduce ----------------------------------------------------
  // Passing/Failing over each JOINED student's last run summary, using the
  // shared locked status semantics so the signals never disagree with the
  // roster/minimap. idle / never-ran / not-joined resolve outside {run, danger,
  // warn} and are excluded from both counts.
  const { passing, failing } = useMemo(() => {
    let passingCount = 0;
    let failingCount = 0;
    for (const student of realtimeStudents as RealtimeStudentWithStatus[]) {
      const status = deriveStudentStatus({
        lastRunSummary: student.last_run_summary,
        lastUpdate: student.last_activity ?? student.last_update ?? null,
        joined: true,
      });
      if (status === 'run') passingCount += 1;
      else if (status === 'danger' || status === 'warn') failingCount += 1;
    }
    return { passing: passingCount, failing: failingCount };
  }, [realtimeStudents]);

  const joinedCount = realtimeStudents.length;
  const enrolledCount = enrolled.length;

  // --- Active group + chips --------------------------------------------------
  const activeGroup = groups.length > 0 ? groups[activeGroupIndex] ?? null : null;
  const activeIssue = activeGroup?.issue;
  const isIssueGroup = !!activeGroup && activeGroup.id !== 'all';

  // Map user_id -> display name for chips (realtime first, fall back to roster).
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of enrolled) map.set(s.user_id, s.name);
    for (const s of realtimeStudents) map.set(s.id, s.name);
    return map;
  }, [realtimeStudents, enrolled]);

  // Auto-focus the active group's recommended student when the group changes
  // (plan-review #10) so the center column follows analysis navigation.
  const recommendedStudentId = activeGroup?.recommendedStudentId ?? null;
  useEffect(() => {
    if (recommendedStudentId) {
      onFocusStudent(recommendedStudentId);
    }
  }, [recommendedStudentId, onFocusStudent]);

  const handleAnalyze = useCallback(() => {
    analyze(session_id, selectedModel, customPrompt);
  }, [analyze, session_id, selectedModel, customPrompt]);

  const analyzeButtonLabel =
    analysisState === 'loading'
      ? 'Analyzing...'
      : analysisState === 'ready'
        ? 'Re-analyze'
        : 'Analyze submissions';

  return (
    <aside
      data-testid="signals-panel"
      className="flex flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white p-3.5"
    >
      {/* Class signal cards */}
      <div className={SECTION_LABEL_CLASS}>Class signal</div>
      <SigCard label="Joined" testId="signal-joined">
        {joinedCount} / {enrolledCount}
      </SigCard>
      <SigCard label="Last run" testId="signal-passing-failing">
        <span className="text-green-700">Passing {passing}</span>
        <span className="mx-1 text-gray-300">&middot;</span>
        <span className="text-red-700">Failing {failing}</span>
        <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
          at last run
        </span>
      </SigCard>

      <div className="h-px bg-gray-200" />

      {/* Common bugs (re-homed analysis flow) */}
      <div className={SECTION_LABEL_CLASS}>Common bugs &middot; click to focus</div>

      <div>
        {analysisState === 'error' ? (
          <div>
            <p className="mb-1 text-sm text-red-600" data-testid="analysis-error">
              {analysisError}
            </p>
            <button
              onClick={handleAnalyze}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Try Again
            </button>
          </div>
        ) : (
          <button
            onClick={handleAnalyze}
            disabled={realtimeStudents.length === 0 || analysisState === 'loading'}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="analyze-button"
          >
            {analysisState === 'loading' && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                data-testid="analyze-spinner"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {analyzeButtonLabel}
          </button>
        )}

        {/* Analysis options toggle */}
        <div className="mt-1 text-center">
          <button
            type="button"
            data-testid="analysis-options-toggle"
            onClick={() => setShowAnalysisOptions((prev) => !prev)}
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            Options
          </button>
        </div>

        {/* Collapsible analysis options panel */}
        {showAnalysisOptions && (
          <div
            className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
            data-testid="analysis-options-panel"
          >
            <div className="mb-2">
              <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="model-select">
                Model
              </label>
              <select
                id="model-select"
                data-testid="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="custom-prompt-textarea">
                Analysis directions
              </label>
              <textarea
                id="custom-prompt-textarea"
                data-testid="custom-prompt-textarea"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={4}
                className="w-full resize-y rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* Group navigation header */}
      {analysisState === 'ready' && groups.length > 0 && (
        <div data-testid="group-navigation">
          <GroupNavigationHeader
            groups={groups}
            activeGroupIndex={activeGroupIndex}
            onNavigate={navigateGroup}
            onDismiss={dismissGroup}
            overall_note={overall_note}
            completion_estimate={completion_estimate}
          />
        </div>
      )}

      {/* AI analysis details for the active issue group (reused as-is) */}
      {analysisState === 'ready' && activeIssue && (
        <div data-testid="student-analysis-details">
          <StudentAnalysisDetails issue={activeIssue} />
        </div>
      )}

      {/* Per-group student chips (rendered here, not in StudentAnalysisDetails).
          Clicking a chip focuses that student in the center column. */}
      {analysisState === 'ready' && isIssueGroup && activeGroup && activeGroup.student_ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="group-student-chips">
          {activeGroup.student_ids.map((userId) => (
            <button
              key={userId}
              type="button"
              onClick={() => onFocusStudent(userId)}
              className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
            >
              {nameById.get(userId) ?? userId}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

export default SignalsPanel;
