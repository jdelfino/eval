'use client';

/**
 * PreviewBanner — persistent banner shown during "Preview as Student" mode.
 *
 * Renders a visually distinct amber banner at the top of the page content
 * so instructors always know they are viewing as a student.
 * Hidden when preview mode is not active.
 */

import React from 'react';
import { usePreview } from '@/contexts/PreviewContext';

export function PreviewBanner() {
  const { isPreview, exitPreview } = usePreview();

  if (!isPreview) {
    return null;
  }

  return (
    <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
        <span>You are previewing this section as a student</span>
      </div>
      <button
        onClick={exitPreview}
        className="text-sm font-medium text-amber-800 hover:text-amber-900 underline px-2 py-1 rounded hover:bg-amber-200 transition-colors"
      >
        Exit Preview
      </button>
    </div>
  );
}
