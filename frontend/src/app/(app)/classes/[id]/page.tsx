'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useClasses } from '@/hooks/useClasses';
import { hasRolePermission } from '@/lib/permissions';
import type { Class, Section } from '@/types/api';
import { apiFetch } from '@/lib/api-client';
import SectionCard from '../components/SectionCard';
import CreateSectionForm from '../components/CreateSectionForm';
import { BackButton } from '@/components/ui/BackButton';

export default function ClassDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const class_id = params.id as string;
  
  const { user, isLoading: authLoading } = useAuth();
  const { 
    createSection, 
    regenerateJoinCode, 
    addCoInstructor, 
    removeCoInstructor 
  } = useClasses();
  
  const [classData, setClassData] = useState<Class | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [instructorNames, setInstructorNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/signin');
      return;
    }

    // Check if user has permission to read classes
    if (user && !hasRolePermission(user.role, 'class.read')) {
      router.push('/');
      return;
    }

    if (user) {
      loadClassDetails();
    }
  }, [user, authLoading, router, class_id]);

  const loadClassDetails = async () => {
    try {
      const response = await apiFetch(`/classes/${class_id}`);
      const data = await response.json();
      setClassData(data.class);
      setSections(data.sections || []);
      setInstructorNames(data.instructorNames || {});
    } catch (error) {
      console.error('Failed to load class:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSection = async (name: string, semester: string) => {
    const newSection = await createSection(class_id, name, semester);
    setSections([...sections, newSection]);
    setShowCreateForm(false);
  };

  const handleRegenerateCode = async (section_id: string) => {
    const updatedSection = await regenerateJoinCode(section_id);
    setSections(sections.map(s =>
      s.id === section_id ? updatedSection : s
    ));
    return updatedSection.join_code;
  };

  const handleAddInstructor = async (section_id: string, email: string) => {
    await addCoInstructor(section_id, email);
    await loadClassDetails(); // Reload to get updated instructor list
  };

  const handleRemoveInstructor = async (section_id: string, user_id: string) => {
    await removeCoInstructor(section_id, user_id);
    await loadClassDetails(); // Reload to get updated instructor list
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user || !hasRolePermission(user.role, 'class.read') || !classData) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4">
          <BackButton href="/classes">Back to Classes</BackButton>
        </div>

        <h1 className="text-3xl font-bold text-gray-900">{classData.name}</h1>
        {classData.description && (
          <p className="mt-2 text-gray-600">{classData.description}</p>
        )}
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-900">Sections</h2>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Section
          </button>
        )}
      </div>

      {showCreateForm && (
        <CreateSectionForm
          class_id={class_id}
          className={classData.name}
          onSubmit={handleCreateSection}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {sections.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500 mb-4">No sections yet</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create First Section
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              onRegenerateCode={handleRegenerateCode}
              onAddInstructor={handleAddInstructor}
              onRemoveInstructor={handleRemoveInstructor}
              instructorNames={instructorNames}
            />
          ))}
        </div>
      )}
    </div>
  );
}
