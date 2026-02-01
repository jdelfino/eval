'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Section } from '@/server/classes/types';
import { formatJoinCodeForDisplay } from '@/server/classes/join-code-service';

interface Instructor {
  id: string;
  name: string;
  email: string;
}

interface SectionCardProps {
  section: Section;
  onRegenerateCode?: (sectionId: string) => Promise<string>;
  onAddInstructor?: (sectionId: string, email: string) => Promise<void>;
  onRemoveInstructor?: (sectionId: string, userId: string) => Promise<void>;
  instructorNames?: Record<string, string>; // userId -> email mapping (kept for backwards compat)
}

export default function SectionCard({
  section,
  onRegenerateCode,
  onAddInstructor,
  onRemoveInstructor,
  instructorNames: _instructorNames = {}
}: SectionCardProps) {
  const [showJoinCode, setShowJoinCode] = useState(true);
  const [joinCode, setJoinCode] = useState(section.joinCode);
  const [regenerating, setRegenerating] = useState(false);
  const [addingInstructor, setAddingInstructor] = useState(false);
  const [newInstructorEmail, setNewInstructorEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showRemoveInstructorConfirm, setShowRemoveInstructorConfirm] = useState(false);
  const [instructorToRemove, setInstructorToRemove] = useState<string | null>(null);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loadingInstructors, setLoadingInstructors] = useState(true);

  // Fetch instructors from API
  useEffect(() => {
    const fetchInstructors = async () => {
      try {
        const response = await fetch(`/api/sections/${section.id}/instructors`);
        if (response.ok) {
          const data = await response.json();
          setInstructors(data.instructors || []);
        }
      } catch (err) {
        console.error('Failed to fetch instructors:', err);
      } finally {
        setLoadingInstructors(false);
      }
    };
    fetchInstructors();
  }, [section.id]);

  const handleRegenerateCode = async () => {
    if (!onRegenerateCode) return;
    
    setRegenerating(true);
    setError(null);
    try {
      const newCode = await onRegenerateCode(section.id);
      setJoinCode(newCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate code');
    } finally {
      setRegenerating(false);
    }
  };

  const refreshInstructors = async () => {
    try {
      const response = await fetch(`/api/sections/${section.id}/instructors`);
      if (response.ok) {
        const data = await response.json();
        setInstructors(data.instructors || []);
      }
    } catch (err) {
      console.error('Failed to refresh instructors:', err);
    }
  };

  const handleAddInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddInstructor || !newInstructorEmail.trim()) return;

    setError(null);
    try {
      await onAddInstructor(section.id, newInstructorEmail.trim());
      setNewInstructorEmail('');
      setAddingInstructor(false);
      await refreshInstructors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add instructor');
    }
  };

  const handleRemoveInstructorClick = (userId: string) => {
    setInstructorToRemove(userId);
    setShowRemoveInstructorConfirm(true);
  };

  const handleConfirmRemoveInstructor = async () => {
    if (!onRemoveInstructor || !instructorToRemove) return;

    setShowRemoveInstructorConfirm(false);
    setError(null);
    try {
      await onRemoveInstructor(section.id, instructorToRemove);
      await refreshInstructors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove instructor');
    } finally {
      setInstructorToRemove(null);
    }
  };

  return (
    <Card variant="default" className="p-6 space-y-4">
      <div>
        <Link
          href={`/sections/${section.id}`}
          className="text-xl font-semibold text-blue-600 hover:text-blue-900"
          data-testid={`section-link-${section.id}`}
        >
          {section.name}
        </Link>
        {section.semester && (
          <p className="text-sm text-gray-500">{section.semester}</p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Join Code */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Join Code</span>
          <button
            onClick={() => setShowJoinCode(!showJoinCode)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {showJoinCode ? 'Hide' : 'Show'}
          </button>
        </div>
        {showJoinCode && (
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-100 px-3 py-2 rounded font-mono text-lg">
              {formatJoinCodeForDisplay(joinCode)}
            </code>
            {onRegenerateCode && (
              <button
                onClick={handleRegenerateCode}
                disabled={regenerating}
                className="p-2 text-gray-600 hover:text-gray-700 disabled:opacity-50"
                title="Regenerate join code"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Instructors */}
      {onAddInstructor && onRemoveInstructor && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Instructors</h4>
          {loadingInstructors ? (
            <p className="text-sm text-gray-400 mb-3">Loading...</p>
          ) : (
            <ul className="space-y-2 mb-3">
              {instructors.map((instructor) => (
                <li key={instructor.id} className="flex items-center justify-between text-sm">
                  <span>{instructor.name || instructor.email}</span>
                  {instructors.length > 1 && (
                    <button
                      onClick={() => handleRemoveInstructorClick(instructor.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          
          {addingInstructor ? (
            <form onSubmit={handleAddInstructor} className="flex gap-2">
              <input
                type="email"
                value={newInstructorEmail}
                onChange={(e) => setNewInstructorEmail(e.target.value)}
                placeholder="instructor@example.com"
                className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="submit"
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingInstructor(false);
                  setNewInstructorEmail('');
                }}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setAddingInstructor(true)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Co-Instructor
            </button>
          )}
        </div>
      )}

      {/* Statistics */}
      <div className="border-t pt-4 text-sm text-gray-600">
        <p>Created {new Date(section.createdAt).toLocaleDateString()}</p>
      </div>

      <ConfirmDialog
        open={showRemoveInstructorConfirm}
        title="Remove Instructor"
        message="Are you sure you want to remove this instructor?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleConfirmRemoveInstructor}
        onCancel={() => {
          setShowRemoveInstructorConfirm(false);
          setInstructorToRemove(null);
        }}
      />
    </Card>
  );
}
