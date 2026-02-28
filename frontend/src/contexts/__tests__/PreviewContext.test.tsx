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

// Mock setPreviewSectionId from api-client
const mockSetPreviewSectionId = jest.fn();
jest.mock('@/lib/api-client', () => ({
  setPreviewSectionId: (...args: unknown[]) => mockSetPreviewSectionId(...args),
}));

describe('PreviewContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    it('starts with isPreview false and previewSectionId null', () => {
      const { result } = renderHook(() => usePreview(), { wrapper });

      expect(result.current.isPreview).toBe(false);
      expect(result.current.previewSectionId).toBeNull();
    });
  });

  describe('enterPreview', () => {
    it('calls enterPreview API and sets previewSectionId on success', async () => {
      mockEnterPreviewApi.mockResolvedValue({
        preview_user_id: 'pu-123',
        section_id: 'sec-456',
      });

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(mockEnterPreviewApi).toHaveBeenCalledWith('sec-456');
      expect(result.current.isPreview).toBe(true);
      expect(result.current.previewSectionId).toBe('sec-456');
    });

    it('calls setPreviewSectionId with sectionId after successful enter', async () => {
      mockEnterPreviewApi.mockResolvedValue({
        preview_user_id: 'pu-123',
        section_id: 'sec-456',
      });

      const { result } = renderHook(() => usePreview(), { wrapper });

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(mockSetPreviewSectionId).toHaveBeenCalledWith('sec-456');
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
        resolveEnter({ preview_user_id: 'pu-123', section_id: 'sec-456' });
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
    });
  });

  describe('exitPreview', () => {
    it('clears previewSectionId and calls API to exit', async () => {
      // First enter preview
      mockEnterPreviewApi.mockResolvedValue({
        preview_user_id: 'pu-123',
        section_id: 'sec-456',
      });
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

    it('calls setPreviewSectionId(null) BEFORE calling exitPreview API', async () => {
      const callOrder: string[] = [];

      mockEnterPreviewApi.mockResolvedValue({
        preview_user_id: 'pu-123',
        section_id: 'sec-456',
      });
      mockSetPreviewSectionId.mockImplementation(() => {
        callOrder.push('setPreviewSectionId');
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

      expect(callOrder[0]).toBe('setPreviewSectionId');
      expect(callOrder[1]).toBe('exitPreviewApi');
      expect(mockSetPreviewSectionId).toHaveBeenLastCalledWith(null);
    });

    it('clears state even if exitPreview API call fails (best-effort)', async () => {
      mockEnterPreviewApi.mockResolvedValue({
        preview_user_id: 'pu-123',
        section_id: 'sec-456',
      });
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
      mockEnterPreviewApi.mockResolvedValue({
        preview_user_id: 'pu-123',
        section_id: 'sec-456',
      });

      const { result } = renderHook(() => usePreview(), { wrapper });

      expect(result.current.isPreview).toBe(false);

      await act(async () => {
        await result.current.enterPreview('sec-456');
      });

      expect(result.current.isPreview).toBe(true);
    });

    it('is false after exitPreview', async () => {
      mockEnterPreviewApi.mockResolvedValue({
        preview_user_id: 'pu-123',
        section_id: 'sec-456',
      });
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
});
