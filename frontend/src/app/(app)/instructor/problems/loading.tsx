/**
 * Route-segment loading skeleton for the problem library.
 *
 * Next.js renders this while the library segment
 * (`instructor/problems/page.tsx`) loads on initial navigation, replacing the
 * previous inline "Loading..." text. The library is a header + a toolbar
 * (search / "Author a problem") above a grid of problem cards, so the skeleton
 * follows the LoadingDashboardAE language with header bars, an accent toolbar
 * row, and a card grid composed from the shared T5a Skeleton presets.
 */

import React from 'react';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';

export default function LibraryLoading() {
  return (
    <div className="space-y-6" aria-hidden="true" role="presentation">
      {/* Header: eyebrow / title / subtitle bars */}
      <div className="space-y-2.5">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-6 w-60" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>

      {/* Toolbar row: search field + author button chip */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-bg-sunken p-3.5">
        <Skeleton className="h-9 flex-1 rounded-md" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      {/* Card grid: the problem library tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonCard key={i} lines={4} />
        ))}
      </div>
    </div>
  );
}
