'use client';

/**
 * Library Tag Bar Component
 *
 * Displays tag chips with counts for multi-select AND-logic filtering
 * in the problem library. Shows a "clear" affordance when any tag is selected.
 */

import React from 'react';
import { Chip } from '@/components/ui/Chip';
import { SectionLabel } from '@/components/ui/SectionLabel';

interface LibraryTagBarProps {
  /** Map of tag name -> count of problems carrying that tag */
  tagCounts: Map<string, number>;
  /** Set of currently selected (active) tags */
  selectedTags: Set<string>;
  /** Called when a tag chip is toggled */
  onToggle: (tag: string) => void;
  /** Called when the clear button is clicked */
  onClear: () => void;
}

export default function LibraryTagBar({
  tagCounts,
  selectedTags,
  onToggle,
  onClear,
}: LibraryTagBarProps) {
  const tags = Array.from(tagCounts.entries()).sort(([a], [b]) => a.localeCompare(b));

  if (tags.length === 0) return null;

  return (
    <div
      data-testid="tag-bar"
      className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap gap-2 items-center"
    >
      <SectionLabel style={{ marginRight: 4 }}>
        Tags
      </SectionLabel>
      {tags.map(([tag, count]) => (
        <Chip
          key={tag}
          data-testid={`tag-chip-${tag}`}
          active={selectedTags.has(tag)}
          count={count}
          onClick={() => onToggle(tag)}
        >
          #{tag}
        </Chip>
      ))}
      {selectedTags.size > 0 && (
        <button
          data-testid="tag-bar-clear"
          onClick={onClear}
          className="ml-1 text-xs text-gray-500 hover:text-gray-700 bg-transparent border-none cursor-pointer underline"
        >
          clear
        </button>
      )}
    </div>
  );
}
