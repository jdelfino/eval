'use client';

import Link from 'next/link';
import type { Class } from '@/server/classes/types';

interface ClassListProps {
  classes: Class[];
  onCreateNew: () => void;
}

export default function ClassList({ classes, onCreateNew }: ClassListProps) {
  if (classes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mb-6">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No classes yet</h3>
        <p className="text-gray-500 mb-6">
          Get started by creating your first class
        </p>
        <button
          onClick={onCreateNew}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Your First Class
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {classes.map((classItem) => (
        <Link
          key={classItem.id}
          href={`/classes/${classItem.id}`}
          className="block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
        >
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {classItem.name}
          </h3>
          {classItem.description && (
            <p className="text-gray-600 text-sm mb-4 line-clamp-2">
              {classItem.description}
            </p>
          )}
          <div className="text-sm text-gray-500">
            Created {new Date(classItem.createdAt).toLocaleDateString()}
          </div>
        </Link>
      ))}
    </div>
  );
}
