'use client';

/**
 * Generic collapsible panel component.
 * Uses PanelContext for state management and persistence.
 */

import React, { ReactNode } from 'react';
import { usePanelState } from '@/contexts/PanelContext';
import { PanelToggle } from './PanelToggle';
import { getIconComponent } from './iconMap';

interface PanelProps {
  /** Unique identifier used for PanelContext state */
  id: string;
  /** Panel title displayed in header */
  title: string;
  /** Lucide icon name */
  icon?: string;
  /** Panel content */
  children: ReactNode;
  /** Show loading spinner instead of content */
  isLoading?: boolean;
}

export function Panel({
  id,
  title,
  icon,
  children,
  isLoading = false,
}: PanelProps) {
  const { isPanelExpanded, togglePanel } = usePanelState();
  const isExpanded = isPanelExpanded(id);

  const IconComponent = icon ? getIconComponent(icon) : null;

  const handleToggle = () => {
    togglePanel(id);
  };

  return (
    <div
      className="border border-gray-200 rounded-lg bg-white overflow-hidden"
      data-testid={`panel-${id}`}
    >
      {/* Panel Header - always visible */}
      <div
        className="h-10 px-3 flex items-center justify-between border-b border-gray-200 bg-gray-50 cursor-pointer"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        aria-expanded={isExpanded}
        aria-controls={`panel-content-${id}`}
      >
        <div className="flex items-center gap-2">
          {IconComponent && (
            <IconComponent className="h-4 w-4 text-gray-500" aria-hidden="true" />
          )}
          <span className="text-sm font-medium text-gray-700">{title}</span>
        </div>
        <PanelToggle
          isExpanded={isExpanded}
          onToggle={() => handleToggle()}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${title}`}
        />
      </div>

      {/* Panel Content - animated collapse */}
      <div
        id={`panel-content-${id}`}
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        aria-hidden={!isExpanded}
      >
        <div className="p-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
