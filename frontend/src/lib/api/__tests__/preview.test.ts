/**
 * Unit tests for preview API client functions.
 * @jest-environment jsdom
 */

const mockApiFetch = jest.fn();
const mockApiPost = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  setPreviewSectionId: jest.fn(),
}));

import { enterPreview, exitPreview } from '../preview';

describe('preview API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enterPreview', () => {
    it('calls POST /api/v1/sections/{sectionId}/preview and returns preview data', async () => {
      const mockResponse = { preview_user_id: 'pu-123', section_id: 'sec-456' };
      mockApiPost.mockResolvedValue(mockResponse);

      const result = await enterPreview('sec-456');

      expect(mockApiPost).toHaveBeenCalledWith('/api/v1/sections/sec-456/preview');
      expect(result).toEqual(mockResponse);
    });

    it('does not include preview header (called before setPreviewSectionId is set)', async () => {
      const mockResponse = { preview_user_id: 'pu-123', section_id: 'sec-456' };
      mockApiPost.mockResolvedValue(mockResponse);

      await enterPreview('sec-456');

      // apiPost is called normally, no X-Preview-Section header manipulation
      expect(mockApiPost).toHaveBeenCalledTimes(1);
      expect(mockApiPost).toHaveBeenCalledWith('/api/v1/sections/sec-456/preview');
    });

    it('propagates errors from the API call', async () => {
      const error = new Error('Server error');
      mockApiPost.mockRejectedValue(error);

      await expect(enterPreview('sec-456')).rejects.toThrow('Server error');
    });
  });

  describe('exitPreview', () => {
    it('calls DELETE /api/v1/sections/{sectionId}/preview via apiFetch', async () => {
      const mockDeleteResponse = { ok: true, json: jest.fn() } as unknown as Response;
      mockApiFetch.mockResolvedValue(mockDeleteResponse);

      await exitPreview('sec-456');

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/sections/sec-456/preview',
        { method: 'DELETE' }
      );
    });

    it('does not include the preview header (called after setPreviewSectionId cleared)', async () => {
      const mockDeleteResponse = { ok: true, json: jest.fn() } as unknown as Response;
      mockApiFetch.mockResolvedValue(mockDeleteResponse);

      await exitPreview('sec-456');

      // apiFetch is called once with DELETE method, no additional preview header
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });

    it('propagates errors from the API call', async () => {
      const error = new Error('Server error');
      mockApiFetch.mockRejectedValue(error);

      await expect(exitPreview('sec-456')).rejects.toThrow('Server error');
    });
  });
});
