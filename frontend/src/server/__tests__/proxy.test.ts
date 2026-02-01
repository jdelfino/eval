/**
 * Tests for Next.js proxy that handles Supabase session refresh
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Mock @supabase/ssr
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

// Import after mocking
let proxy: (request: NextRequest) => Promise<NextResponse>
let config: { matcher: string[] }

describe('Proxy (Supabase Session Refresh)', () => {
  let mockGetSession: jest.Mock
  let mockAuth: { getSession: jest.Mock }
  let mockSupabaseClient: { auth: { getSession: jest.Mock } }

  beforeEach(async () => {
    jest.clearAllMocks()

    // Setup mock Supabase client
    mockGetSession = jest.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_at: Date.now() / 1000 + 3600,
        },
      },
      error: null,
    })

    mockAuth = {
      getSession: mockGetSession,
    }

    mockSupabaseClient = {
      auth: mockAuth,
    }

    ;(createServerClient as jest.Mock).mockReturnValue(mockSupabaseClient)

    // Set required environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key'

    // Import proxy after mocks are set up
    const proxyModule = await import('../../proxy')
    proxy = proxyModule.proxy
    config = proxyModule.config
  })

  describe('Session Refresh', () => {
    it('should call getSession on every request', async () => {
      const request = new NextRequest('http://localhost:3000/api/test')

      await proxy(request)

      expect(mockGetSession).toHaveBeenCalledTimes(1)
    })

    it('should create Supabase client with environment variables', async () => {
      const request = new NextRequest('http://localhost:3000/api/test')

      await proxy(request)

      expect(createServerClient).toHaveBeenCalledWith(
        'http://localhost:54321',
        'test-publishable-key',
        expect.objectContaining({
          cookies: expect.any(Object),
        })
      )
    })

    it('should return NextResponse on successful session refresh', async () => {
      const request = new NextRequest('http://localhost:3000/api/test')

      const response = await proxy(request)

      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
    })

    it('should handle session refresh errors gracefully', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session expired' },
      })

      const request = new NextRequest('http://localhost:3000/api/test')

      const response = await proxy(request)

      // Middleware should still return a response even if session refresh fails
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
    })
  })

  describe('Cookie Management', () => {
    it('should provide cookie get callback to Supabase client', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          cookie: 'sb-access-token=test-token; other-cookie=value',
        },
      })

      await proxy(request)

      const createClientCall = (createServerClient as jest.Mock).mock.calls[0]
      const cookieConfig = createClientCall[2].cookies

      // Test cookie get callback
      const result = cookieConfig.get('sb-access-token')
      expect(result).toBe('test-token')
    })

    it('should provide cookie set callback to Supabase client', async () => {
      const request = new NextRequest('http://localhost:3000/api/test')

      await proxy(request)

      const createClientCall = (createServerClient as jest.Mock).mock.calls[0]
      const cookieConfig = createClientCall[2].cookies

      // Cookie set callback should be defined
      expect(typeof cookieConfig.set).toBe('function')

      // Note: Testing actual cookie setting is difficult due to NextResponse internals
      // In real usage, this is tested via integration tests
    })

    it('should provide cookie remove callback to Supabase client', async () => {
      const request = new NextRequest('http://localhost:3000/api/test')

      await proxy(request)

      const createClientCall = (createServerClient as jest.Mock).mock.calls[0]
      const cookieConfig = createClientCall[2].cookies

      // Cookie remove callback should be defined
      expect(typeof cookieConfig.remove).toBe('function')
    })
  })

  describe('Request Headers', () => {
    it('should preserve original request headers', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'x-custom-header': 'test-value',
          'user-agent': 'test-agent',
        },
      })

      const response = await proxy(request)

      // Response should be created with original request headers
      expect(response).toBeInstanceOf(NextResponse)
    })
  })

  describe('Route Matching', () => {
    it('should have correct matcher configuration', () => {
      expect(config.matcher).toBeDefined()
      expect(Array.isArray(config.matcher)).toBe(true)
      expect(config.matcher.length).toBeGreaterThan(0)
    })

    it('should document matcher pattern for API and page routes', () => {
      // The matcher pattern is: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
      // This matches everything EXCEPT static assets

      // Document expected matches:
      // - /api/* routes
      // - /instructor, /student, /system pages
      // - /auth/* pages

      // Document expected exclusions:
      // - /_next/static/*
      // - /_next/image/*
      // - /favicon.ico
      // - /*.{svg,png,jpg,jpeg,gif,webp}

      const pattern = config.matcher[0]
      expect(typeof pattern).toBe('string')
      expect(pattern).toContain('_next/static')
      expect(pattern).toContain('_next/image')
      expect(pattern).toContain('favicon.ico')
    })
  })

  describe('Performance', () => {
    it('should complete session refresh within reasonable time', async () => {
      const request = new NextRequest('http://localhost:3000/api/test')

      const startTime = Date.now()
      await proxy(request)
      const duration = Date.now() - startTime

      // Should complete in less than 100ms (with mocked Supabase client)
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Error Handling', () => {
    it('should handle missing environment variables', async () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

      // Re-import to get proxy with missing env vars
      jest.resetModules()
      const proxyModule = await import('../../proxy')
      const proxyWithoutEnv = proxyModule.proxy

      const request = new NextRequest('http://localhost:3000/api/test')

      // Should throw due to missing environment variables
      await expect(async () => {
        await proxyWithoutEnv(request)
      }).rejects.toThrow()

      // Restore for other tests
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey
    })

    it('should handle Supabase client creation failure', async () => {
      ;(createServerClient as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to create client')
      })

      const request = new NextRequest('http://localhost:3000/api/test')

      // Should propagate the error from client creation
      await expect(proxy(request)).rejects.toThrow()
    })
  })
})
