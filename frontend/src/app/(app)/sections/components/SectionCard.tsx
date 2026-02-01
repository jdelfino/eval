'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import type { Session } from '@/server/types';

export const ACTIVE_SESSION_POLL_INTERVAL_MS = 10000;

interface SectionWithClass {
  id: string;
  classId: string;
  name: string;
  semester?: string;
  className: string;
  classDescription: string;
  role: 'instructor' | 'student';
  joinCode: string;
  createdAt: string | Date;
}

interface SectionCardProps {
  section: SectionWithClass;
  getActiveSessions: (sectionId: string) => Promise<Session[]>;
}

export default function SectionCard({ section, getActiveSessions }: SectionCardProps) {
  const router = useRouter();
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActiveSessions();
    // Poll for active sessions
    const interval = setInterval(loadActiveSessions, ACTIVE_SESSION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [section.id]);

  const loadActiveSessions = async () => {
    try {
      const sessions = await getActiveSessions(section.id);
      setActiveSessions(sessions);
    } catch (error) {
      console.error('Failed to load active sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = (sessionId: string) => {
    router.push(`/student?sessionId=${sessionId}`);
  };

  const handleViewSection = () => {
    router.push(`/sections/${section.id}`);
  };

  return (
    <Card variant="default" className="p-0">
      <div className="p-6">
        <div className="flex items-start justify-between">
          {/* Left: Section Info - Clickable */}
          <button
            onClick={handleViewSection}
            className="flex-1 text-left hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-4 mb-2">
              <h3 className="text-xl font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                {section.name}
              </h3>
              {section.semester && (
                <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  {section.semester}
                </span>
              )}
            </div>
            <p className="text-gray-600 mb-1">{section.className}</p>
            <p className="text-sm text-gray-500">Enrolled as {section.role}</p>
          </button>

          {/* Right: Status Badge */}
          <div className="flex-shrink-0 ml-4">
            {loading ? (
              <div className="text-sm text-gray-400">Loading...</div>
            ) : activeSessions.length > 0 ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-full">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-green-700">
                  {activeSessions.length} Active Session{activeSessions.length > 1 ? 's' : ''}
                </span>
              </div>
            ) : (
              <div className="text-sm text-gray-400 px-4 py-2 bg-gray-50 rounded-full">
                No active sessions
              </div>
            )}
          </div>
        </div>

        {/* Active Sessions List */}
        {activeSessions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="space-y-2">
              {activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-4 rounded-lg hover:border-green-300 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-gray-900 truncate">
                        {session.problem?.title || 'Coding Session'}
                      </p>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-sm text-gray-600 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                          {session.students?.size || 0} student{session.students?.size !== 1 ? 's' : ''} joined
                        </p>
                        {session.problem?.description && (
                          <p className="text-sm text-gray-500 truncate">
                            {session.problem.description.substring(0, 80)}
                            {session.problem.description.length > 80 ? '...' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleJoinSession(session.id)}
                    className="ml-4 px-6 py-3 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors shadow-sm hover:shadow-md flex items-center gap-2 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    Join Now
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
