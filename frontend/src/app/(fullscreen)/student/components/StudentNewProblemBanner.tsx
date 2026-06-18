'use client';

import React, { useEffect } from 'react';

interface StudentNewProblemBannerProps {
  /** Title of the new problem the instructor moved on to. */
  toProblemTitle: string;
  /** Title of the problem the student is currently on (shown in the subcopy). */
  fromProblemTitle?: string;
  /** "Jump in" — navigate to the new (pointer's) session. */
  onJumpIn: () => void;
  /** "Stay here" — dismiss the banner and keep working on the current problem. */
  onStayHere: () => void;
}

/**
 * "Instructor moved on" banner (v4 artboards-sessions.jsx StudentNewProblemBanner,
 * mock 09-sess-banner). Shown to a student who is mid-problem in a live session
 * when the section's current-session pointer moves to a different session
 * (driven by `section_current_changed`). Replaces the retired
 * "session ended / replaced" student treatment — sessions are persistent and are
 * never ended/replaced for students.
 *
 * Actions:
 * - "Jump in ⏎": navigate to the new session via getOrCreateStudentWork.
 * - "Stay here": dismiss and keep working; the student's code is auto-saved.
 *
 * Pressing Enter triggers "Jump in" (matches the ⏎ affordance in the mock).
 */
const StudentNewProblemBanner: React.FC<StudentNewProblemBannerProps> = ({
  toProblemTitle,
  fromProblemTitle,
  onJumpIn,
  onStayHere,
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onJumpIn();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onJumpIn]);

  return (
    <div
      role="status"
      data-testid="new-problem-banner"
      className="bg-bg-inverse text-fg-inverse border border-border-inverse"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        margin: '8px 12px',
        padding: '12px 14px',
        flexShrink: 0,
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div
        className="bg-accent text-accent-fg"
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: 14,
          fontWeight: 700,
        }}
        aria-hidden="true"
      >
        ▶
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          Instructor moved on — {toProblemTitle}
        </div>
        <div className="text-fg-inverse-muted" style={{ fontSize: 12 }}>
          A new problem just opened.
          {fromProblemTitle
            ? ` Your current code on ${fromProblemTitle} will be saved.`
            : ' Your current code will be saved.'}
        </div>
      </div>
      <button
        type="button"
        onClick={onStayHere}
        data-testid="stay-here-button"
        className="bg-bg-inverse-raised text-fg-inverse border border-border-inverse"
        style={{
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
        }}
      >
        Stay here
      </button>
      <button
        type="button"
        onClick={onJumpIn}
        data-testid="jump-in-button"
        className="bg-accent text-accent-fg border border-accent"
        style={{
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        Jump in
        <kbd
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            opacity: 0.8,
          }}
        >
          ⏎
        </kbd>
      </button>
    </div>
  );
};

export default StudentNewProblemBanner;
