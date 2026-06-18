'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Session, PublishedProblemWithStatus, StudentProgress } from '@/types/api';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { ConnectionDot } from '@/components/ui/ConnectionDot';
import { createSession } from '@/lib/api/sessions';
import { formatTimeAgo } from '@/lib/format';
import { toPlainText } from '@/lib/markdown';
import type { SectionDetail } from '../page';

interface InstructorSectionViewProps {
  section: SectionDetail;
  activeSessions: Session[];
  pastSessions: Session[];
  publishedProblems: PublishedProblemWithStatus[];
  students: StudentProgress[];
  onEnterPreview?: () => void;
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

        <div
          data-testid="section-header-card"
          className="rounded-lg shadow p-6 bg-bg-raised"
        >
          <div className="flex flex-col sm:flex-row flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2 text-fg">{section.name}</h1>
              <p className="text-lg mb-1 text-fg-muted">{section.className}</p>
              {section.semester && (
                <span
                  className="inline-block text-sm px-3 py-1 rounded-full text-fg-muted bg-bg-sunken"
                >
                  {section.semester}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {onEnterPreview && (
                <button
                  onClick={onEnterPreview}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors border text-fg-muted bg-bg-sunken border-border"
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
              <div className="text-sm text-fg-muted">
                Enrolled as <span className="font-medium text-fg">{section.role}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4 flex items-center text-fg">
          {activeSessions.length > 0 && (
            <span className="mr-3 inline-flex">
              <ConnectionDot status="live" compact />
            </span>
          )}
          Active Sessions
          {activeSessions.length > 0 && (
            <span
              className="ml-3 px-3 py-1 text-sm font-semibold rounded-full bg-run-soft text-run"
            >
              {activeSessions.length}
            </span>
          )}
        </h2>

        {activeSessions.length > 0 ? (
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                data-testid="active-session-card"
                className="rounded-lg shadow hover:shadow-lg transition-shadow border-2 bg-bg-raised border-run-soft"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-shrink-0">
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center bg-run-soft"
                        >
                          <span data-testid="live-dot">
                            <ConnectionDot status="live" compact />
                          </span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold mb-1 text-fg">
                          {session.problem?.title || 'Coding Session'}
                        </h3>
                        {session.problem?.description && (
                          <p className="mb-2 line-clamp-2 text-fg-muted">
                            {toPlainText(session.problem.description)}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-fg-muted">
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
                      className="px-8 py-4 text-base font-semibold rounded-lg transition-colors shadow hover:shadow-md flex items-center gap-2 w-full sm:w-auto bg-run text-fg-inverse"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                      Rejoin
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="zap"
            title="No active sessions at the moment"
            body="Start a new session to engage with your students."
          />
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
                  className="rounded-lg shadow hover:shadow-md transition-shadow border bg-bg-raised border-border"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-1 text-fg">{problem.problem.title}</h3>
                        {problem.problem.description && (
                          <p className="mb-2 line-clamp-2 text-sm text-fg-muted">{toPlainText(problem.problem.description)}</p>
                        )}
                        <div className="flex items-center gap-2">
                          {(problem.problem.tags || []).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 text-xs font-medium rounded bg-bg-sunken text-fg-muted"
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
            // DEC-11: empty-section publish ramps — exactly two (Browse library +
            // Create new problem). Starter-pack and import/share ramps dropped.
            <EmptyState
              icon="book"
              tone="info"
              title="No problems published to this section yet"
              body="Publish a problem to get your students started."
              primary={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button asChild variant="primary">
                    <Link href="/instructor/problems">Browse library</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/instructor/problems?edit=new">Create new problem</Link>
                  </Button>
                </div>
              }
            />
          )}
        </Tabs.Panel>

        {/* Sessions Tab */}
        <Tabs.Panel tabId="sessions">
          {pastSessions.length > 0 ? (
            <div className="space-y-3">
              {pastSessions.map((session) => (
                <div
                  key={session.id}
                  data-testid="past-session-card"
                  className="rounded-lg shadow hover:shadow-md transition-shadow border bg-bg-raised border-border"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex-shrink-0">
                          <div
                            className="w-12 h-12 rounded-lg flex items-center justify-center bg-bg-sunken"
                          >
                            <svg className="w-7 h-7 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold mb-1 text-fg">
                            {session.problem?.title || 'Coding Session'}
                          </h3>
                          {session.problem?.description && (
                            <p className="mb-2 line-clamp-1 text-sm text-fg-muted">
                              {toPlainText(session.problem.description)}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-fg-muted">
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
                            <span
                              className="px-2 py-1 rounded text-xs font-medium bg-bg-sunken text-fg-muted"
                            >
                              Completed
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(`/instructor/session/${session.id}`)}
                        className="px-6 py-3 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 w-full sm:w-auto bg-bg-sunken text-fg-muted"
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
            <EmptyState
              icon="history"
              title="No past sessions yet"
              body="Completed sessions will appear here once you run one."
            />
          )}
        </Tabs.Panel>

        {/* Students Tab */}
        <Tabs.Panel tabId="students">
          {students.length > 0 ? (
            <div className="rounded-lg shadow overflow-x-auto bg-bg-raised" data-testid="students-table-container">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-bg-sunken">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-fg-muted">
                      Student
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-fg-muted">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-fg-muted">
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-bg-raised">
                  {students.map((student) => (
                    <tr
                      key={student.user_id}
                      className="hover:bg-bg-sunken transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/sections/${section.id}/students/${student.user_id}`}
                          className="block text-sm font-medium text-accent-ink hover:underline"
                        >
                          {student.display_name || student.email}
                        </Link>
                        {student.display_name && (
                          <span className="block text-xs mt-0.5 text-fg-muted">
                            {student.email}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-fg-muted">
                        {`Solved ${student.problems_solved} · Started ${student.problems_started}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-fg-muted">
                        {student.last_active ? formatTimeAgo(student.last_active) : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="users"
              title="No students enrolled yet"
              body="Share your section join code to get students enrolled."
            />
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
