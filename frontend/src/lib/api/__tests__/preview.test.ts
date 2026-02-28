/**
 * Unit tests for preview API client functions.
 * @jest-environment jsdom
 */

const mockApiDelete = jest.fn();
const mockApiPost = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  setPreviewSectionId: jest.fn(),
}));

import { enterPreview, exitPreview } from '../preview';

describe('preview API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enterPreview', () => {
    it('calls POST /sections/{sectionId}/preview (no /api/v1/ prefix) and returns preview data', async () => {
      const mockResponse = { preview_user_id: 'pu-123', section_id: 'sec-456' };
      mockApiPost.mockResolvedValue(mockResponse);

      const result = await enterPreview('sec-456');

      expect(mockApiPost).toHaveBeenCalledWith('/sections/sec-456/preview');
      expect(result).toEqual(mockResponse);
    });

    it('does not include preview header (called before setPreviewSectionId is set)', async () => {
      const mockResponse = { preview_user_id: 'pu-123', section_id: 'sec-456' };
      mockApiPost.mockResolvedValue(mockResponse);

      await enterPreview('sec-456');

      // apiPost is called normally, no X-Preview-Section header manipulation
      expect(mockApiPost).toHaveBeenCalledTimes(1);
      expect(mockApiPost).toHaveBeenCalledWith('/sections/sec-456/preview');
    });

    it('propagates errors from the API call', async () => {
      const error = new Error('Server error');
      mockApiPost.mockRejectedValue(error);

      await expect(enterPreview('sec-456')).rejects.toThrow('Server error');
    });
  });

  describe('exitPreview', () => {
    it('calls DELETE /sections/{sectionId}/preview via apiDelete (no /api/v1/ prefix)', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await exitPreview('sec-456');

      expect(mockApiDelete).toHaveBeenCalledWith('/sections/sec-456/preview');
    });

    it('does not include the preview header (called after setPreviewSectionId cleared)', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await exitPreview('sec-456');

      // apiDelete is called once, no additional preview header
      expect(mockApiDelete).toHaveBeenCalledTimes(1);
    });

    it('propagates errors from the API call', async () => {
      const error = new Error('Server error');
      mockApiDelete.mockRejectedValue(error);

      await expect(exitPreview('sec-456')).rejects.toThrow('Server error');
    });
  });
});
