'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useClasses } from '@/hooks/useClasses';
import { hasPermission } from '@/hooks/usePermissions';
import { getClassSections } from '@/lib/api/sections';
import { useParallelEnrichment } from '@/hooks/useParallelEnrichment';
import ClassList from './components/ClassList';
import CreateClassForm from './components/CreateClassForm';
import CreateSectionForm from './components/CreateSectionForm';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import type { Class, Section } from '@/types/api';

export default function ClassesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { classes, loading, fetchClasses, createClass, createSection } = useClasses();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createSectionClassId, setCreateSectionClassId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!hasPermission(user, 'content.manage')) {
      router.push('/');
      return;
    }
    fetchClasses();
  }, [user, router, fetchClasses]);

  // Fan out per-class section fetches using the shared enrichment hook.
  // Built-in cancellation and real-identity change detection (no length-keying needed).
  const { map: sectionsByClassRaw } = useParallelEnrichment<Class, string, Section[]>(
    classes,
    (cls) => cls.id,
    (cls) => getClassSections(cls.id)
  );
  // Degrade: classes whose fetch failed get an empty array in the map
  const sectionsByClass: Record<string, Section[]> = Object.fromEntries(
    classes.map((cls) => [cls.id, sectionsByClassRaw[cls.id] ?? []])
  );

  const handleCreateClass = async (name: string, description: string) => {
    await createClass(name, description);
    setShowCreateForm(false);
  };

  const handleCreateSection = async (name: string, semester: string) => {
    if (!createSectionClassId) return;
    await createSection(createSectionClassId, name, semester);
    // Re-fetch classes so the hook picks up the new section on the next render cycle.
    fetchClasses();
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
          <Button variant="accent" size="sm" onClick={() => setShowCreateForm(true)}>
            New Class
          </Button>
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
