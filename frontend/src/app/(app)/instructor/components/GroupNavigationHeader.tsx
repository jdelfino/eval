'use client';

import React from 'react';
import { AnalysisGroup } from '../hooks/useAnalysisGroups';

interface GroupNavigationHeaderProps {
  groups: AnalysisGroup[];
  activeGroupIndex: number;
  onNavigate: (direction: 'prev' | 'next') => void;
  onDismiss: (groupId: string) => void;
  overallNote?: string | null;
  completionEstimate?: { finished: number; inProgress: number; notStarted: number } | null;
}

export default function GroupNavigationHeader({
  groups,
  activeGroupIndex,
  onNavigate,
  onDismiss,
  overallNote,
  completionEstimate,
}: GroupNavigationHeaderProps) {
  const activeGroup = groups[activeGroupIndex];
  if (!activeGroup) return null;

  const isFirst = activeGroupIndex === 0;
  const isLast = activeGroupIndex === groups.length - 1;
  const isAll = activeGroup.id === 'all';
  const studentCount = activeGroup.studentIds.length;

  return (
    <div>
      <div className="flex items-center">
        <button
          aria-label="Previous group"
          disabled={isFirst}
          onClick={() => onNavigate('prev')}
          className="p-1 rounded text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex-1 text-center min-w-0 flex items-center justify-center gap-1.5 text-sm">
          <span className="font-medium text-gray-900 truncate">{activeGroup.label}</span>
          {!isAll && (
            <span className="text-gray-500 whitespace-nowrap">({studentCount} {studentCount === 1 ? 'student' : 'students'})</span>
          )}
          <span className="text-gray-400">&middot;</span>
          <span className="text-gray-500 whitespace-nowrap">{activeGroupIndex + 1} of {groups.length}</span>
          {!isAll && (
            <button
              aria-label="Dismiss group"
              onClick={() => onDismiss(activeGroup.id)}
              className="p-1 rounded text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <button
          aria-label="Next group"
          disabled={isLast}
          onClick={() => onNavigate('next')}
          className="p-1 rounded text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {isAll && completionEstimate && (
        <p className="mt-2 text-xs text-gray-500 text-center" data-testid="completion-summary">
          {completionEstimate.finished} finished &middot; {completionEstimate.inProgress} in progress &middot; {completionEstimate.notStarted} not started
        </p>
      )}

      {isAll && overallNote && (
        <p className="mt-2 text-xs text-gray-500 text-center italic" data-testid="overall-note">
          {overallNote}
        </p>
      )}
    </div>
  );
}
