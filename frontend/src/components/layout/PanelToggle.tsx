'use client';

/**
 * Toggle button for collapsing/expanding panels.
 * Shows ChevronDown when expanded, ChevronRight when collapsed.
 */

import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface PanelToggleProps {
  /** Whether the panel is currently expanded */
  isExpanded: boolean;
  /** Callback when toggle is clicked */
  onToggle: (e?: React.MouseEvent) => void;
  /** Accessible label for the button */
  'aria-label'?: string;
}

export function PanelToggle({
  isExpanded,
  onToggle,
  'aria-label': ariaLabel = 'Toggle panel',
}: PanelToggleProps) {
  const Icon = isExpanded ? ChevronDown : ChevronRight;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e);
      }}
      aria-expanded={isExpanded}
      aria-label={ariaLabel}
      className="p-1 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
    >
      <Icon className="h-4 w-4 text-gray-500" />
    </button>
  );
}
