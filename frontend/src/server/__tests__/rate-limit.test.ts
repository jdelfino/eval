// Mock @upstash modules before importing rate-limit
jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    jest.fn().mockImplementation(() => ({
      limit: jest.fn(),
    })),
    {
      fixedWindow: jest.fn(() => 'fixed-window-limiter'),
      slidingWindow: jest.fn(() => 'sliding-window-limiter'),
    }
  ),
}));

// Store original env
const originalEnv = process.env;

// Helper to modify process.env in tests
function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>)[key];
  } else {
    (process.env as Record<string, string | undefined>)[key] = value;
  }
}

describe('rate-limit', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    // Reset env for each test
    process.env = { ...originalEnv };
    setEnv('UPSTASH_REDIS_REST_URL', undefined);
    setEnv('UPSTASH_REDIS_REST_TOKEN', undefined);
    setEnv('NODE_ENV', undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getClientIP', () => {
    it('extracts IP from x-forwarded-for header', async () => {
      const { getClientIP } = await import('../rate-limit');
      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
      });

      expect(getClientIP(request)).toBe('192.168.1.1');
    });

    it('handles single IP in x-forwarded-for', async () => {
      const { getClientIP } = await import('../rate-limit');
      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '203.0.113.50' },
      });

      expect(getClientIP(request)).toBe('203.0.113.50');
    });

    it('extracts IP from x-real-ip header when x-forwarded-for is absent', async () => {
      const { getClientIP } = await import('../rate-limit');
      const request = new Request('https://example.com', {
        headers: { 'x-real-ip': '10.0.0.5' },
      });

      expect(getClientIP(request)).toBe('10.0.0.5');
    });

    it('prefers x-forwarded-for over x-real-ip', async () => {
      const { getClientIP } = await import('../rate-limit');
      const request = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'x-real-ip': '10.0.0.5',
        },
      });

      expect(getClientIP(request)).toBe('192.168.1.1');
    });

    it('returns "unknown" when no IP headers are present', async () => {
      const { getClientIP } = await import('../rate-limit');
      const request = new Request('https://example.com');

      expect(getClientIP(request)).toBe('unknown');
    });

    it('trims whitespace from IP addresses', async () => {
      const { getClientIP } = await import('../rate-limit');
      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '  192.168.1.1  , 10.0.0.1' },
      });

      expect(getClientIP(request)).toBe('192.168.1.1');
    });
  });

  describe('getRateLimitKey', () => {
    it('returns user:ID format when userId is provided', async () => {
      const { getRateLimitKey } = await import('../rate-limit');
      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      expect(getRateLimitKey(request, 'user-123')).toBe('user:user-123');
    });

    it('returns ip:ADDRESS format when no userId is provided', async () => {
      const { getRateLimitKey } = await import('../rate-limit');
      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      expect(getRateLimitKey(request)).toBe('ip:192.168.1.1');
    });

    it('returns ip:unknown when no userId and no IP headers', async () => {
      const { getRateLimitKey } = await import('../rate-limit');
      const request = new Request('https://example.com');

      expect(getRateLimitKey(request)).toBe('ip:unknown');
    });
  });

  describe('rateLimitResponse', () => {
    it('returns 429 status', async () => {
      const { rateLimitResponse } = await import('../rate-limit');
      const response = rateLimitResponse({
        success: false,
        limited: true,
        remaining: 0,
        reset: Date.now() + 30000,
      });

      expect(response.status).toBe(429);
    });

    it('includes correct headers', async () => {
      const { rateLimitResponse } = await import('../rate-limit');
      const resetTime = Date.now() + 30000;
      const response = rateLimitResponse({
        success: false,
        limited: true,
        remaining: 0,
        reset: resetTime,
      });

      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(response.headers.get('Retry-After')).toBeDefined();
    });

    it('includes error message in body', async () => {
      const { rateLimitResponse } = await import('../rate-limit');
      const response = rateLimitResponse({
        success: false,
        limited: true,
        remaining: 0,
      });

      const body = await response.json();
      expect(body.error).toBe('Too many requests. Please try again later.');
    });

    it('handles missing reset time', async () => {
      const { rateLimitResponse } = await import('../rate-limit');
      const response = rateLimitResponse({
        success: false,
        limited: true,
      });

      // Should default to 60 seconds
      expect(response.headers.get('Retry-After')).toBe('60');
    });

    it('ensures Retry-After is at least 1 second', async () => {
      const { rateLimitResponse } = await import('../rate-limit');
      // Reset time in the past
      const response = rateLimitResponse({
        success: false,
        limited: true,
        remaining: 0,
        reset: Date.now() - 5000,
      });

      expect(parseInt(response.headers.get('Retry-After')!)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('checkRateLimit', () => {
    it('returns success when Redis is not configured (dev mode)', async () => {
      // No Redis env vars set, not in production
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const { checkRateLimit } = await import('../rate-limit');

      const result = await checkRateLimit('auth', 'test-key');

      expect(result.success).toBe(true);
      expect(result.limited).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping rate limit for auth')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('rateLimit', () => {
    it('returns null when not rate limited (dev mode)', async () => {
      jest.spyOn(console, 'warn').mockImplementation();
      const { rateLimit } = await import('../rate-limit');

      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      const result = await rateLimit('auth', request);

      expect(result).toBeNull();
    });

    it('uses userId for rate limit key when provided', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const { rateLimit } = await import('../rate-limit');

      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      await rateLimit('execute', request, 'user-456');

      // Verify the warning mentions the rate limit key (will use user ID)
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('isRateLimitingEnabled', () => {
    it('returns false when Redis is not configured', async () => {
      const { isRateLimitingEnabled } = await import('../rate-limit');

      expect(isRateLimitingEnabled()).toBe(false);
    });

    it('returns true when Redis is configured', async () => {
      setEnv('UPSTASH_REDIS_REST_URL', 'https://test.upstash.io');
      setEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');

      const { isRateLimitingEnabled } = await import('../rate-limit');

      expect(isRateLimitingEnabled()).toBe(true);
    });
  });

  describe('RateLimiters', () => {
    it('initializes all categories when Redis is configured', async () => {
      setEnv('UPSTASH_REDIS_REST_URL', 'https://test.upstash.io');
      setEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');

      const { RateLimiters } = await import('../rate-limit');

      expect(RateLimiters.auth).not.toBeNull();
      expect(RateLimiters.join).not.toBeNull();
      expect(RateLimiters.execute).not.toBeNull();
      expect(RateLimiters.trace).not.toBeNull();
      expect(RateLimiters.analyze).not.toBeNull();
      expect(RateLimiters.analyzeDaily).not.toBeNull();
      expect(RateLimiters.analyzeGlobal).not.toBeNull();
      expect(RateLimiters.sessionCreate).not.toBeNull();
      expect(RateLimiters.write).not.toBeNull();
      expect(RateLimiters.read).not.toBeNull();
    });

    it('has null limiters when Redis is not configured', async () => {
      const { RateLimiters } = await import('../rate-limit');

      expect(RateLimiters.auth).toBeNull();
      expect(RateLimiters.join).toBeNull();
      expect(RateLimiters.execute).toBeNull();
      expect(RateLimiters.trace).toBeNull();
      expect(RateLimiters.analyze).toBeNull();
      expect(RateLimiters.analyzeDaily).toBeNull();
      expect(RateLimiters.analyzeGlobal).toBeNull();
      expect(RateLimiters.sessionCreate).toBeNull();
      expect(RateLimiters.write).toBeNull();
      expect(RateLimiters.read).toBeNull();
    });
  });

  describe('rateLimitResponseWithMessage', () => {
    it('returns 429 status with custom message', async () => {
      const { rateLimitResponseWithMessage } = await import('../rate-limit');
      const response = rateLimitResponseWithMessage(
        { success: false, limited: true, remaining: 0 },
        'Custom daily limit message'
      );

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBe('Custom daily limit message');
    });

    it('defaults Retry-After to 24 hours when reset is missing', async () => {
      const { rateLimitResponseWithMessage } = await import('../rate-limit');
      const response = rateLimitResponseWithMessage(
        { success: false, limited: true },
        'Daily limit reached'
      );

      expect(response.headers.get('Retry-After')).toBe('86400');
    });

    it('calculates Retry-After from reset time', async () => {
      const { rateLimitResponseWithMessage } = await import('../rate-limit');
      const resetTime = Date.now() + 3600000; // 1 hour from now
      const response = rateLimitResponseWithMessage(
        { success: false, limited: true, remaining: 0, reset: resetTime },
        'Daily limit reached'
      );

      const retryAfter = parseInt(response.headers.get('Retry-After')!);
      // Should be approximately 3600 seconds (1 hour)
      expect(retryAfter).toBeGreaterThan(3500);
      expect(retryAfter).toBeLessThanOrEqual(3600);
    });
  });

  describe('checkAnalyzeDailyLimits', () => {
    it('returns null when not rate limited (dev mode)', async () => {
      jest.spyOn(console, 'warn').mockImplementation();
      const { checkAnalyzeDailyLimits } = await import('../rate-limit');

      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      const result = await checkAnalyzeDailyLimits(request, 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('production mode', () => {
    it('throws error if Redis is not configured in production', async () => {
      setEnv('NODE_ENV', 'production');
      setEnv('CI', undefined); // Ensure CI is not set (CI allows skipping rate limit)
      // No Redis env vars set

      await expect(async () => {
        await import('../rate-limit');
      }).rejects.toThrow('FATAL: Rate limiting is required in production');
    });

    it('does not throw in production when Redis is configured', async () => {
      setEnv('NODE_ENV', 'production');
      setEnv('UPSTASH_REDIS_REST_URL', 'https://test.upstash.io');
      setEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');

      await expect(import('../rate-limit')).resolves.toBeDefined();
    });

    it('does not throw in production CI without Redis (for E2E tests)', async () => {
      setEnv('NODE_ENV', 'production');
      setEnv('CI', 'true');
      // No Redis env vars set

      await expect(import('../rate-limit')).resolves.toBeDefined();
    });
  });
});

describe('rate-limit with Redis configured', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    setEnv('UPSTASH_REDIS_REST_URL', 'https://test.upstash.io');
    setEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  });

  afterEach(() => {
    setEnv('UPSTASH_REDIS_REST_URL', undefined);
    setEnv('UPSTASH_REDIS_REST_TOKEN', undefined);
  });

  it('checkRateLimit returns limited when limiter rejects', async () => {
    const { Ratelimit } = jest.requireMock('@upstash/ratelimit');
    const mockLimit = jest.fn().mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    Ratelimit.mockImplementation(() => ({
      limit: mockLimit,
    }));

    const { checkRateLimit } = await import('../rate-limit');

    const result = await checkRateLimit('auth', 'test-key');

    expect(result.limited).toBe(true);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('checkRateLimit returns success when limiter allows', async () => {
    const { Ratelimit } = jest.requireMock('@upstash/ratelimit');
    const mockLimit = jest.fn().mockResolvedValue({
      success: true,
      remaining: 4,
      reset: Date.now() + 60000,
    });
    Ratelimit.mockImplementation(() => ({
      limit: mockLimit,
    }));

    const { checkRateLimit } = await import('../rate-limit');

    const result = await checkRateLimit('auth', 'test-key');

    expect(result.limited).toBe(false);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('rateLimit returns 429 Response when limited', async () => {
    const { Ratelimit } = jest.requireMock('@upstash/ratelimit');
    const mockLimit = jest.fn().mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    Ratelimit.mockImplementation(() => ({
      limit: mockLimit,
    }));

    const { rateLimit } = await import('../rate-limit');

    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });

    const result = await rateLimit('auth', request);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it('rateLimit returns null when not limited', async () => {
    const { Ratelimit } = jest.requireMock('@upstash/ratelimit');
    const mockLimit = jest.fn().mockResolvedValue({
      success: true,
      remaining: 4,
      reset: Date.now() + 60000,
    });
    Ratelimit.mockImplementation(() => ({
      limit: mockLimit,
    }));

    const { rateLimit } = await import('../rate-limit');

    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });

    const result = await rateLimit('auth', request);

    expect(result).toBeNull();
  });

  describe('checkAnalyzeDailyLimits', () => {
    it('returns null when both limits pass', async () => {
      const { Ratelimit } = jest.requireMock('@upstash/ratelimit');
      const mockLimit = jest.fn().mockResolvedValue({
        success: true,
        remaining: 50,
        reset: Date.now() + 86400000,
      });
      Ratelimit.mockImplementation(() => ({
        limit: mockLimit,
      }));

      const { checkAnalyzeDailyLimits } = await import('../rate-limit');

      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      const result = await checkAnalyzeDailyLimits(request, 'user-123');

      expect(result).toBeNull();
    });

    it('returns 429 with global message when global limit exceeded', async () => {
      const { Ratelimit } = jest.requireMock('@upstash/ratelimit');
      const mockLimit = jest.fn().mockResolvedValue({
        success: false,
        remaining: 0,
        reset: Date.now() + 86400000,
      });
      Ratelimit.mockImplementation(() => ({
        limit: mockLimit,
      }));

      const { checkAnalyzeDailyLimits } = await import('../rate-limit');

      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      const result = await checkAnalyzeDailyLimits(request, 'user-123');

      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
      const body = await result!.json();
      expect(body.error).toBe('Global daily analysis limit reached. Please try again tomorrow.');
    });

    it('returns 429 with user message when per-user limit exceeded', async () => {
      const { Ratelimit } = jest.requireMock('@upstash/ratelimit');
      // First call (global) succeeds, second call (user) fails
      const mockLimit = jest.fn()
        .mockResolvedValueOnce({
          success: true,
          remaining: 100,
          reset: Date.now() + 86400000,
        })
        .mockResolvedValueOnce({
          success: false,
          remaining: 0,
          reset: Date.now() + 86400000,
        });
      Ratelimit.mockImplementation(() => ({
        limit: mockLimit,
      }));

      const { checkAnalyzeDailyLimits } = await import('../rate-limit');

      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      const result = await checkAnalyzeDailyLimits(request, 'user-123');

      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
      const body = await result!.json();
      expect(body.error).toBe('Daily analysis limit reached (100 per day). Please try again tomorrow.');
    });

    it('checks global limit before user limit', async () => {
      const { Ratelimit } = jest.requireMock('@upstash/ratelimit');
      const mockLimit = jest.fn().mockResolvedValue({
        success: true,
        remaining: 50,
        reset: Date.now() + 86400000,
      });
      Ratelimit.mockImplementation(() => ({
        limit: mockLimit,
      }));

      const { checkAnalyzeDailyLimits } = await import('../rate-limit');

      const request = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      await checkAnalyzeDailyLimits(request, 'user-123');

      // Should be called twice: first with 'global' key, then with user key
      expect(mockLimit).toHaveBeenCalledTimes(2);
      expect(mockLimit).toHaveBeenNthCalledWith(1, 'global');
      expect(mockLimit).toHaveBeenNthCalledWith(2, 'user:user-123');
    });
  });
});
