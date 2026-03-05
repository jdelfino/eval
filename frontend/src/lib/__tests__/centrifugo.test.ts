/**
 * @jest-environment jsdom
 */

const mockGetAuthHeaders = jest.fn();
const mockGetPreviewSectionId = jest.fn();

jest.mock('@/lib/api-client', () => ({
  getAuthHeaders: () => mockGetAuthHeaders(),
  getPreviewSectionId: () => mockGetPreviewSectionId(),
}));

jest.mock('centrifuge', () => ({
  Centrifuge: jest.fn(),
}));
import { Centrifuge } from 'centrifuge';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockCentrifuge = Centrifuge as unknown as jest.MockedFunction<(...args: any[]) => any>;

import { createCentrifuge, getSubscriptionToken } from '../centrifugo';

describe('centrifugo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockCentrifuge.mockImplementation((url: string, opts: any) => ({ url, opts }));
    mockGetPreviewSectionId.mockReturnValue(null);
  });

  describe('createCentrifuge', () => {
    it('creates a Centrifuge instance with URL derived from window.location (default jsdom)', () => {
      const client = createCentrifuge();
      // When NEXT_PUBLIC_CENTRIFUGO_URL is not set (or empty), createCentrifuge derives the URL
      // from window.location. In jsdom, the default location.host is 'localhost' (without port).
      expect(MockCentrifuge).toHaveBeenCalledWith(
        'ws://localhost/connection/websocket',
        expect.objectContaining({ getToken: expect.any(Function) }),
      );
    });

    it('getToken fetches a token from the API', async () => {
      const headers = { Authorization: 'Bearer tok' };
      mockGetAuthHeaders.mockResolvedValue(headers);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'centrifugo-token' }),
      }) as any;

      createCentrifuge();
      const getToken = MockCentrifuge.mock.calls[0][1].getToken;
      const token = await getToken();

      expect(token).toBe('centrifugo-token');
      expect(global.fetch).toHaveBeenCalledWith(
        '/realtime/token',
        { headers: { Authorization: 'Bearer tok' } },
      );
    });

    it('getToken throws on non-ok response', async () => {
      mockGetAuthHeaders.mockResolvedValue({});
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as any;

      createCentrifuge();
      const getToken = MockCentrifuge.mock.calls[0][1].getToken;

      await expect(getToken()).rejects.toThrow('Failed to get token: 401');
    });

    it('getToken includes X-Preview-Section header when preview is active', async () => {
      mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer tok' });
      mockGetPreviewSectionId.mockReturnValue('sec-preview-123');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'centrifugo-token' }),
      }) as any;

      createCentrifuge();
      const getToken = MockCentrifuge.mock.calls[0][1].getToken;
      await getToken();

      expect(global.fetch).toHaveBeenCalledWith(
        '/realtime/token',
        {
          headers: {
            Authorization: 'Bearer tok',
            'X-Preview-Section': 'sec-preview-123',
          },
        },
      );
    });

    it('getToken does not include X-Preview-Section header when preview is not active', async () => {
      mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer tok' });
      mockGetPreviewSectionId.mockReturnValue(null);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'centrifugo-token' }),
      }) as any;

      createCentrifuge();
      const getToken = MockCentrifuge.mock.calls[0][1].getToken;
      await getToken();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(fetchCall.headers).not.toHaveProperty('X-Preview-Section');
    });
  });

  describe('getSubscriptionToken', () => {
    it('fetches subscription token for a channel', async () => {
      const headers = { Authorization: 'Bearer tok' };
      mockGetAuthHeaders.mockResolvedValue(headers);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'sub-token' }),
      }) as any;

      const token = await getSubscriptionToken('channel:123');

      expect(token).toBe('sub-token');
      expect(global.fetch).toHaveBeenCalledWith(
        '/realtime/token?channel=channel%3A123',
        { headers: { Authorization: 'Bearer tok' } },
      );
    });

    it('throws on non-ok response', async () => {
      mockGetAuthHeaders.mockResolvedValue({});
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as any;

      await expect(getSubscriptionToken('ch')).rejects.toThrow('Failed to get subscription token: 403');
    });

    it('getSubscriptionToken includes X-Preview-Section header when preview is active', async () => {
      mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer tok' });
      mockGetPreviewSectionId.mockReturnValue('sec-preview-456');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'sub-token' }),
      }) as any;

      await getSubscriptionToken('channel:123');

      expect(global.fetch).toHaveBeenCalledWith(
        '/realtime/token?channel=channel%3A123',
        {
          headers: {
            Authorization: 'Bearer tok',
            'X-Preview-Section': 'sec-preview-456',
          },
        },
      );
    });

    it('getSubscriptionToken does not include X-Preview-Section header when preview is not active', async () => {
      mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer tok' });
      mockGetPreviewSectionId.mockReturnValue(null);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'sub-token' }),
      }) as any;

      await getSubscriptionToken('channel:123');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(fetchCall.headers).not.toHaveProperty('X-Preview-Section');
    });
  });
});
