'use client';

/**
 * Start Session Modal
 *
 * Modal that allows instructors to start a new session for a fixed section. Provides a
 * problem picker (or "Create blank session"). The section is fixed via the section_id prop
 * and rendered as a single locked row in the shared SessionComposer.
 *
 * Internals are powered by SessionComposer (the locked section row + the single
 * "Make this the current problem for the class" pointer checkbox + footer). The publish /
 * show-solution UI is supplied via the shared useProblemPublishState hook as the composer's
 * optionsSlot. The modal shell, testids (modal-backdrop / modal-content), and aria-labels
 * (Publish to section / Show solution to students) are preserved (G7 reskins the shell).
 *
 * Under the section-pointer model there is no 409/conflict flow — only generic submit
 * errors render inline.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { listProblems } from '@/lib/api/problems';
import { createSession } from '@/lib/api/sessions';
import { Modal } from '@/components/ui/Modal';
import SessionComposer, { ComposerSection } from './SessionComposer';
import { useProblemPublishState } from '../hooks/useProblemPublishState';
import { PublishOptions } from '../hooks/PublishOptions';

interface ProblemInfo {
  id: string;
  title: string;
  authorName?: string;
}

interface StartSessionModalProps {
  section_id: string;
  section_name: string;
  onClose: () => void;
  onSessionCreated: (session_id: string) => void;
}

type SelectionType = 'blank' | string; // 'blank' or problem ID

export default function StartSessionModal({
  section_id,
  section_name,
  onClose,
  onSessionCreated,
}: StartSessionModalProps) {
  const router = useRouter();
  const [problems, setProblems] = useState<ProblemInfo[]>([]);
  const [selectedOption, setSelectedOption] = useState<SelectionType | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProblems, setLoadingProblems] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedProblemId = selectedOption && selectedOption !== 'blank' ? selectedOption : null;
  const publish = useProblemPublishState(selectedProblemId, section_id);

  useEffect(() => {
    loadProblems();
  }, []);

  const loadProblems = async () => {
    try {
      setLoadingProblems(true);
      const problems = await listProblems();
      setProblems(problems);
      setError(null);
    } catch (err) {
      console.error('Error loading problems:', err);
      setError(err instanceof Error ? err.message : 'Failed to load problems');
    } finally {
      setLoadingProblems(false);
    }
  };

  const handleStart = async ({ setCurrent }: { setCurrent: boolean }) => {
    if (!selectedOption) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const problemId = selectedOption !== 'blank' ? selectedOption : undefined;
      const session = await createSession(
        section_id,
        problemId,
        publish.showSolutionArg,
        { setCurrent }
      );
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

  const composerSections: ComposerSection[] = [
    { id: section_id, label: section_name, hasCurrentSession: false },
  ];

  const publishUi = <PublishOptions publish={publish} active={!!selectedProblemId} />;

  return (
    <Modal
      open
      title="Start a session"
      sub={`Section: ${section_name}`}
      width={560}
      onClose={handleClose}
      backdropTestId="modal-backdrop"
      contentTestId="modal-content"
    >
      <SessionComposer
        sections={composerSections}
        selectedSectionId={section_id}
        onSelectSection={() => {}}
        sectionLocked
        optionsSlot={publishUi}
        onStart={handleStart}
        onCancel={handleClose}
        starting={loading}
        error={error}
        startDisabled={!selectedOption}
      >
        {/* Problem picker (host content above the section row) */}
        <div className="space-y-4">
              {/* Blank Session Option */}
              <button
                type="button"
                onClick={() => setSelectedOption('blank')}
                disabled={loading}
                className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                  selectedOption === 'blank'
                    ? 'border-accent bg-accent-soft'
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
                            ? 'border-accent bg-accent-soft'
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
      </SessionComposer>
    </Modal>
  );
}
