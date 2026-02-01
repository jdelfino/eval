/**
 * API routes for student self-registration via section join codes
 *
 * Flow:
 * 1. Student gets join code from instructor
 * 2. GET /api/auth/register-student?code=X validates code and returns section info
 * 3. Student fills out registration form
 * 4. POST /api/auth/register-student creates account, enrolls in section, and auto-logs in
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  getStudentRegistrationService,
} from '@/server/invitations';
import { getSupabaseClient } from '@/server/supabase/client';
import { rateLimit } from '@/server/rate-limit';

/**
 * GET /api/auth/register-student?code=X
 *
 * Validates a section join code and returns section/class info.
 * This is called before showing the registration form.
 *
 * Query params:
 * - code: Section join code (required)
 *
 * Response:
 * - 200: { section, class, namespace, capacityAvailable }
 * - 400: Invalid or missing code, or section inactive
 */
export async function GET(request: NextRequest) {
  // Rate limit by IP to prevent join code brute force attacks
  const limited = await rateLimit('join', request);
  if (limited) return limited;

  try {
    const code = request.nextUrl.searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { error: 'Join code is required', code: 'MISSING_CODE' },
        { status: 400 }
      );
    }

    // Use service_role for public endpoint (no authenticated user yet)
    const supabase = getSupabaseClient();

    // Validate join code by looking up section
    const { data: section, error: sectionError } = await supabase
      .from('sections')
      .select('*')
      .eq('join_code', code)
      .single();

    if (sectionError || !section) {
      return NextResponse.json(
        { error: 'Invalid join code', code: 'INVALID_CODE' },
        { status: 400 }
      );
    }

    if (!section.active) {
      return NextResponse.json(
        { error: 'This section is no longer accepting new students', code: 'SECTION_INACTIVE' },
        { status: 400 }
      );
    }

    // Get namespace info
    const { data: namespace, error: namespaceError } = await supabase
      .from('namespaces')
      .select('*')
      .eq('id', section.namespace_id)
      .single();

    if (namespaceError || !namespace) {
      return NextResponse.json(
        { error: 'Organization not found', code: 'NAMESPACE_NOT_FOUND' },
        { status: 400 }
      );
    }

    // Get class info for the section
    const { data: classInfo } = await supabase
      .from('classes')
      .select('*')
      .eq('id', section.class_id)
      .single();

    // Get instructor info for display (from section_memberships table)
    const { data: instructorMemberships } = await supabase
      .from('section_memberships')
      .select('user_id')
      .eq('section_id', section.id)
      .eq('role', 'instructor')
      .limit(3);

    const instructors = [];
    for (const membership of instructorMemberships || []) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .eq('id', membership.user_id)
        .single();
      if (profile) {
        instructors.push({
          id: profile.id,
          displayName: profile.display_name || 'Instructor',
        });
      }
    }

    // Check capacity (simplified - just count students in namespace)
    const { count: studentCount } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('namespace_id', section.namespace_id)
      .eq('role', 'student');

    const capacityAvailable = namespace.max_students === null ||
      (studentCount ?? 0) < namespace.max_students;

    return NextResponse.json({
      section: {
        id: section.id,
        name: section.name,
        semester: section.semester,
      },
      class: classInfo ? {
        id: classInfo.id,
        name: classInfo.name,
        description: classInfo.description,
      } : null,
      namespace: {
        id: namespace.id,
        displayName: namespace.display_name,
      },
      instructors,
      capacityAvailable,
    });
  } catch (error: unknown) {
    console.error('[API] Register student GET error:', error);
    return NextResponse.json(
      { error: 'Failed to validate join code' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/register-student
 *
 * Creates a new student account and enrolls in the section.
 * After successful registration, automatically logs in the user.
 *
 * Request body:
 * - code: Section join code (required)
 * - email: Student email (required)
 * - password: Account password (required)
 * - displayName: Optional display name
 *
 * Response:
 * - 201: { user, section, autoLoginFailed? }
 * - 400: Validation error (missing fields, invalid code, capacity, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, email, password, displayName } = body;

    // Validate required fields
    const errors: string[] = [];

    if (!code || typeof code !== 'string') {
      errors.push('Join code is required');
    }
    if (!email || typeof email !== 'string') {
      errors.push('Email is required');
    }
    if (!password || typeof password !== 'string') {
      errors.push('Password is required');
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: errors.join(', '), code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters', code: 'WEAK_PASSWORD' },
        { status: 400 }
      );
    }

    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        {
          error: 'Password must contain at least one letter and one number',
          code: 'WEAK_PASSWORD',
        },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: 'Invalid email format', code: 'INVALID_EMAIL' },
        { status: 400 }
      );
    }

    // Register the student
    const studentRegistrationService = await getStudentRegistrationService();
    const result = await studentRegistrationService.registerStudent(
      code,
      email.trim(),
      password,
      displayName?.trim()
    );

    // Auto-login: Sign in the newly created user to establish a session
    // This provides a seamless UX - students are immediately authenticated after registration
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set(name, '', options);
          },
        },
      }
    );

    // Sign in with the credentials used for registration
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      // Registration succeeded but auto-login failed
      // Still return success, but indicate login is needed
      console.warn('[API] Auto-login after registration failed:', signInError.message);
      return NextResponse.json(
        {
          user: result.user,
          section: {
            id: result.section.id,
            name: result.section.name,
            semester: result.section.semester,
          },
          autoLoginFailed: true,
        },
        { status: 201 }
      );
    }

    // Return success with user and section info
    // The session cookie is automatically set by Supabase SSR
    return NextResponse.json(
      {
        user: result.user,
        section: {
          id: result.section.id,
          name: result.section.name,
          semester: result.section.semester,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const err = error as Error & { name?: string; code?: string; message?: string };
    console.error('[API] Register student POST error:', error);

    // Handle StudentRegistrationError (check by name for mock compatibility)
    if (err.name === 'StudentRegistrationError' && err.code) {
      const statusCode = err.code === 'USER_CREATION_FAILED' ? 409 : 400;

      const errorMessages: Record<string, string> = {
        INVALID_CODE: 'Invalid join code',
        SECTION_INACTIVE: 'This section is no longer accepting new students',
        NAMESPACE_NOT_FOUND: 'Organization not found',
        NAMESPACE_AT_CAPACITY: 'This class has reached its student limit',
        INVALID_EMAIL: 'Invalid email format',
        INVALID_PASSWORD: 'Invalid password',
        USER_CREATION_FAILED: 'Failed to create account (email may already be in use)',
        MEMBERSHIP_FAILED: 'Failed to enroll in section',
      };

      return NextResponse.json(
        {
          error: errorMessages[err.code] || err.message,
          code: err.code,
        },
        { status: statusCode }
      );
    }

    // Handle duplicate email from Supabase
    if (err.message?.includes('already') || err.message?.includes('duplicate')) {
      return NextResponse.json(
        {
          error: 'An account with this email already exists',
          code: 'EMAIL_EXISTS',
        },
        { status: 409 }
      );
    }

    // Pass through password validation errors from Supabase (e.g., pwned password check)
    if (err.message?.toLowerCase().includes('password')) {
      return NextResponse.json(
        {
          error: err.message,
          code: 'WEAK_PASSWORD',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
