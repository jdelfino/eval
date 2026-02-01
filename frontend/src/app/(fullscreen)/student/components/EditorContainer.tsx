/**
 * EditorContainer - Enforces correct wrapper pattern for CodeEditor
 *
 * This component prevents the recurring bug where CodeEditor's activity bar
 * background doesn't extend properly due to incorrect parent styling.
 *
 * ALWAYS use this component when embedding CodeEditor in a page.
 *
 * Problem: CodeEditor requires specific parent container styling to work correctly.
 * Developers have repeatedly added conflicting classes (border, rounded, overflow-hidden)
 * or mixed flex and fixed height properties, breaking the layout.
 *
 * Solution: This wrapper enforces the correct pattern and provides named variants
 * for common use cases.
 *
 * @example
 * // For a fixed-height editor (most common)
 * <EditorContainer height="500px">
 *   <CodeEditor {...props} />
 * </EditorContainer>
 *
 * @example
 * // For a flex-based editor (fills parent)
 * <EditorContainer variant="flex">
 *   <CodeEditor {...props} />
 * </EditorContainer>
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface EditorContainerProps {
  children: React.ReactNode;
  /** Height for fixed-height variant (e.g., "500px", "600px") */
  height?: string;
  /** Layout variant: "fixed" (default) or "flex" */
  variant?: 'fixed' | 'flex';
  /** Optional additional CSS classes */
  className?: string;
}

export function EditorContainer({
  children,
  height = '500px',
  variant = 'fixed',
  className,
}: EditorContainerProps) {
  // For fixed variant, we need dynamic height so we use style for that specific property
  // For flex variant, we can use Tailwind classes entirely
  if (variant === 'flex') {
    return (
      <div className={cn('flex-1 min-h-0 flex flex-col', className)}>
        {children}
      </div>
    );
  }

  // Fixed variant - need style for dynamic height
  return (
    <div className={className} style={{ height }}>
      {children}
    </div>
  );
}

/**
 * DO NOT wrap CodeEditor like this:
 * ❌ <div className="border rounded-lg overflow-hidden" style={{ height: '500px' }}>
 * ❌ <div style={{ flex: 1, height: '500px' }}>  (conflicting properties)
 * ❌ <div style={{ maxHeight: '500px' }}>  (should be fixed height)
 *
 * ALWAYS use EditorContainer instead:
 * ✅ <EditorContainer height="500px">
 * ✅ <EditorContainer variant="flex">
 */
