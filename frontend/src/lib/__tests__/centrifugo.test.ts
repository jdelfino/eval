/**
 * @jest-environment jsdom
 */

const mockGetAuthHeaders = jest.fn();

jest.mock('@/lib/api-client', () => ({
  getAuthHeaders: () => mockGetAuthHeaders(),
}));

const MockCentrifuge = jest.fn();
jest.mock('centrifuge', () => ({
  Centrifuge: MockCentrifuge,
}));

import { createCentrifuge, getSubscriptionToken } from '../centrifugo';

describe('centrifugo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockCentrifuge.mockImplementation((url: string, opts: any) => ({ url, opts }));
  });

  describe('createCentrifuge', () => {
    it('creates a Centrifuge instance with the default URL', () => {
      const client = createCentrifuge();
      expect(MockCentrifuge).toHaveBeenCalledWith(
        'ws://localhost:8000/connection/websocket',
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
        { headers },
      );
    });

    it('getToken throws on non-ok response', async () => {
      mockGetAuthHeaders.mockResolvedValue({});
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as any;

      createCentrifuge();
      const getToken = MockCentrifuge.mock.calls[0][1].getToken;

      await expect(getToken()).rejects.toThrow('Failed to get token: 401');
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
        { headers },
      );
    });

    it('throws on non-ok response', async () => {
      mockGetAuthHeaders.mockResolvedValue({});
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as any;

      await expect(getSubscriptionToken('ch')).rejects.toThrow('Failed to get subscription token: 403');
    });
  });
});
