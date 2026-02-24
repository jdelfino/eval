'use client';

/**
 * Publish Problem Modal
 *
 * Modal that allows instructors to publish/unpublish problems to sections
 * with solution visibility toggle.
 */

import React, { useState, useEffect } from 'react';
import { getClassSections } from '@/lib/api/sections';
import {
  listProblemSections,
  publishProblem,
  unpublishProblem,
  updateSectionProblem,
} from '@/lib/api/section-problems';
import type { Section, SectionProblem } from '@/types/api';

interface SectionState {
  section: Section;
  isPublished: boolean;
  showSolution: boolean;
}

interface PublishProblemModalProps {
  problemId: string;
  classId: string;
  onClose: () => void;
}

export default function PublishProblemModal({
  problemId,
  classId,
  onClose,
}: PublishProblemModalProps) {
  const [sections, setSections] = useState<SectionState[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [classId, problemId]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      const [classSections, publishedSections] = await Promise.all([
        getClassSections(classId),
        listProblemSections(problemId),
      ]);

      // Build map of published sections for quick lookup
      const publishedMap = new Map<string, SectionProblem>();
      publishedSections.forEach((sp) => {
        publishedMap.set(sp.section_id, sp);
      });

      // Merge sections with publish state
      const sectionStates: SectionState[] = classSections.map((section) => {
        const published = publishedMap.get(section.id);
        return {
          section,
          isPublished: !!published,
          showSolution: published?.show_solution || false,
        };
      });

      setSections(sectionStates);
      setError(null);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoadingData(false);
    }
  };

  const handleTogglePublish = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.section.id === sectionId
          ? { ...s, isPublished: !s.isPublished, showSolution: s.isPublished ? false : s.showSolution }
          : s
      )
    );
  };

  const handleToggleSolution = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.section.id === sectionId ? { ...s, showSolution: !s.showSolution } : s
      )
    );
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch current state again to diff
      const currentPublished = await listProblemSections(problemId);
      const currentMap = new Map<string, SectionProblem>();
      currentPublished.forEach((sp) => {
        currentMap.set(sp.section_id, sp);
      });

      const operations: Promise<void>[] = [];

      sections.forEach((state) => {
        const current = currentMap.get(state.section.id);
        const wasPublished = !!current;

        if (state.isPublished && !wasPublished) {
          // Publish
          operations.push(publishProblem(state.section.id, problemId, state.showSolution));
        } else if (!state.isPublished && wasPublished) {
          // Unpublish
          operations.push(unpublishProblem(state.section.id, problemId));
        } else if (state.isPublished && wasPublished && state.showSolution !== current.show_solution) {
          // Update show_solution
          operations.push(
            updateSectionProblem(state.section.id, problemId, {
              show_solution: state.showSolution,
            })
          );
        }
      });

      await Promise.all(operations);
      onClose();
    } catch (err) {
      console.error('Error saving:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Publish Problem</h2>
            <p className="text-sm text-gray-600 mt-1">
              Select sections and configure solution visibility
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {loadingData ? (
          <div className="text-sm text-gray-500 py-8 text-center">Loading sections...</div>
        ) : sections.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">
            No sections found for this class.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto mb-4">
            <div className="space-y-3">
              {sections.map((state) => (
                <div
                  key={state.section.id}
                  className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`section-${state.section.id}`}
                      checked={state.isPublished}
                      onChange={() => handleTogglePublish(state.section.id)}
                      disabled={loading}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      aria-label={`${state.section.name} ${state.section.semester || ''}`}
                    />
                    <label
                      htmlFor={`section-${state.section.id}`}
                      className="flex-1 text-sm font-medium text-gray-900 cursor-pointer"
                    >
                      {state.section.name}
                      {state.section.semester && (
                        <span className="ml-2 text-gray-500">({state.section.semester})</span>
                      )}
                    </label>
                  </div>

                  {state.isPublished && (
                    <div className="mt-2 ml-7 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`solution-${state.section.id}`}
                        checked={state.showSolution}
                        onChange={() => handleToggleSolution(state.section.id)}
                        disabled={loading}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        aria-label={`Show Solution for ${state.section.name}`}
                      />
                      <label
                        htmlFor={`solution-${state.section.id}`}
                        className="text-sm text-gray-700 cursor-pointer"
                      >
                        Show Solution
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            disabled={loading}
            aria-label="Cancel"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || loadingData || sections.length === 0}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Save"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </span>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
