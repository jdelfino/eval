'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface SessionData {
  id: string;
  joinCode: string;
  problemTitle: string;
  problemDescription?: string;
  createdAt: string;
  lastActivity: string;
  creatorId: string;
  participantCount: number;
  status: 'active' | 'completed';
  endedAt?: string;
  sectionId: string;
  sectionName: string;
}

interface SessionsListProps {
  onRejoinSession?: (sessionId: string) => void;
  onEndSession?: (sessionId: string) => void;
  onViewDetails?: (sessionId: string) => void;
  refreshTrigger?: number; // Increment this to trigger a refresh
}

export default function SessionsList({ onRejoinSession, onEndSession, onViewDetails, refreshTrigger }: SessionsListProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [sessionToEnd, setSessionToEnd] = useState<string | null>(null);

  // Fetch sessions
  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`/api/sessions/history?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }

      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [statusFilter, searchQuery, refreshTrigger]);

  const handleRejoin = (sessionId: string) => {
    if (onRejoinSession) {
      onRejoinSession(sessionId);
    } else {
      router.push(`/instructor?sessionId=${sessionId}`);
    }
  };

  const handleEndSessionClick = (sessionId: string) => {
    setSessionToEnd(sessionId);
    setShowEndSessionConfirm(true);
  };

  const handleConfirmEndSession = async () => {
    if (!sessionToEnd) return;

    setShowEndSessionConfirm(false);
    if (onEndSession) {
      onEndSession(sessionToEnd);
    } else {
      // Call API to end session
      try {
        // TODO: Implement end session API endpoint
        console.warn('End session:', sessionToEnd);
        fetchSessions(); // Refresh list
      } catch (err) {
        console.error('Error ending session:', err);
        alert('Failed to end session');
      }
    }
    setSessionToEnd(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDuration = (startDate: string, endDate?: string) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const durationMs = end.getTime() - start.getTime();
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
  };

  if (loading && sessions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="text-gray-500">Loading sessions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8">
        <div className="text-red-600 text-center">
          <p className="font-semibold">Error loading sessions</p>
          <p className="text-sm mt-2">{error}</p>
          <button
            onClick={fetchSessions}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeSessions = sessions.filter(s => s.status === 'active');
  const completedSessions = sessions.filter(s => s.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">All Sessions</h2>
            <p className="text-sm text-gray-600 mt-1">
              {sessions.length} total • {activeSessions.length} active • {completedSessions.length} completed
            </p>
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Sessions</option>
              <option value="active">Active Only</option>
              <option value="completed">Completed Only</option>
            </select>
            
            <input
              type="text"
              placeholder="Search by section or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 sm:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Empty State */}
      {sessions.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <span className="text-6xl mb-4 block">📚</span>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No sessions found</h3>
          <p className="text-gray-600 mb-6">
            {searchQuery || statusFilter !== 'all' 
              ? 'Try adjusting your filters'
              : 'Create your first session to get started'}
          </p>
        </div>
      )}

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
            Active Now ({activeSessions.length})
          </h3>
          
          {activeSessions.map(session => (
            <div key={session.id} className="bg-white rounded-lg shadow-sm border-l-4 border-green-500 p-6 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-gray-900">{session.sectionName}</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        Join Code: <span className="font-mono font-bold text-blue-600">{session.joinCode}</span>
                        {' • '}
                        {session.participantCount} {session.participantCount === 1 ? 'student' : 'students'}
                        {' • '}
                        {getTimeAgo(session.createdAt)}
                      </p>
                      {session.problemTitle && session.problemTitle !== 'Untitled Session' && (
                        <p className="text-sm text-gray-700 mt-2">
                          <span className="font-medium">Problem:</span> {session.problemTitle}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 sm:flex-col sm:justify-center">
                  <button
                    onClick={() => handleRejoin(session.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Rejoin
                  </button>
                  <button
                    onClick={() => handleEndSessionClick(session.id)}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors whitespace-nowrap"
                  >
                    End Session
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed Sessions */}
      {completedSessions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">Past Sessions ({completedSessions.length})</h3>
          
          {completedSessions.map(session => (
            <div key={session.id} className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-gray-900">{session.sectionName}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {session.participantCount} {session.participantCount === 1 ? 'student' : 'students'}
                    {' • '}
                    {formatDate(session.createdAt)}
                    {' • '}
                    Duration: {formatDuration(session.createdAt, session.endedAt)}
                  </p>
                  {session.problemTitle && session.problemTitle !== 'Untitled Session' && (
                    <p className="text-sm text-gray-700 mt-2">
                      <span className="font-medium">Problem:</span> {session.problemTitle}
                    </p>
                  )}
                </div>
                
                <div className="flex sm:flex-col sm:justify-center">
                  <button
                    onClick={() => onViewDetails ? onViewDetails(session.id) : router.push(`/instructor?sessionId=${session.id}`)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={showEndSessionConfirm}
        title="End Session"
        message="Are you sure you want to end this session?"
        confirmLabel="End Session"
        variant="danger"
        onConfirm={handleConfirmEndSession}
        onCancel={() => {
          setShowEndSessionConfirm(false);
          setSessionToEnd(null);
        }}
      />
    </div>
  );
}
