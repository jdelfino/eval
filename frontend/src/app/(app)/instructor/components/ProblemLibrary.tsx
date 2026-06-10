'use client';

/**
 * Problem Library Component
 *
 * Main library view: tag chip bar (multi-select AND logic) + toolbar
 * (search, class selector, sort) + table (title / tags / tests / updated / actions).
 *
 * v4 LibTable layout per docs/design/handoff/v4/library-*.jsx.
 * No difficulty column, no status dot (problems have no draft/published state).
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { listClasses } from '@/lib/api/classes';
import { listProblems, deleteProblem, exportProblems } from '@/lib/api/problems';
import LibraryTagBar from './LibraryTagBar';
import CreateSessionFromProblemModal from './CreateSessionFromProblemModal';
import PublishProblemModal from './PublishProblemModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import type { Class } from '@/types/api';
import type { ProblemSummary } from '../types';
import { Download, ChevronDown, FileJson, FileText } from 'lucide-react';

interface ProblemLibraryProps {
  onCreateNew?: () => void;
  onEdit?: (problem_id: string) => void;
}

/** Format a date string to a short human-readable form (e.g. "Jan 3, 2025"). */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Render the tests column value from test_counts. Falls back to "—" when absent. */
function renderTestCounts(problem: ProblemSummary): string {
  if (!problem.test_counts) return '—';
  return `${problem.test_counts.io} io · ${problem.test_counts.pytest} pytest`;
}

export default function ProblemLibrary({ onCreateNew, onEdit }: ProblemLibraryProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Class selector state
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classesLoaded, setClassesLoaded] = useState(false);

  // Tag chip bar state (Set for fast membership check)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'created' | 'updated'>('created');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Delete confirm dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Session creation modal state
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [selectedProblemForSession, setSelectedProblemForSession] = useState<{
    id: string;
    title: string;
    class_id: string;
  } | null>(null);

  // Publish modal state
  const [publishProblem, setPublishProblem] = useState<{ id: string; class_id: string } | null>(
    null
  );

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // ──────────────────────────────────────────────
  // Load classes on mount
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const fetchClasses = async () => {
      try {
        const loadedClasses = await listClasses();
        setClasses(loadedClasses);
        const savedClassId = localStorage.getItem('problemLibrary_classId');
        if (savedClassId && loadedClasses.some((c) => c.id === savedClassId)) {
          setSelectedClassId(savedClassId);
        } else if (loadedClasses.length > 0) {
          setSelectedClassId(loadedClasses[0].id);
        }
      } catch {
        // Silently fail — class picker just won't be populated
      } finally {
        setClassesLoaded(true);
      }
    };
    fetchClasses();
  }, [user]);

  // ──────────────────────────────────────────────
  // Load problems when class selection changes
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (classesLoaded) {
      loadProblems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, classesLoaded, selectedClassId, sortBy, sortOrder]);

  const loadProblems = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const sortByMap: Record<string, 'title' | 'created_at' | 'updated_at'> = {
        title: 'title',
        created: 'created_at',
        updated: 'updated_at',
      };
      const loadedProblems = await listProblems({
        author_id: user.id,
        class_id: selectedClassId || undefined,
        include_public: true,
        sort_by: sortByMap[sortBy],
        sort_order: sortOrder,
      });
      setProblems(loadedProblems);
    } catch (err) {
      console.error('Error loading problems:', err);
      setError(err instanceof Error ? err.message : 'Failed to load problems');
    } finally {
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────────
  // Class selector handler
  // ──────────────────────────────────────────────
  const handleClassChange = (class_id: string) => {
    setSelectedClassId(class_id);
    if (class_id) {
      localStorage.setItem('problemLibrary_classId', class_id);
    } else {
      localStorage.removeItem('problemLibrary_classId');
    }
  };

  // ──────────────────────────────────────────────
  // Tag chip bar handlers
  // ──────────────────────────────────────────────
  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const handleTagClear = () => {
    setSelectedTags(new Set());
  };

  // ──────────────────────────────────────────────
  // Derived data
  // ──────────────────────────────────────────────

  /** Count of problems per tag across the full (unfiltered) problem list. */
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of problems) {
      if (p.tags) {
        for (const t of p.tags) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [problems]);

  /** Filtered + sorted problems based on search query and selected tags. */
  const filteredProblems = useMemo(() => {
    let filtered = [...problems];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((p) => p.title.toLowerCase().includes(query));
    }

    // Apply tag filter (AND logic: problem must carry ALL selected tags)
    if (selectedTags.size > 0) {
      filtered = filtered.filter((p) =>
        Array.from(selectedTags).every((tag) => p.tags?.includes(tag))
      );
    }

    // Client-side sort (API already sorts, but tag/search filtering may reorder)
    filtered.sort((a, b) => {
      let compareValue = 0;
      if (sortBy === 'title') {
        compareValue = a.title.localeCompare(b.title);
      } else if (sortBy === 'created') {
        compareValue = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortBy === 'updated') {
        const aDate = a.updated_at ?? a.created_at;
        const bDate = b.updated_at ?? b.created_at;
        compareValue = new Date(aDate).getTime() - new Date(bDate).getTime();
      }
      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return filtered;
  }, [problems, searchQuery, selectedTags, sortBy, sortOrder]);

  // ──────────────────────────────────────────────
  // Action handlers
  // ──────────────────────────────────────────────
  const handleEdit = (problem_id: string) => {
    if (onEdit) {
      onEdit(problem_id);
    } else {
      router.push(`/instructor/problems`);
    }
  };

  const handleDeleteClick = (id: string, title: string) => {
    setDeleteTarget({ id, title });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const { id, title } = deleteTarget;
    setDeleteTarget(null);
    setIsDeleting(true);
    try {
      await deleteProblem(id);
      await loadProblems();
    } catch (err) {
      console.error('Error deleting problem:', err);
      alert(`Failed to delete "${title}": ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateSession = (problem_id: string) => {
    const problem = problems.find((p) => p.id === problem_id);
    if (!problem) {
      alert('Problem not found');
      return;
    }
    setSelectedProblemForSession({ id: problem.id, title: problem.title, class_id: problem.class_id });
    setShowSessionModal(true);
  };

  const handleSessionCreated = (session_id: string, _joinCode: string) => {
    setShowSessionModal(false);
    setSelectedProblemForSession(null);
    router.push(`/instructor/session/${session_id}`);
  };

  const handleCloseSessionModal = () => {
    setShowSessionModal(false);
    setSelectedProblemForSession(null);
  };

  const handlePublish = (problem_id: string) => {
    const problem = problems.find((p) => p.id === problem_id);
    if (problem) {
      setPublishProblem({ id: problem.id, class_id: problem.class_id });
    }
  };

  const handleExport = async (format: 'json' | 'pdf') => {
    setExportMenuOpen(false);
    try {
      setExporting(true);
      await exportProblems({
        class_id: selectedClassId || undefined,
        tags: selectedTags.size > 0 ? Array.from(selectedTags) : undefined,
        format,
      });
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  // Click-outside handler for export dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key handler for export dropdown
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && exportMenuOpen) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [exportMenuOpen]);

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-semibold">Error loading problems</p>
        <p className="text-sm">{error}</p>
        <button onClick={loadProblems} className="mt-2 text-sm underline hover:no-underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div
        className="flex flex-wrap items-center justify-between gap-3"
        data-testid="problem-library-header"
      >
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Problem Library</h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredProblems.length} problem{filteredProblems.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        </div>

        <div
          className="flex flex-wrap items-center gap-3"
          data-testid="problem-library-controls"
        >
          {/* Class picker */}
          {classes.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="class-picker" className="text-sm font-medium text-gray-700">
                Class:
              </label>
              <select
                id="class-picker"
                value={selectedClassId}
                onChange={(e) => handleClassChange(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Export dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              disabled={exporting || filteredProblems.length === 0}
              aria-expanded={exportMenuOpen}
              aria-haspopup="true"
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                <Download className="w-5 h-5" />
              )}
              Export
              <ChevronDown className="w-4 h-4" />
            </button>
            {exportMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
                role="menu"
              >
                <button
                  role="menuitem"
                  onClick={() => handleExport('json')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <FileJson className="w-4 h-4" />
                  Export JSON
                </button>
                <button
                  role="menuitem"
                  onClick={() => handleExport('pdf')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Export PDF
                </button>
              </div>
            )}
          </div>

          {/* Create new problem */}
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Create New Problem
            </button>
          )}
        </div>
      </div>

      {/* ── Toolbar: search + sort ── */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search problems by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex items-center gap-2">
          <label htmlFor="sort-picker" className="text-sm font-medium text-gray-700 sr-only">
            Sort by
          </label>
          <select
            id="sort-picker"
            aria-label="Sort by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'title' | 'created' | 'updated')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="created">Date Created</option>
            <option value="updated">Last Updated</option>
            <option value="title">Title</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
        </div>
      </div>

      {/* ── Tag chip bar ── */}
      <LibraryTagBar
        tagCounts={tagCounts}
        selectedTags={selectedTags}
        onToggle={handleTagToggle}
        onClear={handleTagClear}
      />

      {/* ── Table or empty state ── */}
      {filteredProblems.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {searchQuery || selectedTags.size > 0 ? 'No problems match your filters' : 'No problems yet'}
          </h3>
          <p className="text-gray-600 mb-4">
            {searchQuery || selectedTags.size > 0
              ? 'Try adjusting your search or filters'
              : 'Create your first problem to get started'}
          </p>
          {onCreateNew && !searchQuery && selectedTags.size === 0 && (
            <button
              onClick={onCreateNew}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Your First Problem
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tags
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tests
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProblems.map((problem) => (
                <tr key={problem.id} className="hover:bg-gray-50 transition-colors">
                  {/* Title — serif font per design */}
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900" style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}>
                      {problem.title}
                    </span>
                  </td>

                  {/* Tags */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {problem.tags && problem.tags.length > 0 ? (
                        problem.tags.map((tag) => (
                          <span
                            key={tag}
                            className={[
                              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono border',
                              selectedTags.has(tag)
                                ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200',
                            ].join(' ')}
                          >
                            #{tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </td>

                  {/* Tests column: "N io · M pytest" or "—" */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-gray-500">
                      {renderTestCounts(problem)}
                    </span>
                  </td>

                  {/* Updated date */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">
                      {formatDate(problem.updated_at ?? problem.created_at)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => handleEdit(problem.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => handleCreateSession(problem.id)}
                      >
                        Start
                      </Button>
                      <button
                        onClick={() => handlePublish(problem.id)}
                        className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        Publish
                      </button>
                      <button
                        onClick={() => handleDeleteClick(problem.id, problem.title)}
                        disabled={isDeleting}
                        className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Delete confirm dialog ── */}
      {deleteTarget && (
        <ConfirmDialog
          open={true}
          title="Delete Problem"
          message={`Delete "${deleteTarget.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── Session Creation Modal ── */}
      {showSessionModal && selectedProblemForSession && (
        <CreateSessionFromProblemModal
          problem_id={selectedProblemForSession.id}
          problem_title={selectedProblemForSession.title}
          class_id={selectedProblemForSession.class_id}
          className={
            classes.find((c) => c.id === selectedProblemForSession.class_id)?.name || ''
          }
          onClose={handleCloseSessionModal}
          onSuccess={handleSessionCreated}
        />
      )}

      {/* ── Publish Problem Modal ── */}
      {publishProblem && (
        <PublishProblemModal
          problemId={publishProblem.id}
          classId={publishProblem.class_id}
          onClose={() => setPublishProblem(null)}
        />
      )}
    </div>
  );
}
