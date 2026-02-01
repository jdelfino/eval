'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';

interface CreateClassFormProps {
  onSubmit: (name: string, description: string) => Promise<void>;
  onCancel: () => void;
}

export default function CreateClassForm({ onSubmit, onCancel }: CreateClassFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Class name is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onSubmit(name.trim(), description.trim());
      setName('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create class');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="default" className="p-6 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-2xl font-bold">Create New Class</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="className" className="block text-sm font-medium text-gray-700 mb-2">
            Class Name *
          </label>
          <input
            id="className"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., CS 101 - Intro to Programming"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label htmlFor="classDescription" className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            id="classDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description of the class..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={submitting}
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Class'}
          </button>
        </div>
      </form>
    </Card>
  );
}
