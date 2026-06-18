'use client';

/**
 * Publish Problem Modal
 *
 * Modal that allows instructors to publish/unpublish problems to sections
 * with solution visibility toggle.
 */

import React, { useState, useEffect } from 'react';
import { Modal, Button, Banner } from '@/components/ui';
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
  /** Title of the problem being published, shown in the modal heading. */
  problemTitle: string;
  onClose: () => void;
}

export default function PublishProblemModal({
  problemId,
  classId,
  problemTitle,
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

  const selectedCount = sections.filter((s) => s.isPublished).length;

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose} disabled={loading} aria-label="Cancel">
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleSave}
        loading={loading}
        disabled={loading || loadingData || sections.length === 0}
      >
        {loading
          ? 'Saving...'
          : `Publish to ${selectedCount} ${selectedCount === 1 ? 'section' : 'sections'}`}
      </Button>
    </>
  );

  return (
    <Modal
      open
      title={`Publish ${problemTitle}`}
      sub="Publishing makes this problem visible to students for solo practice. It does NOT start a session."
      width={560}
      onClose={onClose}
      footer={footer}
    >
        {error && <Banner tone="danger" title={error} style={{ marginBottom: 16 }} />}

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
    </Modal>
  );
}
