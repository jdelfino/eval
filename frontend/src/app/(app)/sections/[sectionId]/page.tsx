'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { Session } from '@/server/types';
import { BackButton } from '@/components/ui/BackButton';

interface SectionDetail {
  id: string;
  name: string;
  className: string;
  classDescription: string;
  semester?: string;
  role: 'instructor' | 'student';
}

export default function SectionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sectionId = params.sectionId as string;
  const { user, isLoading: authLoading } = useAuth();
  const [section, setSection] = useState<SectionDetail | null>(null);
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/signin');
      return;
    }

    if (user && sectionId) {
      loadSectionData();
    }
  }, [user, authLoading, sectionId, router]);

  const loadSectionData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get section details
      const sectionsResponse = await fetch('/api/sections/my');
      if (!sectionsResponse.ok) throw new Error('Failed to load sections');
      const sectionsData = await sectionsResponse.json();
      const sectionDetail = sectionsData.sections.find((s: any) => s.id === sectionId);
      
      if (!sectionDetail) {
        setError('Section not found');
        return;
      }
      
      setSection(sectionDetail);

      // Get all sessions for this section
      const sessionsResponse = await fetch(`/api/sections/${sectionId}/sessions`);
      if (!sessionsResponse.ok) throw new Error('Failed to load sessions');
      const sessionsData = await sessionsResponse.json();
      
      // Separate active and past sessions
      const active = sessionsData.sessions.filter((s: Session) => s.status === 'active');
      const past = sessionsData.sessions.filter((s: Session) => s.status !== 'active');
      
      setActiveSessions(active);
      setPastSessions(past);
    } catch (err) {
      console.error('Error loading section data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load section');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = (sessionId: string) => {
    router.push(`/student?sessionId=${sessionId}`);
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

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error || !section) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-red-600 mb-4">{error || 'Section not found'}</p>
          <BackButton href="/sections">Back to Sections</BackButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="mb-4">
          <BackButton href="/sections">Back to My Sections</BackButton>
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
            <div className="text-sm text-gray-500">
              Enrolled as <span className="font-medium text-gray-700">{section.role}</span>
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
                            <span>Started {formatDate(session.createdAt)}</span>
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
                        Join Now
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
              <p className="text-sm text-gray-500 mt-2">Check back later or wait for your instructor to start a new session</p>
            </div>
          )}
        </div>

        {/* Past Sessions */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Past Sessions</h2>
          
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
                              {formatDate(session.createdAt)}
                            </span>
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                              Completed
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => router.push(
                          section.role === 'instructor'
                            ? `/instructor/session/${session.id}`
                            : `/student?sessionId=${session.id}`
                        )}
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
        </div>
    </div>
  );
}
