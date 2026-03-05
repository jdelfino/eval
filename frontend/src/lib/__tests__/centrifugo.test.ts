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

  describe('resolveCentrifugoUrl', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('uses NEXT_PUBLIC_CENTRIFUGO_URL when set', async () => {
      process.env.NEXT_PUBLIC_CENTRIFUGO_URL = 'wss://eval.example.com/connection/websocket';
      jest.mock('@/lib/api-client', () => ({
        getAuthHeaders: () => mockGetAuthHeaders(),
        getPreviewSectionId: () => mockGetPreviewSectionId(),
      }));
      jest.mock('centrifuge', () => ({ Centrifuge: jest.fn() }));
      const { Centrifuge: MockCentrifugeLocal } = await import('centrifuge');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const MockCentrifugeLocalTyped = MockCentrifugeLocal as unknown as jest.MockedFunction<(...args: any[]) => any>;
      MockCentrifugeLocalTyped.mockImplementation((url: string) => ({ url }));

      const { createCentrifuge: createCentrifugeLocal } = await import('../centrifugo');
      createCentrifugeLocal();

      expect(MockCentrifugeLocalTyped).toHaveBeenCalledWith(
        'wss://eval.example.com/connection/websocket',
        expect.any(Object),
      );
    });

    it('derives ws: WebSocket URL from window.location (http) when NEXT_PUBLIC_CENTRIFUGO_URL is empty', async () => {
      process.env.NEXT_PUBLIC_CENTRIFUGO_URL = '';
      // jsdom sets window.location.protocol = 'http:' and host = 'localhost'
      jest.mock('@/lib/api-client', () => ({
        getAuthHeaders: () => mockGetAuthHeaders(),
        getPreviewSectionId: () => mockGetPreviewSectionId(),
      }));
      jest.mock('centrifuge', () => ({ Centrifuge: jest.fn() }));
      const { Centrifuge: MockCentrifugeLocal } = await import('centrifuge');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const MockCentrifugeLocalTyped = MockCentrifugeLocal as unknown as jest.MockedFunction<(...args: any[]) => any>;
      MockCentrifugeLocalTyped.mockImplementation((url: string) => ({ url }));

      const { createCentrifuge: createCentrifugeLocal } = await import('../centrifugo');
      createCentrifugeLocal();

      // jsdom has http: protocol, so derived URL should use ws: and be based on window.location.host
      const calledUrl = MockCentrifugeLocalTyped.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/^ws:\/\/.+\/connection\/websocket$/);
      expect(calledUrl).toBe(`ws://${window.location.host}/connection/websocket`);
    });

    it('derives wss: URL from resolveCentrifugoUrl when protocol is https', async () => {
      process.env.NEXT_PUBLIC_CENTRIFUGO_URL = '';
      // Test the function logic directly by exporting and calling resolveCentrifugoUrl
      jest.mock('@/lib/api-client', () => ({
        getAuthHeaders: () => mockGetAuthHeaders(),
        getPreviewSectionId: () => mockGetPreviewSectionId(),
      }));
      jest.mock('centrifuge', () => ({ Centrifuge: jest.fn() }));

      const { resolveCentrifugoUrl } = await import('../centrifugo');

      // Simulate https protocol using the exported function with a mocked window
      const result = resolveCentrifugoUrl('https:', 'eval.example.com');
      expect(result).toBe('wss://eval.example.com/connection/websocket');
    });

    it('derives ws: URL from resolveCentrifugoUrl when protocol is http', async () => {
      process.env.NEXT_PUBLIC_CENTRIFUGO_URL = '';
      jest.mock('@/lib/api-client', () => ({
        getAuthHeaders: () => mockGetAuthHeaders(),
        getPreviewSectionId: () => mockGetPreviewSectionId(),
      }));
      jest.mock('centrifuge', () => ({ Centrifuge: jest.fn() }));

      const { resolveCentrifugoUrl } = await import('../centrifugo');

      const result = resolveCentrifugoUrl('http:', 'localhost:8080');
      expect(result).toBe('ws://localhost:8080/connection/websocket');
    });
  });

  describe('createCentrifuge', () => {
    it('creates a Centrifuge instance using resolveCentrifugoUrl', () => {
      const client = createCentrifuge();
      // When NEXT_PUBLIC_CENTRIFUGO_URL is not set (or empty), createCentrifuge derives the URL
      // from window.location. In jsdom, the default location.host is 'localhost' (without port).
      expect(MockCentrifuge).toHaveBeenCalledWith(
        expect.stringMatching(/^wss?:\/\/.+\/connection\/websocket$/),
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
