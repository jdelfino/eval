'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface SessionControlsProps {
  session_id: string;
  section_name?: string;
  join_code?: string;
  connectedStudentCount?: number;
  onEndSession: () => void;
  onClearPublicView?: () => void;
  featured_student_id?: string | null;
  problemSolution?: string | null;
  onShowSolution?: () => void;
  problemTitle?: string;
}

export default function SessionControls({
  session_id,
  section_name,
  join_code,
  connectedStudentCount = 0,
  onEndSession,
  onClearPublicView,
  featured_student_id,
  problemSolution,
  onShowSolution,
  problemTitle,
}: SessionControlsProps) {
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [showSolutionViewer, setShowSolutionViewer] = useState(false);

  const handleCloseSolutionViewer = useCallback(() => {
    setShowSolutionViewer(false);
  }, []);

  useEffect(() => {
    if (!showSolutionViewer) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseSolutionViewer();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSolutionViewer, handleCloseSolutionViewer]);

  const handleOpenPublicView = () => {
    const publicViewUrl = `/public-view?session_id=${session_id}`;
    window.open(publicViewUrl, '_blank', 'width=1200,height=800');
  };

  return (
    <div className="bg-white border border-blue-200 rounded-lg shadow-sm p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Active Session</h2>
          {problemTitle && (
            <p className="text-base font-semibold text-gray-800">{problemTitle}</p>
          )}
          {section_name && (
            <p className="text-sm text-gray-600">{section_name}</p>
          )}
          {join_code && (
            <div className="mt-2 inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-sm font-mono font-bold rounded-lg">
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Join Code: {join_code}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleOpenPublicView}
            className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-lg hover:bg-blue-100 transition-colors"
            title="Open public view in a new window to display student code to the class"
          >
            Open Public View
          </button>
          {problemSolution && onShowSolution && (
            <>
              <button
                onClick={() => setShowSolutionViewer(true)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                data-testid="view-solution-button"
                title="View the solution privately"
              >
                <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Solution
              </button>
              <button
                onClick={onShowSolution}
                className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100 transition-colors"
                data-testid="show-solution-button"
                title="Show the solution on the public view"
              >
                Show Solution
              </button>
            </>
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

      {showSolutionViewer && problemSolution && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          data-testid="solution-viewer-modal"
        >
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Solution</h3>
              <button
                onClick={handleCloseSolutionViewer}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
            <div className="px-6 py-4 overflow-auto">
              <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                {problemSolution}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
