/**
 * POST /api/auth/register
 * Register a new user account.
 *
 * IMPORTANT: Open registration is DISABLED.
 * - Students must use /api/auth/register-student with a section join code
 * - Instructors and namespace-admins must use invitation links
 * - Only the initial system-admin can be created here via SYSTEM_ADMIN_EMAIL
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { rateLimit } from '@/server/rate-limit';

export async function POST(request: NextRequest) {
  // Rate limit by IP to prevent abuse
  const limited = await rateLimit('auth', request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const { email, password } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Only allow system-admin bootstrap via SYSTEM_ADMIN_EMAIL
    if (email !== process.env.SYSTEM_ADMIN_EMAIL) {
      return NextResponse.json(
        {
          error: 'Open registration is disabled',
          message: 'Please use a section join code to register as a student, or check your email for an invitation link.',
        },
        { status: 403 }
      );
    }

    // System-admin bootstrap
    const authProvider = await getAuthProvider();
    const _user = await authProvider.signUp(
      email,
      password,
      'system-admin',
      null
    );

    // Do not auto-sign-in - user must sign in separately (triggers MFA for system-admin)
    return NextResponse.json(
      { success: true, message: 'Account created. Please sign in.' },
      { status: 201 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '';
    console.error('[API] Registration error:', error);

    if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Pass through auth validation errors (password too weak/short, etc.)
    if (errorMessage.toLowerCase().includes('password')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
