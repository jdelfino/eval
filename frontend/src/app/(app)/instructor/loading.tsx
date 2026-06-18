/**
 * Route-segment loading skeleton for the instructor dashboard.
 *
 * Next.js renders this automatically while the dashboard segment
 * (`instructor/page.tsx`) loads on initial navigation, replacing the previous
 * inline "Loading..." text. Layout mirrors LoadingDashboardAE from
 * `docs/design/handoff/v4/v4-empty-error.jsx`: a header skel block, an accent
 * banner row, then a 2fr/1fr grid (left: list of skeleton rows; right: a small
 * key/value skeleton list). Composed entirely from the shared T5a Skeleton
 * presets so there is no hand-rolled shimmer.
 */

import React from 'react';
import { Skeleton, SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-hidden="true" role="presentation">
      {/* Header: eyebrow / title / subtitle bars */}
      <div className="space-y-2.5">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-3 w-[420px] max-w-full" />
      </div>

      {/* Accent banner row: dot + two lines + button chip */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-bg-sunken p-3.5">
        <Skeleton className="h-2.5 w-2.5 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-2.5 w-28" />
        </div>
        <Skeleton className="h-7 w-28 rounded-md" />
      </div>

      {/* 2fr / 1fr grid: row list (left) + key/value list (right) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-bg-raised p-3.5 md:col-span-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonRow
              key={i}
              className={i > 1 ? 'border-t border-border' : ''}
            />
          ))}
        </div>
        <SkeletonCard lines={5} />
      </div>
    </div>
  );
}
