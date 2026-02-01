'use client';

import React, { useState } from 'react';

interface CreateSectionModalProps {
  classId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateSectionModal({ classId, onClose, onSuccess }: CreateSectionModalProps) {
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedSchedule = schedule.trim();
    const trimmedLocation = location.trim();

    // Validation
    if (!trimmedName) {
      setError('Section name is required');
      return;
    }
    if (trimmedName.length > 100) {
      setError('Section name must be 100 characters or less');
      return;
    }

    const capacityNum = capacity ? parseInt(capacity, 10) : undefined;
    if (capacity && (isNaN(capacityNum!) || capacityNum! < 1)) {
      setError('Capacity must be a positive number');
      return;
    }

    setLoading(true);

    try {
      const body: any = { 
        name: trimmedName, 
        schedule: trimmedSchedule,
        location: trimmedLocation,
      };
      
      if (capacityNum !== undefined) {
        body.capacity = capacityNum;
      }

      const response = await fetch(`/api/classes/${classId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create section');
      }

      // Success
      setName('');
      setSchedule('');
      setLocation('');
      setCapacity('');
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
      setSchedule('');
      setLocation('');
      setCapacity('');
      setError(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Create New Section</h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="section-name" className="block text-sm font-medium text-gray-700 mb-1">
                Section Name *
              </label>
              <input
                id="section-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Section A"
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100"
                maxLength={100}
              />
            </div>

            <div>
              <label htmlFor="section-schedule" className="block text-sm font-medium text-gray-700 mb-1">
                Schedule
              </label>
              <input
                id="section-schedule"
                type="text"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="e.g., MWF 10:00-11:00am"
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100"
                maxLength={100}
              />
            </div>

            <div>
              <label htmlFor="section-location" className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                id="section-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Room 101"
                disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100"
                maxLength={100}
              />
            </div>

            <div>
              <label htmlFor="section-capacity" className="block text-sm font-medium text-gray-700 mb-1">
                Capacity
              </label>
              <input
                id="section-capacity"
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="Maximum students (optional)"
                disabled={loading}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Creating...
                </>
              ) : (
                'Create Section'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
