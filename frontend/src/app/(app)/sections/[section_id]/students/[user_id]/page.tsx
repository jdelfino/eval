'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { listStudentWorkForReview, listStudentProgress } from '@/lib/api';
import type { StudentWorkSummary, StudentProgress } from '@/types/api';
import { BackButton } from '@/components/ui/BackButton';

export default function StudentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const section_id = params.section_id as string;
  const user_id = params.user_id as string;

  const { user } = useAuth();

  const [workSummaries, setWorkSummaries] = useState<StudentWorkSummary[]>([]);
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

      const [work, progress] = await Promise.all([
        listStudentWorkForReview(section_id, user_id),
        listStudentProgress(section_id),
      ]);

      setWorkSummaries(work);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
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
  const problemsStarted = student?.problems_started ?? 0;
  const totalProblems = student?.total_problems ?? workSummaries.length;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <BackButton href={`/sections/${section_id}`}>Back to Section</BackButton>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{studentName}</h1>
        {student?.email && student.display_name && (
          <p className="text-gray-500 mb-3">{student.email}</p>
        )}
        <p className="text-gray-600">
          {problemsStarted} / {totalProblems} problems started
        </p>
      </div>

      {/* Problem list */}
      <div className="space-y-3">
        {workSummaries.map((item) => {
          const hasWork = item.student_work !== null;
          const isExpanded = expandedIds.has(item.problem.id);
          const code = item.student_work?.code ?? '';

          return (
            <div
              key={item.problem.id}
              data-testid={`problem-card-${item.problem.id}`}
              className={`bg-white rounded-lg shadow border border-gray-200 ${hasWork ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
              onClick={hasWork ? () => toggleExpand(item.problem.id) : undefined}
            >
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{item.problem.title}</h3>
                    {hasWork ? (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                        Started
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
                        Not started
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    {item.student_work?.last_update && (
                      <span>{formatDate(item.student_work.last_update)}</span>
                    )}
                    {hasWork && (
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
                <div className="border-t border-gray-100 px-5 pb-5 pt-4">
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

        {workSummaries.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No problems published to this section yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
