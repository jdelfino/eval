'use client';

/**
 * Start Session Modal
 *
 * Modal that allows instructors to start a new session for a section.
 * Provides option to select a problem from the library or create a blank session.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ProblemInfo {
  id: string;
  title: string;
  authorName?: string;
}

interface StartSessionModalProps {
  sectionId: string;
  sectionName: string;
  onClose: () => void;
  onSessionCreated: (sessionId: string) => void;
}

type SelectionType = 'blank' | string; // 'blank' or problem ID

export default function StartSessionModal({
  sectionId,
  sectionName,
  onClose,
  onSessionCreated,
}: StartSessionModalProps) {
  const router = useRouter();
  const [problems, setProblems] = useState<ProblemInfo[]>([]);
  const [selectedOption, setSelectedOption] = useState<SelectionType | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProblems, setLoadingProblems] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProblems();
  }, []);

  const loadProblems = async () => {
    try {
      setLoadingProblems(true);
      const response = await fetch('/api/problems');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load problems');
      }
      const data = await response.json();
      setProblems(data.problems || []);
      setError(null);
    } catch (err) {
      console.error('Error loading problems:', err);
      setError(err instanceof Error ? err.message : 'Failed to load problems');
    } finally {
      setLoadingProblems(false);
    }
  };

  const handleStartSession = async () => {
    if (!selectedOption) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const body: { sectionId: string; problemId?: string } = { sectionId };
      if (selectedOption !== 'blank') {
        body.problemId = selectedOption;
      }

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create session');
      }

      const { session } = await response.json();
      onSessionCreated(session.id);
      router.push(`/instructor/session/${session.id}`);
    } catch (err) {
      console.error('Error creating session:', err);
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
      data-testid="modal-backdrop"
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-content"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Start Session</h2>
            <p className="text-sm text-gray-600 mt-1">
              Section: <span className="font-medium">{sectionName}</span>
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Blank Session Option */}
          <div>
            <button
              type="button"
              onClick={() => setSelectedOption('blank')}
              disabled={loading}
              className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                selectedOption === 'blank'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Create blank session</p>
                  <p className="text-sm text-gray-500">Start with an empty code editor</p>
                </div>
              </div>
            </button>
          </div>

          {/* Problems List */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Or select a problem:</h3>
            {loadingProblems ? (
              <div className="text-sm text-gray-500 py-4 text-center">Loading problems...</div>
            ) : problems.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center">
                No problems available. You can still create a blank session.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {problems.map((problem) => (
                  <button
                    key={problem.id}
                    type="button"
                    onClick={() => setSelectedOption(problem.id)}
                    disabled={loading}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      selectedOption === problem.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <p className="font-medium text-gray-900">{problem.title}</p>
                    {problem.authorName && (
                      <p className="text-xs text-gray-500">by {problem.authorName}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6 pt-4 border-t">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStartSession}
            disabled={loading || !selectedOption}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Creating...
              </>
            ) : (
              'Start Session'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
