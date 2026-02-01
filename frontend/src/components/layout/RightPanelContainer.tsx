'use client';

/**
 * Container for right-side contextual panels.
 * Width: 320px (w-80)
 */

import { ReactNode } from 'react';

interface RightPanelContainerProps {
  /** Panel components to render */
  children: ReactNode;
}

export function RightPanelContainer({ children }: RightPanelContainerProps) {
  return (
    <aside
      className="w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto flex-shrink-0"
      aria-label="Contextual panels"
    >
      <div className="p-4 space-y-4">
        {children}
      </div>
    </aside>
  );
}
