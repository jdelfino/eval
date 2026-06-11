'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useClasses } from '@/hooks/useClasses';
import { hasPermission } from '@/hooks/usePermissions';
import { getClassSections } from '@/lib/api/sections';
import ClassList from './components/ClassList';
import CreateClassForm from './components/CreateClassForm';
import CreateSectionForm from './components/CreateSectionForm';
import { Spinner } from '@/components/ui/Spinner';
import type { Section } from '@/types/api';

export default function ClassesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { classes, loading, fetchClasses, createClass, createSection } = useClasses();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createSectionClassId, setCreateSectionClassId] = useState<string | null>(null);
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, Section[]>>({});

  useEffect(() => {
    if (!user) return;
    if (!hasPermission(user, 'content.manage')) {
      router.push('/');
      return;
    }
    fetchClasses();
  }, [user, router, fetchClasses]);

  // Fetch sections for all classes in parallel whenever the classes list changes.
  // Use getClassSections (1 query each) instead of getClass (4 queries each).
  // Keyed by classes.length to avoid refetch when the array identity changes
  // but length is the same (common after re-renders without new data).
  const classCount = classes.length;
  useEffect(() => {
    if (classCount === 0) return;
    let cancelled = false;
    Promise.all(
      classes.map(async (cls) => {
        try {
          const sections = await getClassSections(cls.id);
          return { classId: cls.id, sections };
        } catch {
          return { classId: cls.id, sections: [] as Section[] };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, Section[]> = {};
      for (const { classId, sections } of results) {
        map[classId] = sections;
      }
      setSectionsByClass(map);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classCount]);

  const handleCreateClass = async (name: string, description: string) => {
    await createClass(name, description);
    setShowCreateForm(false);
  };

  const handleCreateSection = async (name: string, semester: string) => {
    if (!createSectionClassId) return;
    const newSection = await createSection(createSectionClassId, name, semester);
    setSectionsByClass(prev => ({
      ...prev,
      [createSectionClassId]: [...(prev[createSectionClassId] ?? []), newSection],
    }));
    setCreateSectionClassId(null);
  };

  const handleOpenCreateSection = (classId: string) => {
    setCreateSectionClassId(classId);
  };

  const handleEditClass = (classId: string) => {
    router.push(`/classes/${classId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" label="Loading classes..." />
      </div>
    );
  }

  const canViewClasses = user && hasPermission(user, 'content.manage');
  if (!canViewClasses) {
    return null;
  }

  const createSectionClass = classes.find(c => c.id === createSectionClassId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Classes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Each class groups one or more sections that meet at different times.
          </p>
        </div>
        {!showCreateForm && classes.length > 0 && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Class
          </button>
        )}
      </div>

      {showCreateForm && (
        <CreateClassForm
          onSubmit={handleCreateClass}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {createSectionClassId && createSectionClass && (
        <CreateSectionForm
          class_id={createSectionClassId}
          className={createSectionClass.name}
          onSubmit={handleCreateSection}
          onCancel={() => setCreateSectionClassId(null)}
        />
      )}

      <ClassList
        classes={classes}
        onCreateNew={() => setShowCreateForm(true)}
        onCreateSection={handleOpenCreateSection}
        onEdit={handleEditClass}
        sectionsByClass={sectionsByClass}
      />
    </div>
  );
}
