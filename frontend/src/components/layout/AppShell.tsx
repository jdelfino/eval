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
import { PreviewBanner } from '@/components/preview/PreviewBanner';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import { useLayoutConfig } from '@/contexts/LayoutConfigContext';

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
  /**
   * Force desktop layout regardless of viewport width.
   * Use for instructor pages where browser zoom for projector display
   * should not collapse the sidebar to mobile layout.
   */
  forceDesktop?: boolean;
}

export function AppShell({
  children,
  sidebarCollapsed: sidebarCollapsedProp,
  showRightPanels = true,
  rightPanels,
  fullscreen = false,
  forceDesktop: forceDesktopProp = false,
}: AppShellProps) {
  const [storedCollapsed, , toggleCollapsed] = useSidebarCollapsed();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { forceDesktop: forceDesktopContext } = useLayoutConfig();

  // Use prop override if provided, otherwise use stored state
  const sidebarCollapsed = sidebarCollapsedProp ?? storedCollapsed;

  // forceDesktop can be set via prop (for direct usage) or context (set by instructor pages)
  const forceDesktop = forceDesktopProp || forceDesktopContext;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Global header - fixed height */}
      <GlobalHeader
        onMobileMenuToggle={() => setMobileNavOpen(true)}
        showMobileMenu={true}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop sidebar — always visible when forceDesktop=true to prevent zoom collapse */}
        <div className={`${forceDesktop ? 'block' : 'hidden lg:block'} h-full`}>
          <Suspense fallback={<div className={`bg-white border-r border-gray-200 h-full ${sidebarCollapsed ? 'w-16' : 'w-64'}`} />}>
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={sidebarCollapsedProp === undefined ? toggleCollapsed : undefined}
            />
          </Suspense>
        </div>

        {/* Mobile navigation drawer — only mount when open to avoid running hooks on desktop */}
        {mobileNavOpen && (
          <MobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        )}

        {/* Main content */}
        <main className={`flex-1 flex flex-col ${fullscreen ? 'overflow-hidden' : 'overflow-auto'}`}>
          <PreviewBanner />
          <div className={fullscreen ? 'flex-1 overflow-hidden' : 'flex-1 p-6'}>
            {children}
          </div>
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
