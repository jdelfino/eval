'use client';

/**
 * Create Session From Problem Modal
 * 
 * Modal that allows instructors to create a session from a problem.
 * The class is pre-filled from the problem (read-only). The instructor only selects a section.
 */

import React, { useState, useEffect } from 'react';
import { getLastUsedSection, setLastUsedSection } from '@/lib/last-used-section';

interface SectionInfo {
  id: string;
  name: string;
  semester?: string;
  joinCode: string;
}

interface CreateSessionFromProblemModalProps {
  problemId: string;
  problemTitle: string;
  classId: string;
  className: string;
  onClose: () => void;
  onSuccess: (sessionId: string, joinCode: string) => void;
}

export default function CreateSessionFromProblemModal({
  problemId,
  problemTitle,
  classId,
  className: classDisplayName,
  onClose,
  onSuccess,
}: CreateSessionFromProblemModalProps) {
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSections(classId);
  }, [classId]);

  const loadSections = async (targetClassId: string) => {
    try {
      setLoadingSections(true);
      const response = await fetch(`/api/classes/${targetClassId}/sections`);
      if (!response.ok) {
        throw new Error('Failed to load sections');
      }
      const data = await response.json();
      const loadedSections: SectionInfo[] = data.sections || [];
      setSections(loadedSections);

      // Pre-select last-used section if it matches this class
      const lastUsed = getLastUsedSection();
      if (lastUsed && lastUsed.classId === targetClassId) {
        const match = loadedSections.find(s => s.id === lastUsed.sectionId);
        if (match) {
          setSelectedSectionId(match.id);
          return;
        }
      }
      setSelectedSectionId('');
    } catch (err) {
      console.error('Error loading sections:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sections');
    } finally {
      setLoadingSections(false);
    }
  };

  const handleCreateSession = async () => {
    if (!selectedSectionId) {
      setError('Please select a section');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const createResponse = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sectionId: selectedSectionId,
          problemId: problemId,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create session');
      }

      const { session } = await createResponse.json();
      setLastUsedSection(selectedSectionId, classId);
      onSuccess(session.id, session.joinCode);
    } catch (err) {
      console.error('Error creating session:', err);
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const selectedSection = sections.find(s => s.id === selectedSectionId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Create Session</h2>
            <p className="text-sm text-gray-600 mt-1">
              From problem: <span className="font-medium">{problemTitle}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
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

        <div className="space-y-4">
          {/* Class (read-only — problem belongs to this class) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-900">
              {classDisplayName}
            </div>
          </div>

          {/* Section Selection */}
          <div>
              <label htmlFor="section" className="block text-sm font-medium text-gray-700 mb-2">
                Select Section *
              </label>
              {loadingSections ? (
                <div className="text-sm text-gray-500">Loading sections...</div>
              ) : sections.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No sections found for this class.
                </div>
              ) : (
                <select
                  id="section"
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                >
                  <option value="">-- Select a section --</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name} {section.semester ? `(${section.semester})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

          {/* Summary */}
          {selectedSection && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Session Summary</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-blue-700">Problem:</dt>
                  <dd className="font-medium text-blue-900">{problemTitle}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-blue-700">Class:</dt>
                  <dd className="font-medium text-blue-900">{classDisplayName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-blue-700">Section:</dt>
                  <dd className="font-medium text-blue-900">{selectedSection.name}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleCreateSession}
            disabled={loading || !selectedSectionId}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating...
              </span>
            ) : (
              'Create Session'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
