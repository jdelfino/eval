'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/hooks/useSections';

export default function MySectionsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { sections, loading, error, fetchMySections } = useSections();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/signin');
      return;
    }
    if (user) {
      fetchMySections();
    }
  }, [user, authLoading, router, fetchMySections]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">My Sections</h1>
        <Link
          href="/sections/join"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Join Section
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {sections.length === 0 && !error ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No sections yet</h2>
          <p className="text-gray-600 mb-6">Join a section using a code from your instructor to get started.</p>
          <Link
            href="/sections/join"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Join a Section
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((info) => (
            <Link
              key={info.section.id}
              href={`/sections/${info.section.id}`}
              className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200"
            >
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{info.section.name}</h2>
                    <p className="text-gray-600 text-sm mt-1">{info.class_name}</p>
                    {info.section.semester && (
                      <span className="inline-block mt-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        {info.section.semester}
                      </span>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
