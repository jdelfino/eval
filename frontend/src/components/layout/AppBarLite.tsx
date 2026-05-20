'use client';

/**
 * AppBarLite — v4 slim application bar.
 * 40px height. Breadcrumb on left; right side intentionally empty.
 * ConnectionDot lives per-page (T2); Search + Bell killed in G6 plan.
 */

import { PageBreadcrumb } from './PageBreadcrumb';

export function AppBarLite() {
  return (
    <header
      style={{
        height: 40,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-raised)',
        fontSize: 12.5,
        position: 'sticky',
        top: 0,
        zIndex: 5,
      }}
    >
      <PageBreadcrumb />
      <div style={{ flex: 1 }} />
      {/* Right side intentionally empty: ConnectionDot lives per-page (T2); Search + Bell killed in G6 plan */}
    </header>
  );
}
