/**
 * Complete MFA API endpoint.
 *
 * After the browser-side verifyOtp() establishes a Supabase session,
 * this endpoint validates the mfa_pending cookie and completes the flow.
 *
 * Flow:
 * 1. Verify mfa_pending cookie exists and is valid
 * 2. Get current session from request (established by browser verifyOtp)
 * 3. Verify session user's email matches cookie's email
 * 4. Clear mfa_pending cookie
 * 5. Return { user }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getAuthProvider } from '@/server/auth';
import { verifyMfaCookie } from '@/server/auth/mfa-cookie';

/**
 * Get the authenticated Supabase user from request cookies.
 * Uses getUser() for security (validates JWT with Supabase server).
 */
async function getSupabaseUserFromRequest(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return data.user;
}

/**
 * POST /api/auth/complete-mfa
 *
 * Completes MFA verification after browser-side verifyOtp succeeds.
 *
 * Response:
 * - 200: { user }
 * - 401: Not authenticated (no session)
 * - 403: No/invalid mfa_pending cookie or email mismatch
 * - 404: User not found in database
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify mfa_pending cookie exists and is valid
    const mfaCookie = request.cookies.get('mfa_pending')?.value;
    const { email: pendingEmail, valid } = verifyMfaCookie(mfaCookie);

    if (!valid) {
      return NextResponse.json(
        { error: 'MFA session expired' },
        { status: 403 }
      );
    }

    // 2. Get current session (established by browser verifyOtp)
    const supabaseUser = await getSupabaseUserFromRequest(request);

    if (!supabaseUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // 3. Verify emails match
    if (supabaseUser.email !== pendingEmail) {
      return NextResponse.json(
        { error: 'Email mismatch' },
        { status: 403 }
      );
    }

    // 4. Get user profile using Supabase user ID (more reliable than email lookup)
    const authProvider = await getAuthProvider();
    const user = await authProvider.userRepository.getUser(supabaseUser.id);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // 5. Clear mfa_pending cookie, return user
    const response = NextResponse.json({ user });
    response.cookies.delete('mfa_pending');
    return response;
  } catch (error) {
    console.error('[API] Complete MFA error:', error);
    return NextResponse.json(
      { error: 'Failed to complete MFA' },
      { status: 500 }
    );
  }
}
