'use client';

import React, { useState, useCallback } from 'react';

interface SessionEndedNotificationProps {
  onLeaveToDashboard: () => void;
  code?: string;
  codeSaved?: boolean;
  replacementSessionId?: string;
  onJoinNewSession?: () => void;
}

const SessionEndedNotification: React.FC<SessionEndedNotificationProps> = ({
  onLeaveToDashboard,
  code = '',
  codeSaved = true,
  replacementSessionId,
  onJoinNewSession,
}) => {
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyCode = useCallback(async () => {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (_err) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = code;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (fallbackErr) {
        console.error('Failed to copy code:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  }, [code]);

  return (
    <div
      className="bg-amber-50 border border-amber-300 px-4 py-3 rounded-md flex-shrink-0"
      data-testid="session-ended-notification"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Left: icon + message */}
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-amber-600 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium text-amber-800">
            {replacementSessionId
              ? 'The instructor started a new problem.'
              : <>Session ended — code execution is disabled.{codeSaved && ' Your code has been saved.'}</>
            }
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2">
          {replacementSessionId && onJoinNewSession && (
            <button
              type="button"
              onClick={onJoinNewSession}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              data-testid="join-new-session-button"
            >
              Join New Session
            </button>
          )}
          {code && (
            <button
              type="button"
              onClick={handleCopyCode}
              className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                copySuccess
                  ? 'text-success-700 bg-success-100'
                  : 'text-amber-700 bg-amber-100 hover:bg-amber-200'
              }`}
              data-testid="copy-code-button"
            >
              {copySuccess ? (
                <>
                  <svg className="h-3.5 w-3.5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                    <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                  </svg>
                  Copy Code
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onLeaveToDashboard}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors"
            data-testid="go-to-dashboard-button"
          >
            Back to Sections
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionEndedNotification;