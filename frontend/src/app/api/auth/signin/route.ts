/**
 * POST /api/auth/signin
 * Authenticate a user with email and password.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { rateLimit } from '@/server/rate-limit';
import { signMfaCookie } from '@/server/auth/mfa-cookie';

export async function POST(request: NextRequest) {
  // Rate limit by IP to prevent brute force attacks
  const limited = await rateLimit('auth', request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const authProvider = await getAuthProvider();
    const user = await authProvider.authenticateWithPassword(email.trim(), password);

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if MFA required for system-admin
    if (user.role === 'system-admin') {
      // Sign out to clear the session (MFA will re-establish it)
      const supabase = await authProvider.getSupabaseClient('server');
      await supabase.auth.signOut();

      // Set signed MFA pending cookie
      const mfaCookie = signMfaCookie(email.trim());
      const response = NextResponse.json({ mfaRequired: true, email: email.trim() });
      response.cookies.set('mfa_pending', mfaCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 5 * 60, // 5 minutes
      });
      return response;
    }

    // Non-admin users: return user directly
    // Supabase sets JWT cookies automatically via SSR helpers
    return NextResponse.json({ user });
  } catch (error) {
    console.error('[API] Sign in error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
