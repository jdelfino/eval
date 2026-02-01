'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getLastUsedSection } from '@/lib/last-used-section';
import { apiFetch } from '@/lib/api-client';

interface Section {
  id: string;
  name: string;
}

interface CopyLinkDropdownProps {
  problem_id: string;
  class_id: string;
}

export function CopyLinkDropdown({ problem_id, class_id }: CopyLinkDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const showCopiedFeedback = useCallback(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const copyGenericLink = useCallback(async () => {
    try {
      const url = `${window.location.origin}/problems/${problem_id}`;
      await navigator.clipboard.writeText(url);
      showCopiedFeedback();
    } catch {
      // Clipboard API not available — ignore silently
    }
  }, [problem_id, showCopiedFeedback]);

  const copySectionLink = useCallback(async (section_id: string) => {
    try {
      const url = `${window.location.origin}/problems/${problem_id}?start=true&section_id=${section_id}`;
      await navigator.clipboard.writeText(url);
      showCopiedFeedback();
    } catch {
      // Clipboard API not available — ignore silently
    }
    setIsOpen(false);
  }, [problem_id, showCopiedFeedback]);

  const openDropdown = useCallback(async () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    if (sections === null) {
      setLoading(true);
      setFetchError(false);
      try {
        const res = await apiFetch(`/classes/${class_id}/sections`);
        const data = await res.json();
        setSections(data.sections ?? []);
      } catch {
        setFetchError(true);
      } finally {
        setLoading(false);
      }
    }
  }, [isOpen, sections, class_id]);

  // Click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const sortedSections = (() => {
    if (!sections) return [];
    const lastUsed = getLastUsedSection();
    if (!lastUsed || lastUsed.class_id !== class_id) return sections;
    const idx = sections.findIndex((s) => s.id === lastUsed.section_id);
    if (idx <= 0) return sections;
    const copy = [...sections];
    const [item] = copy.splice(idx, 1);
    copy.unshift(item);
    return copy;
  })();

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        onClick={copyGenericLink}
        className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-l-lg border border-gray-300 border-r-0 transition-colors"
        aria-label="Copy Link"
      >
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
      <button
        onClick={openDropdown}
        className="px-1.5 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-r-lg border border-gray-300 transition-colors"
        aria-label="Show sections"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
          role="menu"
          aria-orientation="vertical"
        >
          {loading && (
            <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>
          )}
          {!loading && fetchError && (
            <div className="px-4 py-2 text-sm text-red-600">Failed to load sections</div>
          )}
          {!loading && !fetchError && sortedSections.length === 0 && (
            <div className="px-4 py-2 text-sm text-gray-500">No sections</div>
          )}
          {!loading &&
            sortedSections.map((section) => (
              <button
                key={section.id}
                role="menuitem"
                onClick={() => copySectionLink(section.id)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                {section.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
