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
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <PreviewProvider>
      <PanelProvider pageId="fullscreen">
        <main style={{ height: '100vh', overflow: 'hidden' }}>{children}</main>
      </PanelProvider>
    </PreviewProvider>
  );
}
