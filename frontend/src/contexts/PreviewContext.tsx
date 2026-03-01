'use client';

/**
 * Preview mode context provider.
 *
 * Manages "Preview as Student" mode state for instructors.
 * When preview is active, all API requests automatically include
 * the X-Preview-Section header via the module-level setter in api-client.
 *
 * Import direction: PreviewContext → api/preview → api-client (no circular dependency).
 */

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { setPreviewSectionId } from '@/lib/api-client';
import { enterPreview as enterPreviewApi, exitPreview as exitPreviewApi } from '@/lib/api/preview';

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

  const enterPreview = useCallback(async (sectionId: string) => {
    // Call the API first — if it fails, we don't enter preview mode
    await enterPreviewApi(sectionId);
    // API succeeded: inject the header on all subsequent API requests
    setPreviewSectionId(sectionId);
    setPreviewSectionIdState(sectionId);
  }, []);

  const exitPreview = useCallback(async () => {
    const currentSectionId = previewSectionId;
    if (!currentSectionId) {
      return;
    }

    // Clear the header BEFORE calling the exit API so the DELETE request
    // does not include the preview header (which would swap the identity to
    // the preview student, causing a 403 on the delete endpoint).
    setPreviewSectionId(null);
    setPreviewSectionIdState(null);

    // Best-effort: try to unenroll preview student, but don't block UI on failure
    try {
      await exitPreviewApi(currentSectionId);
    } catch (error) {
      console.error('[Preview] Failed to exit preview cleanly:', error);
    }
  }, [previewSectionId]);

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

/** Default no-op context for use outside PreviewProvider (e.g. fullscreen layout). */
const defaultPreviewContext: PreviewContextType = {
  isPreview: false,
  previewSectionId: null,
  enterPreview: async () => {},
  exitPreview: async () => {},
};

/**
 * Hook to access preview context.
 * Returns safe no-op defaults when used outside PreviewProvider
 * (e.g. in the fullscreen student editor layout).
 */
export function usePreview(): PreviewContextType {
  const context = useContext(PreviewContext);
  return context ?? defaultPreviewContext;
}
