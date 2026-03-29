'use client';

/**
 * ProblemSetupPanel - Collapsible panel wrapper for SessionProblemEditor.
 * Uses the Panel component from the layout system.
 */

import React from 'react';
import { Panel } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { PanelErrorBoundary } from './PanelError';
import SessionProblemEditor from './SessionProblemEditor';
import { Problem } from '@/types/problem';
import type { Problem as ApiProblem } from '@/types/api';

interface ProblemSetupPanelProps {
  /** Callback when problem is updated (receives complete problem snapshot) */
  onUpdateProblem: (problem: ApiProblem) => void;
  /** Initial problem data */
  initialProblem?: Problem | null;
  /** Whether the panel is loading */
  isLoading?: boolean;
  /** Whether to render in full-width mode (no panel wrapper) */
  isFullWidth?: boolean;
  /** Callback to feature the solution on the public view */
  onFeatureSolution?: () => void;
}

/**
 * ProblemSetupPanel wraps SessionProblemEditor.
 * In panel mode: Uses collapsible Panel component.
 * In full-width mode: Renders editor directly for tab-based layouts.
 */
export function ProblemSetupPanel({
  onUpdateProblem,
  initialProblem,
  isLoading = false,
  isFullWidth = false,
  onFeatureSolution,
}: ProblemSetupPanelProps) {
  // Full-width mode: render editor in a card without panel chrome
  if (isFullWidth) {
    return (
      <PanelErrorBoundary title="Problem Setup">
        <Card variant="default" className="overflow-hidden">
          <SessionProblemEditor
            onUpdateProblem={onUpdateProblem}
            initialProblem={initialProblem}
            onFeatureSolution={onFeatureSolution}
          />
        </Card>
      </PanelErrorBoundary>
    );
  }

  // Panel mode: wrap with padding and current problem indicator
  const content = (
    <div className="space-y-4">
      {/* Show problem title when available */}
      {initialProblem?.title && (
        <div className="text-sm text-gray-600 pb-2 border-b border-gray-100 mb-4">
          <span className="font-medium">Current: </span>
          {initialProblem.title}
        </div>
      )}
      <SessionProblemEditor
        onUpdateProblem={onUpdateProblem}
        initialProblem={initialProblem}
        onFeatureSolution={onFeatureSolution}
      />
    </div>
  );

  // Panel mode: wrap in collapsible panel
  return (
    <PanelErrorBoundary title="Problem Setup">
      <Panel
        id="problem-setup"
        title="Problem Setup"
        icon="FileText"
        isLoading={isLoading}
      >
        {content}
      </Panel>
    </PanelErrorBoundary>
  );
}
