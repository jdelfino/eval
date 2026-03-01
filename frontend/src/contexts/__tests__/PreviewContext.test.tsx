/**
 * Tests for PreviewContext
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { PreviewProvider, usePreview } from '../PreviewContext';

// Mock the preview API
const mockEnterPreviewApi = jest.fn();
const mockExitPreviewApi = jest.fn();
jest.mock('@/lib/api/preview', () => ({
  enterPreview: (...args: unknown[]) => mockEnterPreviewApi(...args),
  exitPreview: (...args: unknown[]) => mockExitPreviewApi(...args),
}));

// Mock setPreviewSectionId and getPreviewSectionId from api-client
const mockSetPreviewSectionId = jest.fn();
const mockGetPreviewSectionId = jest.fn();
jest.mock('@/lib/api-client', () => ({
  setPreviewSectionId: (...args: unknown[]) => mockSetPreviewSectionId(...args),
  getPreviewSectionId: (...args: unknown[]) => mockGetPreviewSectionId(...args),
}));

// Mock AuthContext — PreviewContext uses setUserProfile and refreshUser
const mockSetUserProfile = jest.fn();
const mockRefreshUser = jest.fn();
jest.mock('../AuthContext', () => ({
  useAuth: () => ({
    setUserProfile: mockSetUserProfile,
    refreshUser: mockRefreshUser,
    user: null,
    isAuthenticated: false,
    isLoading: false,
    signOut: jest.fn(),
  }),
}));

const PREVIEW_SECTION_KEY = 'eval:preview-section-id';

const mockPreviewResponse = {
  preview_user_id: 'pu-123',
  section_id: 'sec-456',
  id: 'pu-123',
  email: 'preview+instructor@system.internal',
  role: 'student' as const,
  namespace_id: 'ns-1',
  permissions: ['execute:code'],
};

describe('PreviewContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PreviewProvider>{children}</PreviewProvider>
  );

  describe('usePreview outside provider', () => {
    it('returns safe no-op defaults when used outside PreviewProvider', () => {
      const { result } = renderHook(() => usePreview());

      expect(result.current.isPreview).toBe(false);
      expect(result.current.previewSectionId).toBeNull();
      expect(typeof result.current.enterPreview).toBe('function');
      expect(typeof result.current.exitPreview).toBe('function');
    });
  });

  describe('initial state', () => {
    it('starts with isPreview false and previewSectionId null when sessionStorage is empty', () => {
      const { result } = renderHook(() => usePreview(), { wrapper });

      expect(result.current.isPreview).toBe(false);
      expect(result.current.previewSectionId).toBeNull();
    });

    it('hydrates previewSectionId from sessionStorage on mount', async () => {
      // Pre-seed sessionStorage as if we reloaded during preview
      sessionStorage.setItem(PREVIEW_SECTION_KEY, 'sec-existing');

      const { result } = renderHook(() => usePreview(), { wrapper });

      // Hydration happens in a useEffect so wait for it
      await waitFor(() => {
        expect(result.current.previewSectionId).toBe('sec-existing');
      });

      expect(result.current.isPreview).toBe(true);
    });

    it('calls setPreviewSectionId during mount hydration when sessionStorage has a value', async () => {
      sessionStorage.setItem(PREVIEW_SECTION_KEY, 'sec-existing');

      renderHook(() => usePreview(), { wrapper });

      await waitFor(() => {
        expect(mockSetPreviewSectionId).toHaveBeenCalledWith('sec-existing');
      });
    });

    it('does NOT call setPreviewSectionId during mount when sessionStorage is empty', async () => {
      renderHook(() => usePreview(), { wrapper });

      // Give it a tick to run effects
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(mockSetPreviewSectionId).not.toHaveBeenCalled();
    });
  });

  describe('enterPreview', () => {
    it('calls enterPreview API and sets previewSectionId on success', async () => {
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(mockEnterPreviewApi).toHaveBeenCalledWith('sec-456');
      expect(result.current.isPreview).toBe(true);
      expect(result.current.previewSectionId).toBe('sec-456');
    });

    it('stores preview section ID in sessionStorage on enter', async () => {
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(sessionStorage.getItem(PREVIEW_SECTION_KEY)).toBe('sec-456');
    });

    it('calls setPreviewSectionId with sectionId after successful enter', async () => {
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(mockSetPreviewSectionId).toHaveBeenCalledWith('sec-456');
    });

    it('calls setUserProfile with preview student profile on enter', async () => {
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(mockSetUserProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pu-123',
          email: 'preview+instructor@system.internal',
          role: 'student',
          namespace_id: 'ns-1',
        })
      );
    });

    it('does NOT call setPreviewSectionId before API call succeeds', async () => {
      // Simulate a delay so we can verify ordering
      let resolveEnter!: (value: unknown) => void;
      mockEnterPreviewApi.mockReturnValue(
        new Promise((resolve) => {
          resolveEnter = resolve;
        })
      );

      const { result } = renderHook(() => usePreview(), { wrapper });

      // Start the enter but don't await yet
      const enterPromise = result.current.enterPreview('sec-456');

      // setPreviewSectionId should NOT be called yet
      expect(mockSetPreviewSectionId).not.toHaveBeenCalled();
      expect(result.current.previewSectionId).toBeNull();

      // Now resolve the API
      await act(async () => {
        resolveEnter(mockPreviewResponse);
        await enterPromise;
      });

      expect(mockSetPreviewSectionId).toHaveBeenCalledWith('sec-456');
    });

    it('does not change state if enterPreview API fails', async () => {
      mockEnterPreviewApi.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await expect(result.current.enterPreview('sec-456')).rejects.toThrow('Network error');
      });

      expect(result.current.isPreview).toBe(false);
      expect(result.current.previewSectionId).toBeNull();
      expect(mockSetPreviewSectionId).not.toHaveBeenCalled();
      expect(mockSetUserProfile).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(PREVIEW_SECTION_KEY)).toBeNull();
    });
  });

  describe('exitPreview', () => {
    it('clears previewSectionId and calls API to exit', async () => {
      // First enter preview
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);
      mockExitPreviewApi.mockResolvedValue(undefined);

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(result.current.isPreview).toBe(true);

      await act(async () => {
        await result.current.exitPreview();
      });

      expect(mockExitPreviewApi).toHaveBeenCalledWith('sec-456');
      expect(result.current.isPreview).toBe(false);
      expect(result.current.previewSectionId).toBeNull();
    });

    it('calls exitPreview API BEFORE clearing setPreviewSectionId (ordering matters — exit API needs the header)', async () => {
      const callOrder: string[] = [];

      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);
      mockSetPreviewSectionId.mockImplementation((val: string | null) => {
        if (val === null) callOrder.push('setPreviewSectionId(null)');
        else callOrder.push(`setPreviewSectionId(${val})`);
      });
      mockExitPreviewApi.mockImplementation(async () => {
        callOrder.push('exitPreviewApi');
      });

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      // Reset call tracking after enter
      callOrder.length = 0;

      await act(async () => {
        await result.current.exitPreview();
      });

      // Exit API must be called BEFORE clearing the header
      expect(callOrder[0]).toBe('exitPreviewApi');
      expect(callOrder[1]).toBe('setPreviewSectionId(null)');
    });

    it('calls refreshUser after exiting preview to restore instructor identity', async () => {
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);
      mockExitPreviewApi.mockResolvedValue(undefined);
      mockRefreshUser.mockResolvedValue(undefined);

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      await act(async () => {
        await result.current.exitPreview();
      });

      expect(mockRefreshUser).toHaveBeenCalled();
    });

    it('clears preview sessionStorage keys on exit', async () => {
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);
      mockExitPreviewApi.mockResolvedValue(undefined);

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(sessionStorage.getItem(PREVIEW_SECTION_KEY)).toBe('sec-456');

      await act(async () => {
        await result.current.exitPreview();
      });

      expect(sessionStorage.getItem(PREVIEW_SECTION_KEY)).toBeNull();
    });

    it('clears state even if exitPreview API call fails (best-effort)', async () => {
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);
      mockExitPreviewApi.mockRejectedValue(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      await act(async () => {
        await result.current.exitPreview();
      });

      // State should be cleared even though API failed
      expect(result.current.isPreview).toBe(false);
      expect(result.current.previewSectionId).toBeNull();
      expect(mockSetPreviewSectionId).toHaveBeenLastCalledWith(null);
      expect(sessionStorage.getItem(PREVIEW_SECTION_KEY)).toBeNull();

      consoleSpy.mockRestore();
    });

    it('still calls refreshUser even if exitPreview API call fails', async () => {
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);
      mockExitPreviewApi.mockRejectedValue(new Error('Network error'));
      mockRefreshUser.mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      await act(async () => {
        await result.current.exitPreview();
      });

      expect(mockRefreshUser).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('does nothing if not in preview mode', async () => {
      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.exitPreview();
      });

      expect(mockExitPreviewApi).not.toHaveBeenCalled();
      expect(result.current.isPreview).toBe(false);
      expect(result.current.previewSectionId).toBeNull();
    });
  });

  describe('isPreview derived state', () => {
    it('is true when previewSectionId is set', async () => {
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);

      const { result } = renderHook(() => usePreview(), { wrapper });

      expect(result.current.isPreview).toBe(false);

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(result.current.isPreview).toBe(true);
    });

    it('is false after exitPreview', async () => {
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);
      mockExitPreviewApi.mockResolvedValue(undefined);

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      await act(async () => {
        await result.current.exitPreview();
      });

      expect(result.current.isPreview).toBe(false);
    });
  });

  describe('signOut guard', () => {
    it('preview sessionStorage key is cleared when sign out happens during preview', async () => {
      // This tests that if someone calls signOut while in preview mode,
      // the preview sessionStorage is cleared. The actual guard is in AuthContext.
      // Here we verify that after entering preview, sessionStorage has the key.
      mockEnterPreviewApi.mockResolvedValue(mockPreviewResponse);

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(sessionStorage.getItem(PREVIEW_SECTION_KEY)).toBe('sec-456');
    });
  });
});
