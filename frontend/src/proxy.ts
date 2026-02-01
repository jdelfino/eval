/**
 * Next.js Middleware for Supabase Session Refresh
 *
 * Runs on every request (except static assets) to:
 * 1. Refresh expired Supabase auth sessions automatically
 * 2. Update JWT cookies (sb-access-token, sb-refresh-token)
 * 3. Ensure session continuity across page loads
 *
 * This is required for Supabase SSR to work correctly with Next.js.
 *
 * Cookie Flow:
 * 1. Browser sends request with sb-access-token cookie
 * 2. Middleware calls supabase.auth.getSession()
 * 3. If token expired, Supabase refreshes using refresh token
 * 4. Middleware updates response cookies with new tokens
 * 5. Browser receives response with updated cookies
 * 6. Subsequent requests use new cookies
 *
 * This ensures users stay logged in as long as refresh token is valid (~7 days).
 *
 * Performance Expectations:
 * - Valid session: <10ms (just cookie read + validation)
 * - Expired session: <200ms (includes Supabase API call for refresh)
 * - Middleware runs on EVERY matched request
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // Update request cookies so downstream handlers see the new values
          request.cookies.set({
            name,
            value,
            ...options,
          })
          // Update response cookies to send back to client
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          // Remove from request
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          // Remove from response
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Trigger session refresh - getSession() will:
  // - Return existing session if valid
  // - Refresh tokens if expired (using refresh token)
  // - Update cookies via the callbacks above
  await supabase.auth.getSession()

  return response
}

/**
 * Configure which routes the middleware runs on.
 *
 * Runs on all routes EXCEPT:
 * - Static files (_next/static, images, favicon)
 * - Next.js internals
 *
 * INCLUDES:
 * - All API routes (for server-side session validation)
 * - All page routes (for client-side navigation)
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Images and other static assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
