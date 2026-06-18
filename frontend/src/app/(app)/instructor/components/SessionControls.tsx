'use client';

import React, { useCallback, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { clearSectionCurrentSession } from '@/lib/api/sections';
import { openPublicView } from '@/lib/public-view';

interface SessionControlsProps {
  session_id: string;
  /** Section id — target of the "End class" clear-pointer call (T1). */
  sectionId?: string;
  section_name?: string;
  join_code?: string;
  /**
   * Called after "End class" clears the section pointer (for navigation/cleanup
   * on the page). The clear-pointer API call itself happens here, not in the
   * page — the page callback just reacts to a successful end-class.
   */
  onEndSession: () => void;
  onClearPublicView?: () => void;
  problemTitle?: string;
}

export default function SessionControls({
  session_id,
  sectionId,
  section_name,
  join_code,
  onEndSession,
  onClearPublicView,
  problemTitle,
}: SessionControlsProps) {
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleOpenPublicView = () => {
    openPublicView(session_id);
  };

  const handleCopyCode = useCallback(async () => {
    if (!join_code) return;
    try {
      await navigator.clipboard.writeText(join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable; the code stays visible in the badge.
    }
  }, [join_code]);

  const handleConfirmEndClass = useCallback(async () => {
    setShowEndSessionConfirm(false);
    // Under the section-pointer model, "End class" clears the section pointer so
    // late-joiners stop landing on this problem. It does NOT complete/delete the
    // session (those paths are retired with T1).
    if (sectionId) {
      await clearSectionCurrentSession(sectionId);
    }
    onEndSession();
  }, [sectionId, onEndSession]);

  return (
    <div className="bg-white border border-blue-200 rounded-lg shadow-sm px-4 py-2" data-testid="active-session-header">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          {join_code && (
            <button
              onClick={handleCopyCode}
              title="Copy join code"
              data-testid="session-controls-copy-code"
              className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-sm font-mono font-bold rounded-lg hover:bg-blue-200 transition-colors"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <span>Join Code: {join_code}</span>
              <span className="ml-1.5 font-sans text-xs font-medium">{copied ? '✓ Copied' : 'Copy'}</span>
            </button>
          )}
          {problemTitle && (
            <p className="text-base font-semibold text-gray-800">{problemTitle}</p>
          )}
          {section_name && (
            <p className="text-sm text-gray-600">{section_name}</p>
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
            className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-300 rounded-lg hover:bg-red-100 transition-colors"
            data-testid="end-class-button"
          >
            End class
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showEndSessionConfirm}
        title="End class"
        message="End class — students will no longer be pulled into this problem."
        confirmLabel="End class"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmEndClass}
        onCancel={() => setShowEndSessionConfirm(false)}
      />
    </div>
  );
}
