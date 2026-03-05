/**
 * Integration tests for centrifugo client.
 * Mocks centrifuge-js Centrifuge class and firebase, tests real centrifugo module.
 */
export {};

const mockGetIdToken = jest.fn();
const mockCurrentUser = { getIdToken: mockGetIdToken };

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: mockCurrentUser })),
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  firebaseAuth: { currentUser: mockCurrentUser },
}));

// Mock api-client to provide getAuthHeaders and getPreviewSectionId
jest.mock('@/lib/api-client', () => ({
  getAuthHeaders: async () => {
    const user = mockCurrentUser;
    if (!user) throw new Error('No authenticated user');
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  },
  getPreviewSectionId: () => null,
}));

jest.mock('centrifuge', () => ({
  Centrifuge: jest.fn(),
}));
import { Centrifuge } from 'centrifuge';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockCentrifuge = Centrifuge as unknown as jest.MockedFunction<(...args: any[]) => any>;

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: 'http://api.test', NEXT_PUBLIC_CENTRIFUGO_URL: 'ws://rt.test/ws' };
  global.fetch = jest.fn();
  MockCentrifuge.mockImplementation((url: string, opts: any) => ({ url, opts }));
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('centrifugo integration', () => {
  describe('resolveCentrifugoUrl URL derivation', () => {
    it('derives ws:// URL from http location when env var is empty string', () => {
      process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: 'http://api.test', NEXT_PUBLIC_CENTRIFUGO_URL: '' };

      const { resolveCentrifugoUrl } = require('../centrifugo');
      const mockLocation = { protocol: 'http:', host: 'localhost:8080' } as Location;
      const url = resolveCentrifugoUrl(mockLocation.protocol, mockLocation.host);

      expect(url).toBe('ws://localhost:8080/connection/websocket');
    });

    it('derives wss:// URL from https location when env var is empty string', () => {
      process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: 'http://api.test', NEXT_PUBLIC_CENTRIFUGO_URL: '' };

      const { resolveCentrifugoUrl } = require('../centrifugo');
      const mockLocation = { protocol: 'https:', host: 'app.example.com' } as Location;
      const url = resolveCentrifugoUrl(mockLocation.protocol, mockLocation.host);

      expect(url).toBe('wss://app.example.com/connection/websocket');
    });

    it('uses explicit NEXT_PUBLIC_CENTRIFUGO_URL when set', () => {
      process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: 'http://api.test', NEXT_PUBLIC_CENTRIFUGO_URL: 'ws://rt.test/ws' };

      const { resolveCentrifugoUrl } = require('../centrifugo');
      const mockLocation = { protocol: 'http:', host: 'localhost:8080' } as Location;
      const url = resolveCentrifugoUrl(mockLocation.protocol, mockLocation.host);

      expect(url).toBe('ws://rt.test/ws');
    });
  });

  describe('createCentrifuge getToken callback', () => {
    it('calls real fetch with auth headers to get token', async () => {
      mockGetIdToken.mockResolvedValue('fb-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'centrifugo-jwt' }),
      });

      const { createCentrifuge } = require('../centrifugo');
      createCentrifuge();

      const getToken = MockCentrifuge.mock.calls[0][1].getToken;
      const token = await getToken();

      expect(token).toBe('centrifugo-jwt');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://api.test/realtime/token',
        { headers: { Authorization: 'Bearer fb-token' } }
      );
    });
  });

  describe('error handling when token fetch fails', () => {
    it('throws when response is not ok', async () => {
      mockGetIdToken.mockResolvedValue('fb-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const { createCentrifuge } = require('../centrifugo');
      createCentrifuge();

      const getToken = MockCentrifuge.mock.calls[0][1].getToken;
      await expect(getToken()).rejects.toThrow('Failed to get token: 500');
    });
  });

  describe('getSubscriptionToken with channel parameter encoding', () => {
    it('encodes channel in URL', async () => {
      mockGetIdToken.mockResolvedValue('fb-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'sub-jwt' }),
      });

      const { getSubscriptionToken } = require('../centrifugo');
      const token = await getSubscriptionToken('session:abc/def');

      expect(token).toBe('sub-jwt');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://api.test/realtime/token?channel=session%3Aabc%2Fdef',
        { headers: { Authorization: 'Bearer fb-token' } }
      );
    });

    it('encodes special characters properly', async () => {
      mockGetIdToken.mockResolvedValue('fb-token');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'tok' }),
      });

      const { getSubscriptionToken } = require('../centrifugo');
      await getSubscriptionToken('ns:room#1');

      const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(calledUrl).toContain('channel=ns%3Aroom%231');
    });
  });
});
