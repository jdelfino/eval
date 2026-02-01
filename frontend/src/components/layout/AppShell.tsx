'use client';

/**
 * Main application shell component.
 * Provides the overall layout structure with header, sidebar, content, and panels.
 */

import { useState, ReactNode, Suspense } from 'react';
import { GlobalHeader } from './GlobalHeader';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { RightPanelContainer } from './RightPanelContainer';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';

interface AppShellProps {
  /** Main page content */
  children: ReactNode;
  /** Sidebar collapsed state override (true for fullscreen pages) */
  sidebarCollapsed?: boolean;
  /** Show right panel container (false for fullscreen pages) */
  showRightPanels?: boolean;
  /** Right panel content */
  rightPanels?: ReactNode;
  /** Fullscreen mode: no padding, no scroll on main content area */
  fullscreen?: boolean;
}

export function AppShell({
  children,
  sidebarCollapsed: sidebarCollapsedProp,
  showRightPanels = true,
  rightPanels,
  fullscreen = false,
}: AppShellProps) {
  const [storedCollapsed, , toggleCollapsed] = useSidebarCollapsed();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Use prop override if provided, otherwise use stored state
  const sidebarCollapsed = sidebarCollapsedProp ?? storedCollapsed;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Global header - fixed height */}
      <GlobalHeader
        onMobileMenuToggle={() => setMobileNavOpen(true)}
        showMobileMenu={true}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:block h-full">
          <Suspense fallback={<div className={`bg-white border-r border-gray-200 h-full ${sidebarCollapsed ? 'w-16' : 'w-64'}`} />}>
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={sidebarCollapsedProp === undefined ? toggleCollapsed : undefined}
            />
          </Suspense>
        </div>

        {/* Mobile navigation drawer */}
        <Suspense fallback={null}>
          <MobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        </Suspense>

        {/* Main content */}
        <main className={`flex-1 ${fullscreen ? 'overflow-hidden' : 'overflow-auto p-6'}`}>
          {children}
        </main>

        {/* Right panels */}
        {showRightPanels && rightPanels && (
          <div className="hidden xl:block">
            <RightPanelContainer>{rightPanels}</RightPanelContainer>
          </div>
        )}
      </div>
    </div>
  );
}
