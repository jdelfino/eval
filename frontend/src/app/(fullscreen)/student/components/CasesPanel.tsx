'use client';

import React from 'react';
import type { IOTestCase, TestResult } from '@/types/problem';

interface CasesPanelProps {
  /** Instructor-defined test cases from the problem. */
  instructorCases: IOTestCase[];
  /** Student-defined test cases (from student_work). */
  studentCases: IOTestCase[];
  /** Map of case name → result for executed cases. */
  caseResults: Record<string, TestResult>;
  /** Currently selected case name. */
  selectedCase: string | null;
  /** Whether any test is currently running. */
  isRunning: boolean;
  /** Called when user selects a case. */
  onSelectCase: (name: string) => void;
  /** Called when user clicks run on a single case. */
  onRunCase: (name: string) => void;
  /** Called when user clicks Run All. */
  onRunAll: () => void;
  /** Called when user clicks Add Case. */
  onAddCase: () => void;
  /** Called when user edits a student case. */
  onUpdateStudentCase: (name: string, updates: Partial<IOTestCase>) => void;
  /** Called when user deletes a student case. */
  onDeleteStudentCase: (name: string) => void;
  /** Whether to use dark theme (defaults to true for sidebar). */
  darkTheme?: boolean;
}

/**
 * Sidebar panel listing all I/O test cases (instructor + student-defined).
 *
 * Features:
 * - Flat list with source badges (instructor / mine) and result badges (pass/fail/not run)
 * - Run All button and per-case run buttons
 * - Add Case button for student-defined cases
 * - Selecting a case shows its detail below the list (read-only for instructor, editable for student)
 */
export function CasesPanel({
  instructorCases,
  studentCases,
  caseResults,
  selectedCase,
  isRunning,
  onSelectCase,
  onRunCase,
  onRunAll,
  onAddCase,
  onUpdateStudentCase,
  onDeleteStudentCase,
  darkTheme = true,
}: CasesPanelProps) {
  const bg = darkTheme ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-800';
  const borderColor = darkTheme ? 'border-gray-700' : 'border-gray-200';
  const itemBg = darkTheme ? 'bg-gray-700' : 'bg-gray-50';
  const itemSelectedBg = darkTheme ? 'bg-gray-600' : 'bg-blue-50';
  const mutedText = darkTheme ? 'text-gray-400' : 'text-gray-500';

  const allCases = [
    ...instructorCases.map(c => ({ ...c, source: 'instructor' as const })),
    ...studentCases.map(c => ({ ...c, source: 'student' as const })),
  ].sort((a, b) => a.order - b.order);

  const selectedCaseData =
    selectedCase !== null
      ? allCases.find(c => c.name === selectedCase)
      : null;

  return (
    <div className={`h-full flex flex-col ${bg}`}>
      {/* Header with Run All and Add Case buttons */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${borderColor} flex-shrink-0`}>
        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
          Test Cases
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onRunAll}
            disabled={isRunning || allCases.length === 0}
            className="px-2 py-1 text-xs rounded bg-green-700 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Run All"
          >
            Run All
          </button>
          <button
            type="button"
            onClick={onAddCase}
            className="px-2 py-1 text-xs rounded bg-blue-700 text-white hover:bg-blue-600"
            aria-label="Add Case"
          >
            + Add Case
          </button>
        </div>
      </div>

      {/* Case list */}
      <div className="flex-1 overflow-y-auto">
        {allCases.length === 0 ? (
          <div className={`p-4 text-xs ${mutedText} italic text-center`}>
            No cases defined.
          </div>
        ) : (
          <ul className="py-1">
            {allCases.map(tc => {
              const result = caseResults[tc.name];
              const isSelected = selectedCase === tc.name;

              return (
                <li
                  key={tc.name}
                  data-selected={isSelected ? 'true' : undefined}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b ${borderColor} ${
                    isSelected ? itemSelectedBg : `hover:${itemBg}`
                  }`}
                  onClick={() => onSelectCase(tc.name)}
                >
                  {/* Case name */}
                  <span className="flex-1 text-xs font-mono truncate">{tc.name}</span>

                  {/* Source badge */}
                  {tc.source === 'instructor' ? (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-purple-900 text-purple-300 border border-purple-700 flex-shrink-0">
                      Instructor
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-teal-900 text-teal-300 border border-teal-700 flex-shrink-0">
                      Mine
                    </span>
                  )}

                  {/* Result badge */}
                  {result && (
                    <ResultBadge status={result.status} />
                  )}

                  {/* Per-case run button */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onRunCase(tc.name);
                    }}
                    disabled={isRunning}
                    className="px-1.5 py-0.5 text-xs rounded bg-gray-600 text-gray-200 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    aria-label={`Run ${tc.name}`}
                  >
                    ▶
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Selected case detail */}
      {selectedCaseData && (
        <CaseDetail
          tc={selectedCaseData}
          isStudent={selectedCaseData.source === 'student'}
          darkTheme={darkTheme}
          onUpdate={(updates) => onUpdateStudentCase(selectedCaseData.name, updates)}
          onDelete={() => onDeleteStudentCase(selectedCaseData.name)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ResultBadge({ status }: { status: 'passed' | 'failed' | 'error' | 'run' }) {
  if (status === 'passed') {
    return (
      <span className="px-1.5 py-0.5 text-xs rounded bg-green-900 text-green-300 border border-green-700 flex-shrink-0">
        Pass
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="px-1.5 py-0.5 text-xs rounded bg-red-900 text-red-300 border border-red-700 flex-shrink-0">
        Fail
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-900 text-yellow-300 border border-yellow-700 flex-shrink-0">
      Error
    </span>
  );
}

interface CaseDetailProps {
  tc: IOTestCase & { source: 'instructor' | 'student' };
  isStudent: boolean;
  darkTheme: boolean;
  onUpdate: (updates: Partial<IOTestCase>) => void;
  onDelete: () => void;
}

function CaseDetail({ tc, isStudent, darkTheme, onUpdate, onDelete }: CaseDetailProps) {
  const borderColor = darkTheme ? 'border-gray-700' : 'border-gray-200';
  const labelColor = darkTheme ? 'text-gray-400' : 'text-gray-500';
  const inputBg = darkTheme
    ? 'bg-gray-700 border-gray-600 text-gray-200'
    : 'bg-white border-gray-300 text-gray-900';
  const readOnlyBg = darkTheme
    ? 'bg-gray-750 border-gray-600 text-gray-300'
    : 'bg-gray-50 border-gray-200 text-gray-700';

  return (
    <div className={`border-t ${borderColor} p-3 flex-shrink-0 max-h-60 overflow-y-auto`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold font-mono">{tc.name}</span>
        {isStudent && (
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-red-400 hover:text-red-300"
            aria-label={`Delete ${tc.name}`}
          >
            Delete
          </button>
        )}
      </div>

      <div className="space-y-2">
        {/* Input */}
        <div>
          <label className={`text-xs ${labelColor} block mb-1`}>Input (stdin):</label>
          <textarea
            value={tc.input}
            readOnly={!isStudent}
            onChange={isStudent ? (e) => onUpdate({ input: e.target.value }) : undefined}
            rows={2}
            className={`w-full px-2 py-1 text-xs font-mono rounded border ${
              isStudent ? inputBg : readOnlyBg
            } resize-none`}
          />
        </div>

        {/* Expected output (if set) */}
        {tc.expected_output !== undefined && tc.expected_output !== '' && (
          <div>
            <label className={`text-xs ${labelColor} block mb-1`}>Expected output:</label>
            <textarea
              value={tc.expected_output}
              readOnly={!isStudent}
              onChange={
                isStudent ? (e) => onUpdate({ expected_output: e.target.value }) : undefined
              }
              rows={2}
              className={`w-full px-2 py-1 text-xs font-mono rounded border ${
                isStudent ? inputBg : readOnlyBg
              } resize-none`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
