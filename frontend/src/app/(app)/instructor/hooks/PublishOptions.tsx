'use client';

/**
 * PublishOptions
 *
 * Shared publish / show-solution options block for the session-launch modals
 * (StartSessionModal and CreateSessionFromProblemModal). Both modals render the
 * identical UI driven by {@link useProblemPublishState}: once the published-
 * sections lookup has loaded, it shows either the "Publish to section" +
 * "Show solution to students" controls (when not yet published) or an
 * "Already published to this section" notice (when published). It renders
 * nothing until the lookup has loaded.
 *
 * Colocated with the hook so the publish UI + state live together.
 */

import React from 'react';
import type { ProblemPublishState } from './useProblemPublishState';

export interface PublishOptionsProps {
  publish: ProblemPublishState;
  /**
   * Whether a (problem, section) pair is selected. The block renders nothing
   * until both a target is selected AND the published-sections lookup has loaded.
   */
  active: boolean;
}

export function PublishOptions({ publish, active }: PublishOptionsProps): React.ReactElement | null {
  if (!active || !publish.loaded) return null;

  if (publish.isPublished) {
    return (
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
        Already published to this section
      </div>
    );
  }

  return (
    <div className="p-3 bg-info-soft border border-info rounded-lg space-y-2">
      <label className="flex items-center gap-2 text-sm text-info">
        <input
          type="checkbox"
          checked={true}
          disabled={true}
          aria-label="Publish to section"
          className="rounded"
          readOnly
        />
        <span>Publish to section</span>
      </label>
      <label className="flex items-center gap-2 text-sm text-info ml-5">
        <input
          type="checkbox"
          checked={publish.showSolution}
          onChange={(e) => publish.setShowSolution(e.target.checked)}
          aria-label="Show solution to students"
          className="rounded"
        />
        <span>Show solution to students</span>
      </label>
    </div>
  );
}

export default PublishOptions;
