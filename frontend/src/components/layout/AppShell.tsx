'use client';

/**
 * Application shell — row layout: Sidebar | column(AppBarLite + scrollable main).
 */

import { ReactNode, Suspense } from 'react';
import { AppBarLite } from './AppBarLite';
import { Sidebar } from './Sidebar';
import { PreviewBanner } from '@/components/preview/PreviewBanner';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [collapsed, , toggle] = useSidebarCollapsed();

  return (
    <div className="bg-bg" style={{ height: '100vh', display: 'flex', flexDirection: 'row' }}>
      <Suspense fallback={<div style={{ width: 232 }} />}>
        <Sidebar collapsed={collapsed} onToggleCollapse={toggle} />
      </Suspense>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBarLite />
        <main style={{ flex: 1, overflow: 'auto' }}>
          <PreviewBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
