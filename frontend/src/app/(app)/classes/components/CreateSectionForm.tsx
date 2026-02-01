'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';

interface CreateSectionFormProps {
  classId: string;
  className: string;
  onSubmit: (name: string, semester: string) => Promise<void>;
  onCancel: () => void;
}

export default function CreateSectionForm({ classId: _classId, className, onSubmit, onCancel }: CreateSectionFormProps) {
  const [name, setName] = useState('');
  const [semester, setSemester] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Section name is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onSubmit(name.trim(), semester.trim());
      setName('');
      setSemester('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create section');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="default" className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-2xl font-bold">Create New Section</h2>
        <p className="text-gray-600">for {className}</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="sectionName" className="block text-sm font-medium text-gray-700 mb-2">
            Section Name *
          </label>
          <input
            id="sectionName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Section A, Morning Session"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label htmlFor="semester" className="block text-sm font-medium text-gray-700 mb-2">
            Semester
          </label>
          <input
            id="semester"
            type="text"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            placeholder="e.g., Fall 2025, Spring 2026"
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
            {submitting ? 'Creating...' : 'Create Section'}
          </button>
        </div>
      </form>
    </Card>
  );
}
