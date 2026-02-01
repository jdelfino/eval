'use client';

/**
 * Instructor Problems Page
 *
 * Displays the problem library for instructors to manage and create problems.
 * Uses the ProblemLibrary component for the main UI.
 */

import React, { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProblemLibrary from '../components/ProblemLibrary';
import ProblemCreator from '../components/ProblemCreator';
import NamespaceHeader from '@/components/NamespaceHeader';

function ProblemsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const editParam = searchParams.get('edit');
  const showCreator = editParam !== null;
  const editingProblemId = editParam && editParam !== 'new' ? editParam : null;

  const handleCreateNew = () => {
    router.push('/instructor/problems?edit=new');
  };

  const handleEdit = (problemId: string) => {
    router.push(`/instructor/problems?edit=${problemId}`);
  };

  const handleCloseCreator = useCallback(() => {
    router.push('/instructor/problems');
  }, [router]);

  if (showCreator) {
    return (
      <div className="h-full flex flex-col -m-6">
        <ProblemCreator
          problemId={editingProblemId}
          onCancel={handleCloseCreator}
          onProblemCreated={handleCloseCreator}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <NamespaceHeader className="text-sm" />
      </div>

      {/* Main content */}
      <ProblemLibrary
        onCreateNew={handleCreateNew}
        onEdit={handleEdit}
      />
    </div>
  );
}

export default function ProblemsPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ProblemsPage />
    </Suspense>
  );
}
