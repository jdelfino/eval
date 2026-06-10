'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/hooks/useSections';
import { listSectionProblems } from '@/lib/api/section-problems';
import { getActiveSessions } from '@/lib/api/sections';
import type { MySectionInfo, PublishedProblemWithStatus, Session } from '@/types/api';

// Per-section enrichment data — derived after parallel fetches
interface SectionEnrichment {
  solvedCount: number | null; // null if fetch failed
  totalCount: number | null;  // null if fetch failed
  live: boolean;
  activeSessionId: string | null;
}

// Fetch problems + sessions in parallel for one section; degrade on failure
async function fetchSectionEnrichment(sectionId: string): Promise<SectionEnrichment> {
  const [problemsResult, sessionsResult] = await Promise.allSettled([
    listSectionProblems(sectionId),
    getActiveSessions(sectionId),
  ]);

  let solvedCount: number | null = null;
  let totalCount: number | null = null;
  if (problemsResult.status === 'fulfilled') {
    const problems: PublishedProblemWithStatus[] = problemsResult.value;
    totalCount = problems.length;
    solvedCount = problems.filter(
      (p) => p.student_work?.last_run_all_passed === true
    ).length;
  }

  let live = false;
  let activeSessionId: string | null = null;
  if (sessionsResult.status === 'fulfilled') {
    const activeSessions: Session[] = sessionsResult.value.filter(
      (s) => s.status === 'active'
    );
    live = activeSessions.length > 0;
    activeSessionId = activeSessions.length > 0 ? activeSessions[0].id : null;
  }

  return { solvedCount, totalCount, live, activeSessionId };
}

export default function MySectionsPage() {
  const { user } = useAuth();
  const { sections, loading, error, fetchMySections } = useSections();
  const [enrichments, setEnrichments] = useState<Record<string, SectionEnrichment>>({});
  const [enrichmentLoaded, setEnrichmentLoaded] = useState(false);

  useEffect(() => {
    if (user) {
      fetchMySections();
    }
  }, [user, fetchMySections]);

  // Once sections list loads, fan out per-section enrichment fetches in parallel
  useEffect(() => {
    if (loading || sections.length === 0) {
      if (!loading) setEnrichmentLoaded(true);
      return;
    }

    let cancelled = false;
    const run = async () => {
      const results = await Promise.allSettled(
        sections.map((info: MySectionInfo) =>
          fetchSectionEnrichment(info.section.id).then((e) => ({
            id: info.section.id,
            enrichment: e,
          }))
        )
      );

      if (cancelled) return;

      const map: Record<string, SectionEnrichment> = {};
      for (const result of results) {
        if (result.status === 'fulfilled') {
          map[result.value.id] = result.value.enrichment;
        }
      }
      setEnrichments(map);
      setEnrichmentLoaded(true);
    };

    run();
    return () => { cancelled = true; };
  }, [sections, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Sections</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sections you&apos;re enrolled in. A live session pulls you straight into it.
          </p>
        </div>
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
        /* Empty state */
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No sections yet</h2>
          <p className="text-gray-600 mb-6">
            Join a section using a code from your instructor to get started.
          </p>
          <Link
            href="/sections/join"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Join a Section
          </Link>
        </div>
      ) : (
        /* Section cards grid */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sections.map((info) => {
            const enc = enrichments[info.section.id];
            const isLive = enc?.live ?? false;

            return (
              <div
                key={info.section.id}
                className="relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Live top-bar */}
                {isLive && (
                  <div
                    data-testid="live-top-bar"
                    className="absolute top-0 left-0 right-0 h-1 bg-green-500"
                  />
                )}

                <div className="p-5">
                  {/* Section header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 leading-tight">
                        {info.section.name}
                      </h2>
                      <p className="text-xs text-gray-500 mt-1">{info.class_name}</p>
                    </div>
                    {isLive && (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                        Live now
                      </span>
                    )}
                  </div>

                  {/* Solved count — only when enrichment loaded and data available */}
                  {enrichmentLoaded && enc && enc.totalCount !== null && enc.solvedCount !== null && (
                    <div className="mt-3 text-sm text-gray-500">
                      {`${enc.solvedCount} / ${enc.totalCount} solved`}
                    </div>
                  )}

                  {/* CTAs */}
                  <div className="mt-4 flex items-center gap-2">
                    {isLive && (
                      <Link
                        href={`/sections/${info.section.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Jump in
                      </Link>
                    )}
                    <Link
                      href={`/sections/${info.section.id}`}
                      className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      Practice problems →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
