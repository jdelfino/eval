'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useSections } from '@/hooks/useSections';
import { listSectionProblems } from '@/lib/api/section-problems';
import { getActiveSessions } from '@/lib/api/sections';
import { useParallelEnrichment } from '@/hooks/useParallelEnrichment';
import { Pill } from '@/components/ui/Pill';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { MySectionInfo, PublishedProblemWithStatus } from '@/types/api';

// Per-section enrichment data — derived after parallel fetches
interface SectionEnrichment {
  solvedCount: number | null; // null if fetch failed
  totalCount: number | null;  // null if fetch failed
  live: boolean;
}

// Fetch problems + sessions in parallel for one section; degrade on failure.
// getActiveSessions already passes ?status=active so no client-side filtering needed.
async function fetchSectionEnrichment(info: MySectionInfo): Promise<SectionEnrichment> {
  const sectionId = info.section.id;
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

  const live =
    sessionsResult.status === 'fulfilled' && sessionsResult.value.length > 0;

  return { solvedCount, totalCount, live };
}

export default function MySectionsPage() {
  const { user } = useAuth();
  const { sections, loading, error, fetchMySections } = useSections();

  useEffect(() => {
    if (user) {
      fetchMySections();
    }
  }, [user, fetchMySections]);

  // Fan out per-section enrichment fetches using the shared hook.
  // Built-in cancellation and real-identity change detection.
  const { map: enrichmentsRaw } = useParallelEnrichment<MySectionInfo, string, SectionEnrichment>(
    sections,
    (info) => info.section.id,
    fetchSectionEnrichment
  );
  const enrichments = enrichmentsRaw;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" label="Loading sections..." />
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
        <div className="bg-white rounded-lg shadow">
          <EmptyState
            icon="book"
            title="No sections yet"
            blurb="Join a section using a code from your instructor to get started."
            action={
              <Link
                href="/sections/join"
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Join a Section
              </Link>
            }
          />
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
                      <Pill tone="ok" dot className="flex-shrink-0">
                        Live now
                      </Pill>
                    )}
                  </div>

                  {/* Solved count — only when enrichment loaded and data available */}
                  {enc && enc.totalCount !== null && enc.solvedCount !== null && (
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
