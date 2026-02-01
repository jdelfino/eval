'use client';

/**
 * InstructorDashboard - Main dashboard view for instructor
 *
 * Shows a table of all classes and sections with session controls.
 * Replaces the old ?view= based navigation with a cleaner table UI.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { hasRolePermission } from '@/server/auth/permissions';
import { ErrorAlert } from '@/components/ErrorAlert';
import { formatJoinCodeForDisplay } from '@/server/classes/join-code-service';
import { fetchWithRetry } from '@/lib/api-utils';
import CreateClassModal from './CreateClassModal';

interface SectionInfo {
  id: string;
  name: string;
  semester?: string;
  joinCode: string;
  studentCount: number;
  activeSessionId?: string;
}

interface ClassWithSections {
  id: string;
  name: string;
  description?: string;
  sections: SectionInfo[];
}

interface InstructorDashboardProps {
  /** Callback when user wants to start a new session for a section */
  onStartSession: (sectionId: string, sectionName: string) => void;
  /** Callback when user wants to rejoin an existing active session */
  onRejoinSession: (sessionId: string) => void;
}

export function InstructorDashboard({
  onStartSession,
  onRejoinSession,
}: InstructorDashboardProps) {
  const { user } = useAuth();
  const [classesWithSections, setClassesWithSections] = useState<ClassWithSections[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);

  const canCreateClass = user && hasRolePermission(user.role, 'class.create');
  const canCreateSession = user && hasRolePermission(user.role, 'session.create');

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch classes with their sections and active session info
      const response = await fetchWithRetry('/api/instructor/dashboard', {
        maxRetries: 2,
      });

      if (!response.ok) {
        throw new Error('Failed to load dashboard data');
      }

      const data = await response.json();
      setClassesWithSections(data.classes || []);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setError(err instanceof Error ? err : new Error('Failed to load dashboard'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleStartSession = (section: SectionInfo) => {
    if (section.activeSessionId) {
      onRejoinSession(section.activeSessionId);
    } else {
      onStartSession(section.id, section.name);
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
      <ErrorAlert
        error={error}
        title="Error loading dashboard"
        onRetry={loadDashboardData}
        isRetrying={loading}
      />
    );
  }

  // Empty state
  if (classesWithSections.length === 0) {
    return (
      <>
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Welcome to the Instructor Dashboard</h3>
          <p className="text-sm text-gray-500 mb-6">
            Create your first class to get started teaching.
          </p>
          {canCreateClass && (
            <button
              onClick={() => setShowCreateClassModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
              data-testid="create-first-class-btn"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Your First Class
            </button>
          )}
        </div>
        {showCreateClassModal && (
          <CreateClassModal
            onClose={() => setShowCreateClassModal(false)}
            onSuccess={() => {
              setShowCreateClassModal(false);
              loadDashboardData();
            }}
          />
        )}
      </>
    );
  }

  // Dashboard table view
  return (
    <div data-testid="instructor-dashboard">
      {/* Header with create button */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-600 mt-1">Manage your classes and start sessions</p>
        </div>
        {canCreateClass && (
          <button
            onClick={() => setShowCreateClassModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center gap-2"
            data-testid="create-class-btn"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Class
          </button>
        )}
      </div>

      {/* Classes and sections table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Class
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Section
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Semester
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Students
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {classesWithSections.map((classInfo) => (
              classInfo.sections.length === 0 ? (
                // Class with no sections
                <tr key={classInfo.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/classes/${classInfo.id}`}
                      className="font-medium text-blue-600 hover:text-blue-900"
                      data-testid={`class-link-${classInfo.id}`}
                    >
                      {classInfo.name}
                    </Link>
                    {classInfo.description && (
                      <div className="text-sm text-gray-500 truncate max-w-xs">{classInfo.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 italic">
                    No sections yet
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    —
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    —
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    —
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    —
                  </td>
                </tr>
              ) : (
                // Class with sections - one row per section
                classInfo.sections.map((section, sectionIndex) => (
                  <tr
                    key={section.id}
                    className={`hover:bg-gray-50 ${section.activeSessionId ? 'bg-green-50' : ''}`}
                    data-testid={`section-row-${section.id}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {sectionIndex === 0 ? (
                        <>
                          <Link
                            href={`/classes/${classInfo.id}`}
                            className="font-medium text-blue-600 hover:text-blue-900"
                            data-testid={`class-link-${classInfo.id}`}
                          >
                            {classInfo.name}
                          </Link>
                          {classInfo.description && (
                            <div className="text-sm text-gray-500 truncate max-w-xs">{classInfo.description}</div>
                          )}
                        </>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/sections/${section.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-900"
                        data-testid={`section-link-${section.id}`}
                      >
                        {section.name}
                      </Link>
                      <div className="text-xs text-gray-500 font-mono" data-testid="join-code">
                        {formatJoinCodeForDisplay(section.joinCode)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {section.semester || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {section.studentCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {section.activeSessionId ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <span className="w-2 h-2 mr-1.5 bg-green-500 rounded-full animate-pulse"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Idle
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {canCreateSession && (
                        <button
                          onClick={() => handleStartSession(section)}
                          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                            section.activeSessionId
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          }`}
                          data-testid={section.activeSessionId ? `rejoin-session-${section.id}` : `start-session-${section.id}`}
                        >
                          {section.activeSessionId ? 'Rejoin Session' : 'Start Session'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )
            ))}
          </tbody>
        </table>
      </div>

      {/* Create class modal */}
      {showCreateClassModal && (
        <CreateClassModal
          onClose={() => setShowCreateClassModal(false)}
          onSuccess={() => {
            setShowCreateClassModal(false);
            loadDashboardData();
          }}
        />
      )}
    </div>
  );
}
