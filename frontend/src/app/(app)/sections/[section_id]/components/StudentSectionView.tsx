'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session, PublishedProblemWithStatus } from '@/types/api';
import { getOrCreateStudentWork } from '@/lib/api/student-work';
import { BackButton } from '@/components/ui/BackButton';
import { useSectionEvents } from '@/hooks/useSectionEvents';
import type { SectionDetail } from '../page';

interface StudentSectionViewProps {
  section: SectionDetail;
  activeSessions: Session[];
  publishedProblems: PublishedProblemWithStatus[];
  sectionId: string;
  /**
   * Optional callback for the back button. When provided, the back button
   * renders as a button (not an anchor link) and calls this function on click.
   * Used in preview mode to exit preview before navigating away.
   */
  onBack?: () => void;
}

export default function StudentSectionView({
  section,
  activeSessions: initialActiveSessions,
  publishedProblems,
  sectionId,
  onBack,
}: StudentSectionViewProps) {
  const router = useRouter();

  const { activeSessions } = useSectionEvents({
    sectionId,
    initialActiveSessions,
  });
  const [filter, setFilter] = useState<'all' | 'worked' | 'unstarted'>('all');
  const [error, setError] = useState<string | null>(null);

  const handleProblemClick = async (problemId: string) => {
    try {
      const work = await getOrCreateStudentWork(sectionId, problemId);
      router.push(`/student?work_id=${work.id}`);
    } catch (err) {
      console.error('Error creating student work:', err);
      setError(err instanceof Error ? err.message : 'Failed to start problem');
    }
  };

  const handleActiveSessionJoin = async () => {
    if (activeSessions.length === 0) return;
    const session = activeSessions[0];
    if (!session.problem?.id) return;

    try {
      const work = await getOrCreateStudentWork(sectionId, session.problem.id);
      router.push(`/student?work_id=${work.id}`);
    } catch (err) {
      console.error('Error joining session:', err);
      setError(err instanceof Error ? err.message : 'Failed to join session');
    }
  };

  const formatDate = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  };

  const filteredProblems =
    filter === 'worked'
      ? publishedProblems.filter((p) => p.student_work != null)
      : filter === 'unstarted'
        ? publishedProblems.filter((p) => p.student_work == null)
        : publishedProblems;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="mb-4">
          {onBack ? (
            <BackButton onClick={onBack}>Back to My Sections</BackButton>
          ) : (
            <BackButton href="/sections">Back to My Sections</BackButton>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{section.name}</h1>
              <p className="text-lg text-gray-600 mb-1">{section.className}</p>
              {section.semester && (
                <span className="inline-block text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  {section.semester}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500">
              Enrolled as <span className="font-medium text-gray-700">{section.role}</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      {/* Active Session Banner */}
      {activeSessions.length > 0 && activeSessions[0].problem?.id && (
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <svg className="w-7 h-7 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-1">Class is live!</h2>
                <p className="text-green-50">Your instructor started a session. Join now to participate.</p>
              </div>
            </div>
            <button
              onClick={handleActiveSessionJoin}
              className="px-8 py-4 bg-white text-green-600 text-base font-semibold rounded-lg hover:bg-green-50 transition-colors shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              Join now
            </button>
          </div>
        </div>
      )}

      {/* Published Problems List */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Problems</h2>
          <div className="flex items-center gap-2">
            {(['all', 'worked', 'unstarted'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  filter === value
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {{ all: 'Show all', worked: 'Worked on', unstarted: 'Not started' }[value]}
              </button>
            ))}
          </div>
        </div>

        {filteredProblems.length > 0 ? (
          <div className="space-y-4">
            {filteredProblems.map((problem) => {
              const isLive = activeSessions.some((s) => s.problem?.id === problem.problem.id);
              return (
                <div
                  key={problem.problem.id}
                  className={`bg-white rounded-lg shadow hover:shadow-md transition-shadow border ${
                    isLive ? 'border-green-200' : 'border-gray-200'
                  }`}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xl font-semibold text-gray-900">{problem.problem.title}</h3>
                          {isLive && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full animate-pulse">
                              Live
                            </span>
                          )}
                        </div>
                        {problem.problem.description && (
                          <p className="text-gray-600 mb-3 line-clamp-2">{problem.problem.description}</p>
                        )}
                        <div className="flex items-center gap-3 mb-3">
                          {(problem.problem.tags || []).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="text-sm text-gray-500">
                          {problem.student_work?.id ? (
                            <span>Last worked: {formatTimeAgo(problem.student_work?.last_update!)}</span>
                          ) : (
                            <span>Not started</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 ml-4">
                        <button
                          onClick={() => handleProblemClick(problem.problem.id)}
                          className="px-6 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow hover:shadow-md"
                        >
                          {problem.student_work?.id ? 'Continue' : 'Practice'}
                        </button>
                        {problem.show_solution && (
                          <button className="px-6 py-3 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
                            View Solution
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-600">
              {filter === 'worked'
                ? 'No problems worked on yet'
                : filter === 'unstarted'
                  ? 'All problems have been started'
                  : 'No problems published yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
