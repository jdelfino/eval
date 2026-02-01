'use client';

/**
 * Problem Library Component
 * 
 * Main library view that displays problems with search, filter, and view options.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import ProblemSearch from './ProblemSearch';
import ProblemCard from './ProblemCard';
import CreateSessionFromProblemModal from './CreateSessionFromProblemModal';
import type { ClassInfo, ProblemSummary } from '../types';

interface ProblemLibraryProps {
  onCreateNew?: () => void;
  onEdit?: (problemId: string) => void;
}

export default function ProblemLibrary({ onCreateNew, onEdit }: ProblemLibraryProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Class and tag state
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'created' | 'updated'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Session creation modal state
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [selectedProblemForSession, setSelectedProblemForSession] = useState<{ id: string; title: string; classId: string } | null>(null);

  // Load classes on mount
  useEffect(() => {
    if (!user) return;
    const loadClasses = async () => {
      try {
        const response = await fetch('/api/classes');
        if (response.ok) {
          const data = await response.json();
          const loadedClasses: ClassInfo[] = data.classes || [];
          setClasses(loadedClasses);
          // Default to first class, or check localStorage
          const savedClassId = localStorage.getItem('problemLibrary_classId');
          if (savedClassId && loadedClasses.some(c => c.id === savedClassId)) {
            setSelectedClassId(savedClassId);
          } else if (loadedClasses.length > 0) {
            setSelectedClassId(loadedClasses[0].id);
          }
        }
      } catch {
        // Silently fail - class picker just won't be populated
      } finally {
        setClassesLoaded(true);
      }
    };
    loadClasses();
  }, [user]);

  // Load problems when class selection changes
  useEffect(() => {
    if (classesLoaded) {
      loadProblems();
    }
  }, [user, classesLoaded, selectedClassId]);

  const loadProblems = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        authorId: user.id,
        includePublic: 'true',
        sortBy,
        sortOrder,
      });

      if (selectedClassId) {
        params.set('classId', selectedClassId);
      }

      const response = await fetch(`/api/problems?${params}`);
      if (!response.ok) {
        throw new Error('Failed to load problems');
      }

      const data = await response.json();
      setProblems(data.problems || []);
    } catch (err) {
      console.error('Error loading problems:', err);
      setError(err instanceof Error ? err.message : 'Failed to load problems');
    } finally {
      setLoading(false);
    }
  };

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    if (classId) {
      localStorage.setItem('problemLibrary_classId', classId);
    } else {
      localStorage.removeItem('problemLibrary_classId');
    }
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Collect all unique tags from loaded problems
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const p of problems) {
      if (p.tags) {
        for (const t of p.tags) {
          tagSet.add(t);
        }
      }
    }
    return Array.from(tagSet).sort();
  }, [problems]);

  // Filter and search problems
  const filteredProblems = useMemo(() => {
    let filtered = [...problems];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((problem) =>
        problem.title.toLowerCase().includes(query)
      );
    }

    // Apply tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter((problem) =>
        selectedTags.every(tag => problem.tags?.includes(tag))
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let compareValue = 0;

      if (sortBy === 'title') {
        compareValue = a.title.localeCompare(b.title);
      } else if (sortBy === 'created') {
        compareValue = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'updated') {
        compareValue = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return filtered;
  }, [problems, searchQuery, sortBy, sortOrder, selectedTags]);

  const handleEdit = (problemId: string) => {
    if (onEdit) {
      onEdit(problemId);
    } else {
      router.push(`/instructor/problems`);
    }
  };

  const handleDelete = async (problemId: string, title: string) => {
    try {
      const response = await fetch(`/api/problems/${problemId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete problem');
      }

      // Reload problems after deletion
      await loadProblems();
    } catch (err) {
      console.error('Error deleting problem:', err);
      alert(`Failed to delete "${title}": ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleCreateSession = (problemId: string) => {
    const problem = problems.find(p => p.id === problemId);
    if (!problem) {
      alert('Problem not found');
      return;
    }

    setSelectedProblemForSession({ id: problem.id, title: problem.title, classId: problem.classId });
    setShowSessionModal(true);
  };

  const handleSessionCreated = (sessionId: string, _joinCode: string) => {
    setShowSessionModal(false);
    setSelectedProblemForSession(null);
    
    // Navigate to instructor page - it will auto-join the session
    router.push(`/instructor?sessionId=${sessionId}`);
  };

  const handleCloseSessionModal = () => {
    setShowSessionModal(false);
    setSelectedProblemForSession(null);
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-semibold">Error loading problems</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={loadProblems}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Problem Library</h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredProblems.length} problem{filteredProblems.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {classes.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="class-picker" className="text-sm font-medium text-gray-700">Class:</label>
              <select
                id="class-picker"
                value={selectedClassId}
                onChange={(e) => handleClassChange(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All classes</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Problem
            </button>
          )}
        </div>
      </div>

      {/* Search and filters */}
      <ProblemSearch
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onTagToggle={handleTagToggle}
      />

      {/* Problem list/grid */}
      {filteredProblems.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {searchQuery
              ? 'No problems match your filters'
              : 'No problems yet'}
          </h3>
          <p className="text-gray-600 mb-4">
            {searchQuery
              ? 'Try adjusting your search or filters'
              : 'Create your first problem to get started'}
          </p>
          {onCreateNew && !searchQuery && (
            <button
              onClick={onCreateNew}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Your First Problem
            </button>
          )}
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'space-y-3'
          }
        >
          {filteredProblems.map((problem) => (
            <ProblemCard
              key={problem.id}
              problem={problem}
              viewMode={viewMode}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCreateSession={handleCreateSession}
              onTagClick={handleTagToggle}
            />
          ))}
        </div>
      )}

      {/* Session Creation Modal */}
      {showSessionModal && selectedProblemForSession && (
        <CreateSessionFromProblemModal
          problemId={selectedProblemForSession.id}
          problemTitle={selectedProblemForSession.title}
          classId={selectedProblemForSession.classId}
          className={classes.find(c => c.id === selectedProblemForSession.classId)?.name || ''}
          onClose={handleCloseSessionModal}
          onSuccess={handleSessionCreated}
        />
      )}
    </div>
  );
}
