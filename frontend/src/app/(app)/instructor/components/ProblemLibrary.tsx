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

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { listClasses } from '@/lib/api/classes';
import { listProblems, deleteProblem, exportProblems } from '@/lib/api/problems';
import LibraryTagBar from './LibraryTagBar';
import CreateSessionFromProblemModal from './CreateSessionFromProblemModal';
import PublishProblemModal from './PublishProblemModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Table } from '@/components/ui/Table';
import { Menu } from '@/components/ui/Menu';
import { formatShortDate } from '@/lib/format';
import type { Class } from '@/types/api';
import type { ProblemSummary } from '../types';
import { Download, ChevronDown } from 'lucide-react';

interface ProblemLibraryProps {
  onCreateNew?: () => void;
  onEdit?: (problem_id: string) => void;
}

/** Serif title cell style — hoisted to module const per design. */
const TITLE_CELL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-serif, Georgia, serif)',
};

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

  /** Filtered problems based on search query and selected tags (API already sorted). */
  const filteredProblems = useMemo(() => {
    let filtered = problems;

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

    return filtered;
  }, [problems, searchQuery, selectedTags]);

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

  // Export dropdown anchor
  const exportAnchor = (
    <Button
      variant="secondary"
      size="md"
      loading={exporting}
      disabled={exporting || filteredProblems.length === 0}
      aria-expanded={exportMenuOpen}
      aria-haspopup="true"
    >
      <Download className="w-4 h-4 mr-1" />
      Export
      <ChevronDown className="w-4 h-4 ml-1" />
    </Button>
  );

  const exportMenuItems = [
    {
      label: 'Export JSON',
      onSelect: () => handleExport('json'),
    },
    {
      label: 'Export PDF',
      onSelect: () => handleExport('pdf'),
    },
  ];

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

          {/* Export dropdown via Menu primitive */}
          <Menu
            anchor={exportAnchor}
            items={exportMenuItems}
            open={exportMenuOpen}
            onOpenChange={setExportMenuOpen}
            align="right"
          />

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
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Title</Table.HeaderCell>
                <Table.HeaderCell>Tags</Table.HeaderCell>
                <Table.HeaderCell>Tests</Table.HeaderCell>
                <Table.HeaderCell>Updated</Table.HeaderCell>
                <Table.HeaderCell align="right">Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredProblems.map((problem) => (
                <Table.Row key={problem.id}>
                  {/* Title — serif font per design; links to the private problem view */}
                  <Table.Cell>
                    <Link
                      href={`/instructor/problems/${problem.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                      style={TITLE_CELL_STYLE}
                    >
                      {problem.title}
                    </Link>
                  </Table.Cell>

                  {/* Tags */}
                  <Table.Cell>
                    <div className="flex flex-wrap gap-1">
                      {problem.tags && problem.tags.length > 0 ? (
                        problem.tags.map((tag) => (
                          <Pill key={tag} tone="neutral" mono>
                            #{tag}
                          </Pill>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </Table.Cell>

                  {/* Tests column: "N io · M pytest" or "—" */}
                  <Table.Cell>
                    <span className="text-xs font-mono text-gray-500">
                      {renderTestCounts(problem)}
                    </span>
                  </Table.Cell>

                  {/* Updated date */}
                  <Table.Cell>
                    <span className="text-xs text-gray-500">
                      {formatShortDate(problem.updated_at ?? problem.created_at)}
                    </span>
                  </Table.Cell>

                  {/* Actions */}
                  <Table.Cell align="right">
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
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handlePublish(problem.id)}
                      >
                        Publish
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteClick(problem.id, problem.title)}
                        disabled={isDeleting}
                      >
                        Delete
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
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
