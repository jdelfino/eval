'use client';

/**
 * Layout for fullscreen pages (student code editor).
 * Bare layout: full-bleed content within PreviewProvider + PanelProvider.
 * No AppShell/sidebar — workspace renders full-bleed per v4 design.
 * Redirects to signin if user is not authenticated.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { PanelProvider } from '@/contexts/PanelContext';
import { PreviewProvider } from '@/contexts/PreviewContext';
import { PreviewBanner } from '@/components/preview/PreviewBanner';

export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/signin');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-accent border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <PreviewProvider>
      <PanelProvider pageId="fullscreen">
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <PreviewBanner />
          <main style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>{children}</main>
        </div>
      </PanelProvider>
    </PreviewProvider>
  );
}
