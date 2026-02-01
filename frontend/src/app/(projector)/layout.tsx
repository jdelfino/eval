'use client';

/**
 * Layout for projector/public-view pages.
 * Minimal shell: header + full-bleed content, no sidebar or mobile nav.
 * Designed for projection where browser zoom should not trigger mobile layout.
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ActiveSessionProvider } from '@/contexts/ActiveSessionContext';
import { GlobalHeader } from '@/components/layout/GlobalHeader';

export default function ProjectorLayout({ children }: { children: React.ReactNode }) {
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
    <ActiveSessionProvider>
      <div className="h-screen flex flex-col bg-gray-50">
        <GlobalHeader showMobileMenu={false} />
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </ActiveSessionProvider>
  );
}
