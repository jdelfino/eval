'use client';

/**
 * Layout for fullscreen pages (student code editor).
 * Provides AppShell with collapsed sidebar and no right panels.
 * Redirects to signin if user is not authenticated.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ActiveSessionProvider } from '@/contexts/ActiveSessionContext';
import { PanelProvider } from '@/contexts/PanelContext';
import { AppShell } from '@/components/layout';

export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for auth to load before checking
    if (!isLoading && !user) {
      router.push('/auth/signin');
    }
  }, [user, isLoading, router]);

  // Show loading state while auth is being checked
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Don't render app shell if not authenticated
  if (!user) {
    return null;
  }

  return (
    <ActiveSessionProvider>
      <PanelProvider pageId="fullscreen">
        <AppShell sidebarCollapsed={true} showRightPanels={false} fullscreen={true}>
          {children}
        </AppShell>
      </PanelProvider>
    </ActiveSessionProvider>
  );
}
