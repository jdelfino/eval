'use client';

import React, { useState, useEffect } from 'react';
import CreateSectionModal from './CreateSectionModal';
import { formatJoinCodeForDisplay } from '@/server/classes/join-code-service';
import { BackButton } from '@/components/ui/BackButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface SectionInfo {
  id: string;
  name: string;
  joinCode: string;
  schedule?: string;
  location?: string;
  studentCount: number;
  sessionCount: number;
  activeSessionCount: number;
}

interface SessionInfo {
  id: string;
  joinCode: string;
  problemText: string;
  studentCount: number;
  createdAt: string;
  lastActivity: string;
  status: 'active' | 'completed';
}

interface SectionViewProps {
  classId: string;
  className: string;
  onBack: () => void;
  onCreateSession: (sectionId: string, sectionName: string) => void;
  onJoinSession: (sessionId: string) => void;
}

export default function SectionView({
  classId,
  className,
  onBack: _onBack,
  onCreateSession,
  onJoinSession
}: SectionViewProps) {
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [selectedSection, setSelectedSection] = useState<SectionInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    loadSections();
  }, [classId]);

  useEffect(() => {
    if (selectedSection) {
      loadSessions(selectedSection.id);
    }
  }, [selectedSection]);

  const loadSections = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/classes/${classId}/sections`);
      if (!response.ok) {
        throw new Error('Failed to load sections');
      }
      const data = await response.json();
      setSections(data.sections || []);
      setError(null);
    } catch (err) {
      console.error('Error loading sections:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sections');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSectionClick = (sectionId: string, sectionName: string) => {
    setSectionToDelete({ id: sectionId, name: sectionName });
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteSection = async () => {
    if (!sectionToDelete) return;

    setShowDeleteConfirm(false);
    setDeletingId(sectionToDelete.id);
    try {
      const response = await fetch(`/api/sections/${sectionToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete section');
      }

      // If deleted section was selected, clear selection
      if (selectedSection?.id === sectionToDelete.id) {
        setSelectedSection(null);
      }

      // Reload sections
      await loadSections();
    } catch (err) {
      console.error('Error deleting section:', err);
      alert(`Failed to delete section: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeletingId(null);
      setSectionToDelete(null);
    }
  };

  const loadSessions = async (sectionId: string) => {
    try {
      setLoadingSessions(true);
      const response = await fetch(`/api/sections/${sectionId}/sessions`);
      if (!response.ok) {
        throw new Error('Failed to load sessions');
      }
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Error loading sessions:', err);
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleCreateSession = () => {
    if (selectedSection) {
      onCreateSession(selectedSection.id, selectedSection.name);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p className="font-semibold">Error loading sections</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!selectedSection) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{className}</h2>
            <p className="text-gray-600 mt-1">Select a section to view and manage sessions</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Section
          </button>
        </div>

        {sections.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Sections Yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Create your first section to start organizing sessions.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Section
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections.map((section) => (
              <div
                key={section.id}
                className="relative group"
              >
                <button
                  onClick={() => setSelectedSection(section)}
                  className="w-full text-left p-6 bg-white border-2 border-gray-200 rounded-xl shadow-sm hover:shadow-lg hover:border-blue-400 transition-all duration-200 transform hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 pr-12">
                      <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {section.name}
                      </h3>
                      <div className="mt-2 inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-sm font-mono font-bold rounded-lg">
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        {formatJoinCodeForDisplay(section.joinCode)}
                      </div>
                      {section.schedule && (
                        <p className="text-sm text-gray-600 mt-2">
                          {section.schedule}
                        </p>
                      )}
                      {section.location && (
                        <p className="text-sm text-gray-500 mt-0.5">
                          {section.location}
                        </p>
                      )}
                    </div>
                    <svg
                      className="w-6 h-6 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0 ml-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-gray-500 mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center">
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <span>{section.studentCount} students</span>
                    </div>
                    <div className="flex items-center">
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>{section.activeSessionCount} active</span>
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSectionClick(section.id, section.name);
                  }}
                  disabled={deletingId === section.id}
                  className="absolute top-4 right-4 p-2 bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-700 transition-opacity duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete section"
                >
                  {deletingId === section.id ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {showCreateModal && (
          <CreateSectionModal
            classId={classId}
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false);
              loadSections();
            }}
          />
        )}
        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete Section"
          message={`Delete "${sectionToDelete?.name}"? This will also delete all sessions and memberships within this section.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleConfirmDeleteSection}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setSectionToDelete(null);
          }}
        />
      </div>
    );
  }

  // Section selected - show sessions
  return (
    <div>
      <div className="mb-6">
        <BackButton onClick={() => setSelectedSection(null)}>Back to {className}</BackButton>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">{selectedSection.name}</h2>
        <div className="flex items-center gap-4 text-gray-600">
          <div className="flex items-center">
            <span className="mr-2">Join Code:</span>
            <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-sm font-mono font-bold rounded-lg">
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              {formatJoinCodeForDisplay(selectedSection.joinCode)}
            </span>
          </div>
          <span>•</span>
          <span>
            {selectedSection.schedule && `${selectedSection.schedule} • `}
            {selectedSection.studentCount} students enrolled
          </span>
        </div>
      </div>

      <div className="mb-6 flex justify-between items-center">
        <h3 className="text-xl font-bold text-gray-900">Sessions</h3>
        <button
          onClick={handleCreateSession}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Session
        </button>
      </div>

      {loadingSessions ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-dashed border-blue-300">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <p className="text-lg font-semibold text-gray-700 mb-2">No sessions yet</p>
          <p className="text-sm text-gray-500 mb-6">Create a new session to start teaching</p>
          <button
            onClick={handleCreateSession}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create First Session
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onJoinSession(session.id)}
              className="p-6 bg-white border border-gray-200 rounded-xl shadow-md hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 text-left"
            >
              <div className="mb-4">
                <div className="text-3xl font-bold text-blue-600 mb-2 font-mono tracking-wider">
                  {session.joinCode}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span>{session.studentCount} {session.studentCount === 1 ? 'student' : 'students'}</span>
                </div>
              </div>
              {session.problemText && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                  {session.problemText}
                </p>
              )}
              <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
                <span className={`px-2 py-1 rounded-full ${
                  session.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {session.status}
                </span>
                <span>{new Date(session.lastActivity).toLocaleTimeString()}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
