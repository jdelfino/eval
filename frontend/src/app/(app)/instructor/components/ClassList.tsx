'use client';

import React, { useState, useEffect } from 'react';
import CreateClassModal from './CreateClassModal';
import { ErrorAlert } from '@/components/ErrorAlert';
import { fetchWithRetry } from '@/lib/api-utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { ClassWithSections } from '../types';

type ClassInfo = ClassWithSections;

interface ClassListProps {
  onSelectClass: (classId: string) => void;
}

export default function ClassList({ onSelectClass }: ClassListProps) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [classToDelete, setClassToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchWithRetry('/api/classes', { maxRetries: 2 });
      if (!response.ok) {
        throw new Error('Failed to load classes');
      }
      const data = await response.json();
      setClasses(data.classes || []);
    } catch (err) {
      console.error('Error loading classes:', err);
      setError(err instanceof Error ? err : new Error('Failed to load classes'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (classId: string, className: string) => {
    setClassToDelete({ id: classId, name: className });
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!classToDelete) return;

    setShowDeleteConfirm(false);
    setDeletingId(classToDelete.id);
    setDeleteError(null);
    try {
      const response = await fetchWithRetry(`/api/classes/${classToDelete.id}`, {
        fetchOptions: { method: 'DELETE' },
        maxRetries: 2,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete class');
      }

      // Reload classes
      await loadClasses();
    } catch (err) {
      console.error('Error deleting class:', err);
      const error = err instanceof Error ? err : new Error('Failed to delete class');
      setDeleteError(error);
    } finally {
      setDeletingId(null);
      setClassToDelete(null);
    }
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
      <ErrorAlert
        error={error}
        title="Error loading classes"
        onRetry={loadClasses}
        isRetrying={loading}
      />
    );
  }

  if (classes.length === 0) {
    return (
      <>
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Classes Yet</h3>
          <p className="text-sm text-gray-500 mb-6">
            Create your first class to get started
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Your First Class
          </button>
        </div>
        {showCreateModal && (
          <CreateClassModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false);
              loadClasses();
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Your Classes</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Class
        </button>
      </div>
      {deleteError && (
        <ErrorAlert
          error={deleteError}
          title="Error deleting class"
          onDismiss={() => setDeleteError(null)}
          className="mb-6"
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {classes.map((classInfo) => (
          <div key={classInfo.id} className="relative group">
            <button
              onClick={() => onSelectClass(classInfo.id)}
              disabled={deletingId === classInfo.id}
              className="w-full text-left p-6 bg-white border-2 border-gray-200 rounded-xl shadow-sm hover:shadow-lg hover:border-blue-400 transition-all duration-200 transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 pr-12">
                  <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{classInfo.name}</h3>
                  {classInfo.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {classInfo.description}
                    </p>
                  )}
                </div>
                <svg
                  className="w-6 h-6 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div className="flex items-center text-sm text-gray-500 mt-4 pt-4 border-t border-gray-100">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>{classInfo.sectionCount} {classInfo.sectionCount === 1 ? 'section' : 'sections'}</span>
              </div>
            </button>

            {/* Delete button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(classInfo.id, classInfo.name);
              }}
              disabled={deletingId === classInfo.id}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
              title="Delete class"
            >
              {deletingId === classInfo.id ? (
                <div className="animate-spin w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full"></div>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          </div>
        ))}
      </div>
      {showCreateModal && (
        <CreateClassModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadClasses();
          }}
        />
      )}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Class"
        message={`Delete "${classToDelete?.name}"? This will also delete all sections and sessions within this class.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setClassToDelete(null);
        }}
      />
    </>
  );
}
