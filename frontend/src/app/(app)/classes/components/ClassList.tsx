'use client';

import Link from 'next/link';
import type { Class, Section } from '@/types/api';
import { formatJoinCodeForDisplay } from '@/lib/join-code';

interface ClassListProps {
  classes: Class[];
  onCreateNew: () => void;
  onCreateSection: (classId: string) => void;
  onEdit?: (classId: string) => void;
  sectionsByClass: Record<string, Section[]>;
}

export default function ClassList({ classes, onCreateNew, onCreateSection, onEdit, sectionsByClass }: ClassListProps) {
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
      {classes.map((classItem) => {
        const sections = sectionsByClass[classItem.id] ?? [];
        return (
          <div
            key={classItem.id}
            className="bg-white border border-gray-200 rounded-lg p-4"
          >
            {/* Card header: class name + description */}
            <div className="mb-3">
              <div className="font-serif text-lg font-medium tracking-tight text-gray-900">
                {classItem.name}
              </div>
              {classItem.description && (
                <div className="text-xs text-gray-500 mt-0.5">{classItem.description}</div>
              )}
            </div>

            {/* Sections list */}
            {sections.length > 0 && (
              <div className="border-t border-gray-100 pt-2 mb-3">
                {sections.map((section) => (
                  <div key={section.id} className="flex items-center justify-between py-1 text-sm">
                    <div>
                      <div className="text-gray-800">{section.name}</div>
                      <div className="font-mono text-xs text-gray-400">
                        {formatJoinCodeForDisplay(section.join_code)}
                      </div>
                    </div>
                    <Link
                      href={`/sections/${section.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 ml-3"
                    >
                      Open →
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {/* Footer actions */}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onCreateSection(classItem.id)}
                className="inline-flex items-center px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                + Section
              </button>
              <button
                onClick={() => onEdit?.(classItem.id)}
                className="inline-flex items-center px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Edit
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
