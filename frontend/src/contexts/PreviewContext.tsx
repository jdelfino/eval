'use client';

/**
 * Preview mode context provider.
 *
 * Manages "Preview as Student" mode state for instructors.
 * When preview is active, all API requests automatically include
 * the X-Preview-Section header via the module-level setter in api-client.
 *
 * Import direction: PreviewContext → api/preview → api-client (no circular dependency).
 * Import direction: PreviewContext → AuthContext (to call setUserProfile/refreshUser).
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { setPreviewSectionId } from '@/lib/api-client';
import { enterPreview as enterPreviewApi, exitPreview as exitPreviewApi } from '@/lib/api/preview';
import { useAuth } from '@/contexts/AuthContext';
import { PREVIEW_SECTION_KEY } from '@/lib/storage-keys';
import type { User } from '@/types/api';

export interface PreviewContextType {
  /** True when instructor is viewing as a student */
  isPreview: boolean;
  /** The section ID being previewed, or null if not in preview mode */
  previewSectionId: string | null;
  /** Enter preview mode for the given section */
  enterPreview: (sectionId: string) => Promise<void>;
  /** Exit preview mode */
  exitPreview: () => Promise<void>;
}

const PreviewContext = createContext<PreviewContextType | undefined>(undefined);

interface PreviewProviderProps {
  children: ReactNode;
}

/**
 * PreviewProvider — wraps the app shell and manages preview mode state.
 * Must be inside AuthProvider.
 */
export function PreviewProvider({ children }: PreviewProviderProps) {
  const [previewSectionId, setPreviewSectionIdState] = useState<string | null>(null);
  const { setUserProfile, refreshUser } = useAuth();

  // Hydrate preview section ID from sessionStorage on mount.
  // MUST be a useEffect (not module-level) — sessionStorage is browser-only and
  // module-level access throws during SSR (server-side rendering).
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(PREVIEW_SECTION_KEY);
      if (stored) {
        setPreviewSectionIdState(stored);
        // Restore the api-client header so subsequent API calls include the preview header
        setPreviewSectionId(stored);
        // Note: the cached user profile in sessionStorage was already swapped when
        // entering preview — AuthContext will read the swapped profile on mount.
      }
    } catch {
      // sessionStorage may be unavailable (e.g., private browsing) — ignore
    }
  }, []);

  const enterPreview = useCallback(async (sectionId: string) => {
    // Call the API first — if it fails, we don't enter preview mode
    const response = await enterPreviewApi(sectionId);

    // Build the preview student's User object for the profile swap
    const previewUser: User = {
      id: response.id,
      external_id: null,
      email: response.email,
      role: response.role,
      namespace_id: response.namespace_id,
      display_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // API succeeded: persist preview section to sessionStorage for page reload recovery
    try {
      sessionStorage.setItem(PREVIEW_SECTION_KEY, sectionId);
    } catch {
      // sessionStorage may be unavailable — ignore
    }

    // Inject the header on all subsequent API requests
    setPreviewSectionId(sectionId);

    // Swap the cached user profile so user.id is the preview student everywhere
    // (AuthContext writes to sessionStorage + in-memory state)
    setUserProfile(previewUser);

    setPreviewSectionIdState(sectionId);
  }, [setUserProfile]);

  const exitPreview = useCallback(async () => {
    const currentSectionId = previewSectionId;
    if (!currentSectionId) {
      return;
    }

    // Best-effort: try to unenroll preview student from the backend.
    // The exit API MUST be called BEFORE clearing the header — the backend
    // needs the X-Preview-Section header to identify the preview student being unenrolled.
    try {
      await exitPreviewApi(currentSectionId);
    } catch (error) {
      console.error('[Preview] Failed to exit preview cleanly:', error);
    }

    // Now clear the header so subsequent requests use the instructor's identity
    setPreviewSectionId(null);
    setPreviewSectionIdState(null);

    // Clear preview sessionStorage keys
    try {
      sessionStorage.removeItem(PREVIEW_SECTION_KEY);
    } catch {
      // sessionStorage may be unavailable — ignore
    }

    // Re-fetch the instructor's real profile to restore the in-memory user
    await refreshUser();
  }, [previewSectionId, refreshUser]);

  const value = useMemo<PreviewContextType>(
    () => ({
      isPreview: previewSectionId !== null,
      previewSectionId,
      enterPreview,
      exitPreview,
    }),
    [previewSectionId, enterPreview, exitPreview]
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

/** Default no-op context for use outside PreviewProvider. */
const defaultPreviewContext: PreviewContextType = {
  isPreview: false,
  previewSectionId: null,
  enterPreview: async () => {},
  exitPreview: async () => {},
};

/**
 * Hook to access preview context.
 * Returns safe no-op defaults when used outside PreviewProvider.
 */
export function usePreview(): PreviewContextType {
  const context = useContext(PreviewContext);
  return context ?? defaultPreviewContext;
}
