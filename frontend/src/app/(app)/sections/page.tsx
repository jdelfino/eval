'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/hooks/useSections';
import NamespaceHeader from '@/components/NamespaceHeader';
import SectionCard from './components/SectionCard';

export default function SectionsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { sections, loading, fetchMySections, getActiveSessions } = useSections();
  const [groupedSections, setGroupedSections] = useState<Record<string, typeof sections>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/signin');
      return;
    }

    if (user) {
      fetchMySections();
    }
  }, [user, authLoading, router, fetchMySections]);

  useEffect(() => {
    // Group sections by class
    const grouped = sections.reduce((acc, section) => {
      const className = section.className;
      if (!acc[className]) {
        acc[className] = [];
      }
      acc[className].push(section);
      return acc;
    }, {} as Record<string, typeof sections>);

    setGroupedSections(grouped);
  }, [sections]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Sections</h1>
          <NamespaceHeader className="mt-2" />
        </div>
        <button
          onClick={() => router.push('/sections/join')}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Join Section
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <div className="mb-6">
            <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h3 className="text-xl font-medium text-gray-900 mb-2">No sections yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Get started by joining a section using the join code provided by your instructor
          </p>
          <button
            onClick={() => router.push('/sections/join')}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
          >
            <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Join Your First Section
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedSections).map(([className, classSections]) => (
            <div key={className}>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">{className}</h2>
              <div className="space-y-3">
                {classSections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    getActiveSessions={getActiveSessions}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
