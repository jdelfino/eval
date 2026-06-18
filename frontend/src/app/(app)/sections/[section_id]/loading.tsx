/**
 * Route-segment loading skeleton for the section overview.
 *
 * Next.js renders this while the section segment
 * (`sections/[section_id]/page.tsx`) loads on initial navigation. The section
 * overview is a header + a primary content column (live/sessions list) with a
 * supporting sidebar of summary stats, so the skeleton follows the same
 * multi-region LoadingDashboardAE shape: header block, accent banner row, and a
 * 2fr/1fr grid composed from the shared T5a Skeleton presets.
 *
 * Note: the section page also has an in-component, data-driven loading state
 * (its useEffect fetch). That spinner is intentionally kept — route-segment
 * loading only covers the initial navigation, not the client-side refetch.
 */

import React from 'react';
import { Skeleton, SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton';

export default function SectionLoading() {
  return (
    <div className="space-y-6" aria-hidden="true" role="presentation">
      {/* Header: back link / title / subtitle bars */}
      <div className="space-y-2.5">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>

      {/* Accent banner row: live/current-session strip */}
      <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-3.5">
        <Skeleton className="h-2.5 w-2.5 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3 w-52" />
          <Skeleton className="h-2.5 w-32" />
        </div>
        <Skeleton className="h-7 w-24 rounded-md" />
      </div>

      {/* 2fr / 1fr grid: sessions/problems list (left) + summary stats (right) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-3.5 md:col-span-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonRow
              key={i}
              className={i > 1 ? 'border-t border-gray-200' : ''}
            />
          ))}
        </div>
        <SkeletonCard lines={5} />
      </div>
    </div>
  );
}
