'use client';

import React, { useState } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Modal } from '@/components/ui';
import { createClass } from '@/lib/api/classes';

interface CreateClassModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateClassModal({ onClose, onSuccess }: CreateClassModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const trimmedName = name.trim();
    const trimmedDesc = description.trim();

    // Validation
    if (!trimmedName) {
      setError('Class name is required');
      return;
    }
    if (trimmedName.length > 100) {
      setError('Class name must be 100 characters or less');
      return;
    }
    if (trimmedDesc.length > 500) {
      setError('Description must be 500 characters or less');
      return;
    }

    setLoading(true);

    try {
      await createClass(trimmedName, trimmedDesc || undefined);

      // Success
      setName('');
      setDescription('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName('');
      setDescription('');
      setError(null);
      onClose();
    }
  };

  const footer = (
    <>
      <button
        type="button"
        onClick={handleClose}
        disabled={loading}
        className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        form="create-class-form"
        disabled={loading || !name.trim()}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
            Creating...
          </>
        ) : (
          'Create class'
        )}
      </button>
    </>
  );

  return (
    <Modal
      open
      title="New class"
      sub="A class is a long-running container. Sections are the meeting times that share its problem set."
      width={520}
      onClose={handleClose}
      footer={footer}
    >
      <form id="create-class-form" onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <label htmlFor="class-name" className="block text-sm font-medium text-gray-700 mb-1">
              Class Name *
            </label>
            <input
              id="class-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., CS101 Fall 2025"
              disabled={loading}
              autoFocus
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100"
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="class-description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="class-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the class"
              disabled={loading}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100 resize-none"
              maxLength={500}
            />
          </div>

          {error && (
            <ErrorAlert
              error={error}
              onDismiss={() => setError(null)}
            />
          )}
        </div>
      </form>
    </Modal>
  );
}
