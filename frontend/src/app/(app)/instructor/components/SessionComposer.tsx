'use client';

/**
 * SessionComposer
 *
 * Shared body for both session-launch modals (CreateSessionFromProblemModal and
 * StartSessionModal) and the instructor private problem view (T4). Renders, per
 * `docs/design/handoff/v4/artboards-sessions.jsx:429-513`:
 *
 * - A list of section radio rows: "class · section" label, "N students" sub-line
 *   (degraded to no count when the host can't supply one), and a live Pill ("now")
 *   when that section currently has a pointed-at session.
 * - ONE checkbox: "Make this the current problem for the class" (default checked).
 *   Checked maps to `set_current` on the create call; the resulting
 *   `section_current_changed` event IS the student "moved on" banner — there is no
 *   separate notify toggle.
 * - A footer: Cancel (ghost) + "Start session" (accent), with Start disabled until a
 *   section is picked (or while `starting`).
 *
 * Under the section-pointer model (T1) there is NO "End any session already running"
 * checkbox, NO `replace_existing`, and NO 409/conflict flow — `error` only ever carries
 * a generic submit failure.
 *
 * The host owns publish / show-solution UI (via `useProblemPublishState`) and passes it
 * through `optionsSlot`; SessionComposer does not know about publishing.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';

export interface ComposerSection {
  id: string;
  /** Display label, typically "Class · Section". */
  label: string;
  /** Student count, or undefined when the host can't supply one (degraded line). */
  studentCount?: number;
  /** True when this section currently has a pointed-at (live) session. */
  hasCurrentSession: boolean;
}

export interface SessionComposerProps {
  sections: ComposerSection[];
  selectedSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  /** When true (StartSessionModal), the single preselected row is shown but not changeable. */
  sectionLocked?: boolean;
  /** Publish / show-solution UI supplied by the host. */
  optionsSlot?: React.ReactNode;
  onStart: (opts: { setCurrent: boolean }) => void;
  onCancel: () => void;
  starting: boolean;
  error?: string | null;
  /**
   * Extra host precondition that must also hold before Start is enabled (e.g. a problem
   * must be picked in StartSessionModal). The section-selected + not-starting gate still
   * applies on top of this.
   */
  startDisabled?: boolean;
  /** Optional content rendered above the section list (e.g. problem picker). */
  children?: React.ReactNode;
}

export default function SessionComposer({
  sections,
  selectedSectionId,
  onSelectSection,
  sectionLocked = false,
  optionsSlot,
  onStart,
  onCancel,
  starting,
  error,
  startDisabled = false,
  children,
}: SessionComposerProps) {
  // "Make this the current problem for the class" — default on, maps to set_current.
  const [makeCurrent, setMakeCurrent] = useState(true);

  const canStart = !!selectedSectionId && !starting && !startDisabled;

  return (
    <div className="space-y-4">
      {children}

      {/* Section rows */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          {sectionLocked ? 'Section' : 'Class'}
        </div>
        {sections.length === 0 ? (
          <div className="text-sm text-gray-500">No sections available.</div>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="Select section">
            {sections.map((section) => {
              const selected = section.id === selectedSectionId;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    if (!sectionLocked) onSelectSection(section.id);
                  }}
                  disabled={starting || sectionLocked}
                  className={`w-full flex items-center gap-3 text-left p-3 rounded-lg border-2 transition-colors ${
                    selected ? 'border-accent bg-accent-soft' : 'border-gray-200 hover:border-gray-300'
                  } ${starting ? 'opacity-50 cursor-not-allowed' : ''} ${
                    sectionLocked ? 'cursor-default' : ''
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-4 h-4 rounded-full flex-shrink-0 border-2 ${
                      selected ? 'border-accent bg-accent' : 'border-gray-300 bg-white'
                    }`}
                  />
                  <span className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-900 truncate">{section.label}</span>
                    {section.studentCount !== undefined && (
                      <span className="text-xs text-gray-500">{section.studentCount} students</span>
                    )}
                  </span>
                  {section.hasCurrentSession && (
                    <Pill tone="ok" dot>
                      now
                    </Pill>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Host-provided publish / show-solution options */}
      {optionsSlot}

      {/* The single pointer checkbox */}
      <div>
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={makeCurrent}
            onChange={(e) => setMakeCurrent(e.target.checked)}
            aria-label="Make this the current problem for the class"
            className="rounded"
            disabled={starting}
          />
          <span>Make this the current problem for the class</span>
        </label>
      </div>

      {/* Inline submit error (generic failures only) */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
          {error}
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={onCancel}
          disabled={starting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="accent"
          className="flex-1"
          onClick={() => onStart({ setCurrent: makeCurrent })}
          disabled={!canStart}
          loading={starting}
        >
          Start session
        </Button>
      </div>
    </div>
  );
}
