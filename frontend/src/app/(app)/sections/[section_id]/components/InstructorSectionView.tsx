'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Session, PublishedProblemWithStatus, StudentProgress } from '@/types/api';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { createSession } from '@/lib/api/sessions';
import type { SectionDetail } from '../page';

interface InstructorSectionViewProps {
  section: SectionDetail;
  activeSessions: Session[];
  pastSessions: Session[];
  publishedProblems: PublishedProblemWithStatus[];
  students: StudentProgress[];
  onEnterPreview?: () => void;
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

type SectionTab = 'students' | 'sessions' | 'problems';

export default function InstructorSectionView({
  section,
  activeSessions,
  pastSessions,
  publishedProblems,
  students,
  onEnterPreview,
}: InstructorSectionViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SectionTab>('problems');
  const [creatingSessions, setCreatingSessions] = useState<Set<string>>(new Set());

  const handleJoinSession = (session_id: string) => {
    router.push(`/instructor/session/${session_id}`);
  };

  const handleCreateSession = async (problemId: string) => {
    setCreatingSessions((prev) => new Set(prev).add(problemId));
    try {
      const session = await createSession(section.id, problemId);
      router.push(`/instructor/session/${session.id}`);
    } catch (err) {
      console.error('Error creating session:', err);
      alert(err instanceof Error ? err.message : 'Failed to create session');
      setCreatingSessions((prev) => {
        const next = new Set(prev);
        next.delete(problemId);
        return next;
      });
    }
  };

  const formatDate = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="mb-4">
          <BackButton href={`/classes/${section.classId}`}>Back to Class</BackButton>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{section.name}</h1>
              <p className="text-lg text-gray-600 mb-1">{section.className}</p>
              {section.semester && (
                <span className="inline-block text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  {section.semester}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {onEnterPreview && (
                <button
                  onClick={onEnterPreview}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors border border-gray-300"
                >
                  <svg
                    className="w-4 h-4"
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
                  Preview as Student
                </button>
              )}
              <div className="text-sm text-gray-500">
                Enrolled as <span className="font-medium text-gray-700">{section.role}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
          {activeSessions.length > 0 && (
            <span className="w-3 h-3 bg-green-500 rounded-full mr-3 animate-pulse"></span>
          )}
          Active Sessions
          {activeSessions.length > 0 && (
            <span className="ml-3 px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-full">
              {activeSessions.length}
            </span>
          )}
        </h2>

        {activeSessions.length > 0 ? (
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow border-2 border-green-200"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-900 mb-1">
                          {session.problem?.title || 'Coding Session'}
                        </h3>
                        {session.problem?.description && (
                          <p className="text-gray-600 mb-2 line-clamp-2">
                            {session.problem.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            {session.participants?.length || 0} student{session.participants?.length !== 1 ? 's' : ''}
                          </span>
                          <span>Started {formatDate(session.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleJoinSession(session.id)}
                      className="ml-4 px-8 py-4 bg-green-600 text-white text-base font-semibold rounded-lg hover:bg-green-700 transition-colors shadow hover:shadow-md flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      View Dashboard
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-gray-600">No active sessions at the moment</p>
            <p className="text-sm text-gray-500 mt-2">Start a new session to engage with your students</p>
          </div>
        )}
      </div>

      {/* Tabbed Content: Problems | Sessions | Students */}
      <Tabs activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as SectionTab)}>
        <Tabs.List className="px-1">
          <Tabs.Tab tabId="problems">
            Problems ({publishedProblems.length})
          </Tabs.Tab>
          <Tabs.Tab tabId="sessions">
            Sessions ({pastSessions.length})
          </Tabs.Tab>
          <Tabs.Tab tabId="students">
            Students ({students.length})
          </Tabs.Tab>
        </Tabs.List>

        {/* Problems Tab */}
        <Tabs.Panel tabId="problems">
          {publishedProblems.length > 0 ? (
            <div className="space-y-3">
              {publishedProblems.map((problem) => (
                <div
                  key={problem.problem.id}
                  className="bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">{problem.problem.title}</h3>
                        {problem.problem.description && (
                          <p className="text-gray-600 mb-2 line-clamp-2 text-sm">{problem.problem.description}</p>
                        )}
                        <div className="flex items-center gap-2">
                          {(problem.problem.tags || []).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleCreateSession(problem.problem.id)}
                        disabled={creatingSessions.has(problem.problem.id)}
                        title="Create session"
                      >
                        {creatingSessions.has(problem.problem.id) ? 'Creating...' : 'Create Session'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-600">No problems published to this section yet</p>
            </div>
          )}
        </Tabs.Panel>

        {/* Sessions Tab */}
        <Tabs.Panel tabId="sessions">
          {pastSessions.length > 0 ? (
            <div className="space-y-3">
              {pastSessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                            <svg className="w-7 h-7 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {session.problem?.title || 'Coding Session'}
                          </h3>
                          {session.problem?.description && (
                            <p className="text-gray-600 mb-2 line-clamp-1 text-sm">
                              {session.problem.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                              </svg>
                              {session.participants?.length || 0} student{session.participants?.length !== 1 ? 's' : ''}
                            </span>
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {formatDate(session.created_at)}
                            </span>
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                              Completed
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/instructor/session/${session.id}`)}
                        className="ml-4 px-6 py-3 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-600">No past sessions yet</p>
            </div>
          )}
        </Tabs.Panel>

        {/* Students Tab */}
        <Tabs.Panel tabId="students">
          {students.length > 0 ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Active
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {students.map((student) => (
                    <tr
                      key={student.user_id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/sections/${section.id}/students/${student.user_id}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                          {student.display_name || student.email}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {student.problems_started} / {student.total_problems} problems
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {student.last_active ? formatRelativeTime(student.last_active) : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <p className="text-gray-600">No students enrolled yet</p>
            </div>
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
