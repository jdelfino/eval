'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { listSessionHistoryWithFilters, endSession } from '@/lib/api/sessions';
import type { Session } from '@/types/api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface SessionsListProps {
  onRejoinSession?: (session_id: string) => void;
  onEndSession?: (session_id: string) => void;
  onViewDetails?: (session_id: string) => void;
  refreshTrigger?: number; // Increment this to trigger a refresh
}

export default function SessionsList({ onRejoinSession, onEndSession, onViewDetails, refreshTrigger }: SessionsListProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
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

      // Note: The typed API currently only supports sectionId and limit filters.
      // statusFilter and searchQuery are applied client-side for now.
      const sessions = await listSessionHistoryWithFilters();

      // Apply client-side filters
      let filteredSessions = sessions;
      if (statusFilter !== 'all') {
        filteredSessions = filteredSessions.filter(s => s.status === statusFilter);
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredSessions = filteredSessions.filter(s =>
          s.section_name?.toLowerCase().includes(query)
        );
      }

      setSessions(filteredSessions);
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

  const handleRejoin = (session_id: string) => {
    if (onRejoinSession) {
      onRejoinSession(session_id);
    } else {
      router.push(`/instructor/session/${session_id}`);
    }
  };

  const handleEndSessionClick = (session_id: string) => {
    setSessionToEnd(session_id);
    setShowEndSessionConfirm(true);
  };

  const handleConfirmEndSession = async () => {
    if (!sessionToEnd) return;

    setShowEndSessionConfirm(false);
    if (onEndSession) {
      onEndSession(sessionToEnd);
    } else {
      try {
        await endSession(sessionToEnd);
        fetchSessions();
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
              placeholder="Search by section..."
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
                      <h4 className="text-lg font-semibold text-gray-900">{session.section_name}</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {session.participants.length} {session.participants.length === 1 ? 'student' : 'students'}
                        {' • '}
                        {getTimeAgo(session.created_at)}
                      </p>
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
                  <h4 className="text-lg font-semibold text-gray-900">{session.section_name}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {session.participants.length} {session.participants.length === 1 ? 'student' : 'students'}
                    {' • '}
                    {formatDate(session.created_at)}
                    {' • '}
                    Duration: {formatDuration(session.created_at, session.ended_at || undefined)}
                  </p>
                </div>
                
                <div className="flex sm:flex-col sm:justify-center">
                  <button
                    onClick={() => onViewDetails ? onViewDetails(session.id) : router.push(`/instructor/session/${session.id}`)}
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
