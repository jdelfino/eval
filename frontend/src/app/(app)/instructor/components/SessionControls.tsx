'use client';

import React, { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface SessionControlsProps {
  sessionId: string;
  sectionName?: string;
  joinCode?: string;
  connectedStudentCount?: number;
  onEndSession: () => void;
  onClearPublicView?: () => void;
  featuredStudentId?: string | null;
  problemSolution?: string;
  onShowSolution?: () => void;
}

export default function SessionControls({
  sessionId,
  sectionName,
  joinCode,
  connectedStudentCount = 0,
  onEndSession,
  onClearPublicView,
  featuredStudentId,
  problemSolution,
  onShowSolution,
}: SessionControlsProps) {
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);

  const handleOpenPublicView = () => {
    const publicViewUrl = `/public-view?sessionId=${sessionId}`;
    window.open(publicViewUrl, '_blank', 'width=1200,height=800');
  };

  return (
    <div className="bg-white border border-blue-200 rounded-lg shadow-sm p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Active Session</h2>
          {sectionName && (
            <p className="text-sm text-gray-600">{sectionName}</p>
          )}
          {joinCode && (
            <div className="mt-2 inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-sm font-mono font-bold rounded-lg">
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Join Code: {joinCode}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleOpenPublicView}
            className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-lg hover:bg-blue-100 transition-colors"
            title="Open public view in a new window to display student code to the class"
          >
            Open Public View
          </button>
          {problemSolution && onShowSolution && (
            <button
              onClick={onShowSolution}
              className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100 transition-colors"
              data-testid="show-solution-button"
              title="Show the solution on the public view"
            >
              Show Solution
            </button>
          )}
          {onClearPublicView && (
            <button
              onClick={onClearPublicView}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-300 rounded-lg hover:bg-red-100 transition-colors"
              title="Clear the public view display"
              data-testid="clear-public-view-button"
            >
              Clear Public View
            </button>
          )}
          <button
            onClick={() => setShowEndSessionConfirm(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            End Session
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showEndSessionConfirm}
        title="End Session"
        message={
          connectedStudentCount > 0
            ? `${connectedStudentCount} student${connectedStudentCount === 1 ? ' is' : 's are'} currently connected. Ending this session will disconnect all students. This action cannot be undone.`
            : 'Are you sure you want to end this session? This action cannot be undone.'
        }
        confirmLabel="End Session"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          setShowEndSessionConfirm(false);
          onEndSession();
        }}
        onCancel={() => setShowEndSessionConfirm(false)}
      />
    </div>
  );
}
