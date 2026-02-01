'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useClasses } from '@/hooks/useClasses';
import NamespaceHeader from '@/components/NamespaceHeader';
import ClassList from './components/ClassList';
import CreateClassForm from './components/CreateClassForm';

export default function ClassesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { classes, loading, fetchClasses, createClass } = useClasses();
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/signin');
      return;
    }

    // Allow instructor, namespace-admin, and system-admin roles
    const teachingRoles = ['instructor', 'namespace-admin', 'system-admin'];
    if (user && !teachingRoles.includes(user.role)) {
      router.push('/');
      return;
    }

    if (user) {
      fetchClasses();
    }
  }, [user, authLoading, router, fetchClasses]);

  const handleCreateClass = async (name: string, description: string) => {
    await createClass(name, description);
    setShowCreateForm(false);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  const canViewClasses = user && ['instructor', 'namespace-admin', 'system-admin'].includes(user.role);
  if (!canViewClasses) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Classes</h1>
          <NamespaceHeader className="mt-2" />
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

      <ClassList
        classes={classes}
        onCreateNew={() => setShowCreateForm(true)}
      />
    </div>
  );
}
