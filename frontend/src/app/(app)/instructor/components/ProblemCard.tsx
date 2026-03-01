'use client';

/**
 * Problem Card Component
 *
 * Displays an individual problem with metadata and action buttons.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CopyLinkDropdown } from './CopyLinkDropdown';
import type { ProblemSummary } from '../types';

interface ProblemCardProps {
  problem: ProblemSummary;
  viewMode: 'list' | 'grid';
  onEdit: (problem_id: string) => void;
  onDelete: (problem_id: string, title: string) => void;
  onCreateSession: (problem_id: string) => void;
  onPublish?: (problem_id: string) => void;
  onTagClick?: (tag: string) => void;
}

export default function ProblemCard({
  problem,
  viewMode,
  onEdit,
  onDelete,
  onCreateSession,
  onPublish,
  onTagClick,
}: ProblemCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      await onDelete(problem.id, problem.title);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const hasDescription = !!problem.description?.trim();
  const hasTags = Array.isArray(problem.tags) && problem.tags.length > 0;

  const renderTags = () => {
    if (!hasTags) return null;
    return (
      <div data-testid="problem-tags" className="flex flex-wrap gap-1 mb-2">
        {problem.tags!.map((tag) => (
          <button
            key={tag}
            onClick={(e) => {
              e.stopPropagation();
              onTagClick?.(tag);
            }}
            className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-blue-100 hover:text-blue-700 transition-colors"
          >
            {tag}
          </button>
        ))}
      </div>
    );
  };

  if (viewMode === 'list') {
    return (
      <Card variant="default" className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate mb-2">
              {problem.title}
            </h3>

            {hasDescription && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {problem.description}
              </p>
            )}

            {renderTags()}

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>Created {formatDate(problem.created_at)}</span>
            </div>
          </div>

          <div data-testid="list-view-actions" className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => onEdit(problem.id)} title="Edit problem">
              Edit
            </Button>
            <CopyLinkDropdown problem_id={problem.id} class_id={problem.class_id} />
            {onPublish && (
              <Button variant="secondary" size="sm" onClick={() => onPublish(problem.id)} title="Publish to sections">
                Publish
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => onCreateSession(problem.id)} title="Create session">
              Create Session
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteClick} disabled={isDeleting} title="Delete problem">
              {isDeleting ? '...' : 'Delete'}
            </Button>
          </div>
        </div>
        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete Problem"
          message={`Delete "${problem.title}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      </Card>
    );
  }

  // Grid view
  return (
    <Card variant="default" className="p-4 flex flex-col">
      <h3 className="text-lg font-semibold text-gray-900 truncate mb-3">
        {problem.title}
      </h3>

      {hasDescription && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-3 flex-1">
          {problem.description}
        </p>
      )}

      {renderTags()}

      <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
        <span>{formatDate(problem.created_at)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" size="sm" className="w-full" onClick={() => onEdit(problem.id)}>
          Edit
        </Button>
        <CopyLinkDropdown problem_id={problem.id} class_id={problem.class_id} />
        {onPublish && (
          <Button variant="secondary" size="sm" className="w-full" onClick={() => onPublish(problem.id)}>
            Publish
          </Button>
        )}
        <Button variant="primary" size="sm" className="w-full" onClick={() => onCreateSession(problem.id)}>
          Create Session
        </Button>
        <Button variant="danger" size="sm" className="w-full" onClick={handleDeleteClick} disabled={isDeleting}>
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
      </div>
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Problem"
        message={`Delete "${problem.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </Card>
  );
}
