'use client';

/**
 * AppBarLite — 40px slim application bar with breadcrumb on the left.
 * Per-page connection indicators render in page content, not here.
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
    </header>
  );
}
