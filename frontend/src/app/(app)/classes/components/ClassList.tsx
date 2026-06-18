'use client';

import Link from 'next/link';
import type { Class, Section } from '@/types/api';
import { formatJoinCodeForDisplay } from '@/lib/join-code';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

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
      <EmptyState
        icon="book"
        title="No classes yet"
        body="Get started by creating your first class"
        primary={
          <Button variant="accent" size="sm" onClick={onCreateNew}>
            Create Your First Class
          </Button>
        }
      />
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
              <Button variant="secondary" size="xs" onClick={() => onCreateSection(classItem.id)}>
                + Section
              </Button>
              <Button variant="secondary" size="xs" onClick={() => onEdit?.(classItem.id)}>
                Edit
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
