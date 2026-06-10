'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { listStudentWorkForReview, listStudentProgress } from '@/lib/api';
import type {
  StudentWorkSummary,
  StudentSessionStat,
  StudentProgress,
} from '@/types/api';
import { BackButton } from '@/components/ui/BackButton';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSessionDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatLastUpdate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ResultPillProps {
  solved: boolean | null;
}

/**
 * ResultPill renders the current solved-state of a student's work on a problem.
 * NOTE: This reflects the *current* last_run_all_passed state, not the state at
 * the end of the session — per-session pass/fail history is not persisted.
 */
function ResultPill({ solved }: ResultPillProps) {
  if (solved === null) return null;
  if (solved) {
    return (
      <span
        data-testid="result-pill-solved"
        className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full"
      >
        solved
      </span>
    );
  }
  return (
    <span
      data-testid="result-pill-in-progress"
      className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full"
    >
      in progress
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function StudentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const section_id = params.section_id as string;
  const user_id = params.user_id as string;

  const { user } = useAuth();

  const [workSummaries, setWorkSummaries] = useState<StudentWorkSummary[]>([]);
  const [sessionStats, setSessionStats] = useState<StudentSessionStat[]>([]);
  const [student, setStudent] = useState<StudentProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const isInstructor =
    user != null && ['instructor', 'namespace-admin', 'system-admin'].includes(user.role);

  useEffect(() => {
    if (!user) return;

    if (!isInstructor) {
      router.push('/sections');
      return;
    }

    loadData();
  }, [user, section_id, user_id]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [workResponse, progress] = await Promise.all([
        listStudentWorkForReview(section_id, user_id),
        listStudentProgress(section_id),
      ]);

      setWorkSummaries(workResponse.work);
      setSessionStats(workResponse.sessions);

      const found = progress.find((p) => p.user_id === user_id) ?? null;
      setStudent(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student data');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (problemId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(problemId)) {
        next.delete(problemId);
      } else {
        next.add(problemId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-red-600 mb-4">{error}</p>
          <BackButton href={`/sections/${section_id}`}>Back to Section</BackButton>
        </div>
      </div>
    );
  }

  const studentName = student ? student.display_name || student.email : user_id;

  // Summary rail aggregates
  const sessionsAttended = sessionStats.length;
  const solvedCount = workSummaries.filter(
    (w) => w.student_work?.last_run_all_passed === true,
  ).length;
  const totalRevisions = sessionStats.reduce((sum, s) => sum + s.revision_count, 0);

  // Build a map from problem_id -> student_work for fast lookup in session rows
  const workByProblemId = new Map<string, StudentWorkSummary>(
    workSummaries
      .filter((w) => w.student_work != null)
      .map((w) => [w.problem.id, w]),
  );

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <BackButton href={`/sections/${section_id}`}>Back to Section</BackButton>
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">{studentName}</h1>
        {student?.email && student.display_name && (
          <p className="text-gray-500 text-sm">{student.email}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Left: Sessions table */}
        <div>
          <div
            className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2"
            aria-label="Sessions heading"
          >
            Sessions
          </div>

          {sessionStats.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No session activity yet.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
              {sessionStats.map((session, i) => {
                const workSummary = session.problem_id
                  ? workByProblemId.get(session.problem_id)
                  : undefined;
                const solved =
                  workSummary?.student_work?.last_run_all_passed ?? null;
                const hasWork = workSummary?.student_work != null;

                return (
                  <div
                    key={session.session_id}
                    data-testid={`session-row-${session.session_id}`}
                    className={`grid gap-3 items-center px-4 py-3 text-sm ${
                      i > 0 ? 'border-t border-gray-100' : ''
                    }`}
                    style={{
                      gridTemplateColumns: '130px 1fr auto auto auto',
                    }}
                  >
                    {/* Date */}
                    <span className="text-gray-400 font-mono text-xs">
                      {formatSessionDate(session.session_created_at)}
                    </span>

                    {/* Problem title */}
                    <span className="font-medium">
                      {session.problem_title ?? '—'}
                    </span>

                    {/* Result pill — current state, not session-end state */}
                    {session.problem_id && hasWork ? (
                      <ResultPill solved={solved} />
                    ) : (
                      <span />
                    )}

                    {/* Revision count */}
                    <span
                      className="text-xs text-gray-400 font-mono"
                      data-testid={`revision-count-${session.session_id}`}
                    >
                      {session.revision_count} revs
                    </span>

                    {/* Code link — expands the problem card below if available */}
                    {hasWork && workSummary ? (
                      <button
                        type="button"
                        data-testid={`view-code-${session.session_id}`}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                        onClick={() => toggleExpand(workSummary.problem.id)}
                      >
                        View code →
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Per-problem work table (existing content, reskinned) */}
          {workSummaries.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                All Problems
              </div>
              <div className="space-y-2">
                {workSummaries.map((item) => {
                  const hasWork = item.student_work !== null;
                  const isExpanded = expandedIds.has(item.problem.id);
                  const code = item.student_work?.code ?? '';
                  const solved = item.student_work?.last_run_all_passed ?? null;

                  return (
                    <div
                      key={item.problem.id}
                      data-testid={`problem-card-${item.problem.id}`}
                      className={`bg-white rounded-lg shadow border border-gray-200 ${
                        hasWork ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
                      }`}
                      onClick={hasWork ? () => toggleExpand(item.problem.id) : undefined}
                    >
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <span className="font-medium text-gray-900">
                              {item.problem.title}
                            </span>
                            {hasWork ? (
                              solved === true ? (
                                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                                  Solved
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                                  Started
                                </span>
                              )
                            ) : (
                              <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
                                Not started
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-sm text-gray-400">
                            {item.student_work?.last_update && (
                              <span className="text-xs">
                                {formatLastUpdate(item.student_work.last_update)}
                              </span>
                            )}
                            {hasWork && (
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded code view */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                          {code ? (
                            <pre className="bg-gray-50 p-4 rounded overflow-x-auto text-sm font-mono">
                              <code>{code}</code>
                            </pre>
                          ) : (
                            <p className="text-gray-400 text-sm">No code yet</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Summary rail */}
        <div>
          <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Summary
            </div>
            <div
              data-testid="summary-rail"
              className="space-y-2 text-sm text-gray-500"
            >
              <div className="flex justify-between">
                <span>Sessions attended</span>
                <strong
                  className="text-gray-900"
                  data-testid="summary-sessions"
                >
                  {sessionsAttended}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Solved</span>
                <strong
                  className="text-green-700"
                  data-testid="summary-solved"
                >
                  {solvedCount}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Total revisions</span>
                <strong
                  className="text-gray-900 font-mono"
                  data-testid="summary-revisions"
                >
                  {totalRevisions}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
