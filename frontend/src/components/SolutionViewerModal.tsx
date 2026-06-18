'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Tabs } from '@/components/ui/Tabs';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { getRevisions } from '@/lib/api/sessions';
import { lineDiff } from '@/lib/diff';

export type SolutionViewerVariant = 'instructor' | 'student';

export interface SolutionViewerModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Called on close (Escape, backdrop, close button, footer dismiss). */
  onClose: () => void;
  /** Problem title, shown in the Modal heading. */
  problemTitle: string;
  /** Reference solution source shown on the code tab. */
  solution: string;
  /**
   * Which call site this serves. The student variant shows an info banner and a
   * "Back to my code" footer action; the instructor variant is a private viewer.
   */
  variant: SolutionViewerVariant;
  /** Session id for the diff source. When absent, the diff tab falls back. */
  sessionId?: string;
  /**
   * User id whose last revision the diff compares against. For instructor this is
   * the focused student; for student callers it may be omitted so the backend
   * infers the caller. When `sessionId` is absent the diff falls back regardless.
   */
  userId?: string;
  /**
   * Optional banner copy for the student variant. Defaults to the no-attempts
   * copy ("You solved this …"). Never include attempt counts (DEC: no attempts).
   */
  bannerText?: string;
}

type DiffState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; diff: string }
  | { status: 'empty' };

const FALLBACK = 'No prior revision to compare';

/**
 * SolutionViewerModal — consolidated reference-solution viewer (G7-T5).
 *
 * One component, built on the Modal + Tabs primitives, replacing the two former
 * inline modals (instructor `solution-viewer-modal` in SessionProblemEditor and
 * the student `SolutionModal` in StudentSectionView). Two tabs only — the
 * reference solution code and a unified diff of the viewer's last revision vs.
 * the solution (DEC-10: no Notes tab). The diff source is fetched lazily via
 * getRevisions; when no session/user context is available, the fetch errors, or
 * there are no revisions, the diff tab degrades to "No prior revision to
 * compare" rather than erroring (the explicitly required graceful path).
 */
export function SolutionViewerModal({
  open,
  onClose,
  problemTitle,
  solution,
  variant,
  sessionId,
  userId,
  bannerText,
}: SolutionViewerModalProps): React.ReactElement | null {
  const [activeTab, setActiveTab] = useState<'code' | 'diff'>('code');
  const [diffState, setDiffState] = useState<DiffState>({ status: 'idle' });

  // Reset to the code tab each time the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setActiveTab('code');
    }
  }, [open]);

  // Fetch the viewer's last revision lazily once the modal is open and we have a
  // session to query. No session context → graceful empty state, no fetch.
  useEffect(() => {
    if (!open) return;
    if (!sessionId) {
      setDiffState({ status: 'empty' });
      return;
    }

    let cancelled = false;
    setDiffState({ status: 'loading' });

    getRevisions(sessionId, userId)
      .then((revisions) => {
        if (cancelled) return;
        const last = revisions.length > 0 ? revisions[revisions.length - 1] : null;
        if (!last || !last.full_code) {
          setDiffState({ status: 'empty' });
          return;
        }
        setDiffState({ status: 'ready', diff: lineDiff(last.full_code, solution) });
      })
      .catch(() => {
        if (!cancelled) setDiffState({ status: 'empty' });
      });

    return () => {
      cancelled = true;
    };
  }, [open, sessionId, userId, solution]);

  const handleCopy = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(solution);
    }
  }, [solution]);

  if (!open) {
    return null;
  }

  const footer =
    variant === 'student' ? (
      <>
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          Copy
        </Button>
        <span style={{ flex: 1 }} />
        <Button variant="quiet" size="sm" onClick={onClose}>
          Back to my code
        </Button>
        <Button variant="accent" size="sm" onClick={onClose}>
          Got it
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          Copy
        </Button>
        <span style={{ flex: 1 }} />
        <Button variant="accent" size="sm" onClick={onClose}>
          Done
        </Button>
      </>
    );

  return (
    <Modal
      open={open}
      tone="info"
      title={`Reference solution · ${problemTitle}`}
      width={680}
      onClose={onClose}
      footer={footer}
      contentTestId="solution-viewer-modal"
    >
      {variant === 'student' && (
        <Banner
          tone="info"
          icon="info"
          title={bannerText ?? 'You solved this'}
          body="Read it like a worked example, not a model answer."
          style={{ marginBottom: 14 }}
        />
      )}

      <Tabs activeTab={activeTab} onTabChange={(id) => setActiveTab(id as 'code' | 'diff')}>
        <Tabs.List>
          <Tabs.Tab tabId="code">solution.py</Tabs.Tab>
          <Tabs.Tab tabId="diff">vs. last revision</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel tabId="code">
          <CodeBlock aria-label="reference solution">{solution}</CodeBlock>
        </Tabs.Panel>

        <Tabs.Panel tabId="diff">
          {diffState.status === 'ready' ? (
            <CodeBlock aria-label="diff vs last revision">{diffState.diff}</CodeBlock>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '8px 0' }}>
              {diffState.status === 'loading' ? 'Loading…' : FALLBACK}
            </div>
          )}
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

export default SolutionViewerModal;
