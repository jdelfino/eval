/**
 * Tests for /api/auth/register-student endpoints
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { StudentRegistrationError } from '@/server/invitations';

// Mock dependencies
jest.mock('@/server/invitations', () => ({
  getStudentRegistrationService: jest.fn(),
  StudentRegistrationError: class StudentRegistrationError extends Error {
    constructor(message: string, public readonly code: string) {
      super(message);
      this.name = 'StudentRegistrationError';
    }
  },
}));

jest.mock('@/server/persistence');

jest.mock('@/server/rate-limit', () => ({
  rateLimit: jest.fn(),
}));

jest.mock('@/server/supabase/client', () => ({
  getSupabaseClient: jest.fn(),
}));

// Mock next/headers for cookies
const mockCookieStore = {
  get: jest.fn(),
  set: jest.fn(),
};
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve(mockCookieStore)),
}));

// Mock @supabase/ssr for auto-login
const mockSignInWithPassword = jest.fn();
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
  })),
}));

import { getStudentRegistrationService } from '@/server/invitations';
import { createStorage } from '@/server/persistence';
import { rateLimit } from '@/server/rate-limit';
import { getSupabaseClient } from '@/server/supabase/client';

describe('/api/auth/register-student', () => {
  // Mock data
  const mockSection = {
    id: 'section-123',
    name: 'Section A',
    semester: 'Fall 2024',
    namespaceId: 'test-namespace',
    classId: 'class-123',
    joinCode: 'ABC-123-XYZ',
    active: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockClass = {
    id: 'class-123',
    name: 'CS 101 - Intro to Programming',
    description: 'An introductory course',
    namespaceId: 'test-namespace',
    createdBy: 'instructor-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockNamespace = {
    id: 'test-namespace',
    displayName: 'Test University',
  };

  const mockInstructor = {
    id: 'instructor-1',
    displayName: 'Professor Smith',
  };

  const mockUser = {
    id: 'student-123',
    email: 'student@example.com',
    role: 'student' as const,
    namespaceId: 'test-namespace',
    createdAt: new Date('2024-01-01'),
  };

  let mockStudentRegistrationService: any;
  let mockStorage: any;
  let mockSupabaseClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no rate limiting
    (rateLimit as jest.Mock).mockResolvedValue(null);

    // Default: auto-login succeeds
    mockSignInWithPassword.mockResolvedValue({ error: null });

    // Setup student registration service mock
    mockStudentRegistrationService = {
      validateSectionCode: jest.fn().mockResolvedValue({
        valid: true,
        section: mockSection,
        namespace: mockNamespace,
        capacityAvailable: true,
      }),
      registerStudent: jest.fn().mockResolvedValue({
        user: mockUser,
        section: mockSection,
      }),
    };
    (getStudentRegistrationService as jest.Mock).mockReturnValue(mockStudentRegistrationService);

    // Setup storage mock
    mockStorage = {
      classes: {
        getClass: jest.fn().mockResolvedValue(mockClass),
      },
      users: {
        getUser: jest.fn().mockResolvedValue(mockInstructor),
      },
    };
    (createStorage as jest.Mock).mockResolvedValue(mockStorage);

    // Setup Supabase client mock for GET route
    mockSupabaseClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'sections') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockSection.id,
                name: mockSection.name,
                semester: mockSection.semester,
                namespace_id: mockSection.namespaceId,
                class_id: mockSection.classId,
                join_code: mockSection.joinCode,
                active: mockSection.active,
              },
              error: null,
            }),
          };
        }
        if (table === 'namespaces') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockNamespace.id,
                display_name: mockNamespace.displayName,
                max_students: null,
              },
              error: null,
            }),
          };
        }
        if (table === 'classes') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockClass.id,
                name: mockClass.name,
                description: mockClass.description,
              },
              error: null,
            }),
          };
        }
        if (table === 'user_profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockInstructor.id,
                display_name: mockInstructor.displayName,
              },
              error: null,
            }),
          };
        }
        if (table === 'section_memberships') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: [{ user_id: mockInstructor.id }],
              error: null,
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };
    (getSupabaseClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  describe('GET /api/auth/register-student', () => {
    it('returns 429 when rate limited', async () => {
      const rateLimitResponse = new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        }
      );
      (rateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const request = new NextRequest('http://localhost/api/auth/register-student?code=ABC-123-XYZ');
      const response = await GET(request);

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toBe('Too many requests. Please try again later.');
      expect(rateLimit).toHaveBeenCalledWith('join', request);
    });

    it('returns 400 if code is missing', async () => {
      const request = new NextRequest('http://localhost/api/auth/register-student');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Join code is required');
      expect(data.code).toBe('MISSING_CODE');
    });

    it('returns 400 for invalid code', async () => {
      // Override Supabase mock to return no section
      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'sections') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          };
        }
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const request = new NextRequest('http://localhost/api/auth/register-student?code=INVALID');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid join code');
      expect(data.code).toBe('INVALID_CODE');
    });

    it('returns 400 for inactive section', async () => {
      // Override Supabase mock to return an inactive section
      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'sections') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockSection.id,
                name: mockSection.name,
                semester: mockSection.semester,
                namespace_id: mockSection.namespaceId,
                class_id: mockSection.classId,
                join_code: mockSection.joinCode,
                active: false, // Inactive
              },
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const request = new NextRequest('http://localhost/api/auth/register-student?code=ABC-123-XYZ');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('This section is no longer accepting new students');
      expect(data.code).toBe('SECTION_INACTIVE');
    });

    it('returns section/class info for valid code', async () => {
      // Override mock to return different instructors
      let instructorCallIndex = 0;
      const instructorData = [
        { id: 'instructor-1', display_name: 'Professor Smith' },
        { id: 'instructor-2', display_name: 'Professor Jones' },
      ];

      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'sections') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockSection.id,
                name: mockSection.name,
                semester: mockSection.semester,
                namespace_id: mockSection.namespaceId,
                class_id: mockSection.classId,
                join_code: mockSection.joinCode,
                active: mockSection.active,
              },
              error: null,
            }),
          };
        }
        if (table === 'namespaces') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockNamespace.id,
                display_name: mockNamespace.displayName,
                max_students: null,
              },
              error: null,
            }),
          };
        }
        if (table === 'classes') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockClass.id,
                name: mockClass.name,
                description: mockClass.description,
              },
              error: null,
            }),
          };
        }
        if (table === 'user_profiles') {
          return {
            select: jest.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
              if (opts?.count === 'exact') {
                return {
                  eq: jest.fn().mockReturnThis(),
                  then: jest.fn((cb: any) => cb({ count: 0, error: null })),
                };
              }
              return {
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockImplementation(() => {
                  const data = instructorCallIndex < instructorData.length
                    ? instructorData[instructorCallIndex++]
                    : null;
                  return Promise.resolve({ data, error: null });
                }),
              };
            }),
          };
        }
        if (table === 'section_memberships') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: [{ user_id: 'instructor-1' }, { user_id: 'instructor-2' }],
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const request = new NextRequest('http://localhost/api/auth/register-student?code=ABC-123-XYZ');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.section).toEqual({
        id: 'section-123',
        name: 'Section A',
        semester: 'Fall 2024',
      });
      expect(data.class).toEqual({
        id: 'class-123',
        name: 'CS 101 - Intro to Programming',
        description: 'An introductory course',
      });
      expect(data.namespace).toEqual({
        id: 'test-namespace',
        displayName: 'Test University',
      });
      expect(data.capacityAvailable).toBe(true);
      expect(data.instructors).toHaveLength(2);
      expect(data.instructors[0].displayName).toBe('Professor Smith');
      expect(data.instructors[1].displayName).toBe('Professor Jones');
    });

    it('handles missing class gracefully', async () => {
      // Override mock to return null for class
      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'sections') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockSection.id,
                name: mockSection.name,
                semester: mockSection.semester,
                namespace_id: mockSection.namespaceId,
                class_id: mockSection.classId,
                join_code: mockSection.joinCode,
                active: true,
              },
              error: null,
            }),
          };
        }
        if (table === 'namespaces') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockNamespace.id,
                display_name: mockNamespace.displayName,
                max_students: null,
              },
              error: null,
            }),
          };
        }
        if (table === 'classes') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          };
        }
        if (table === 'user_profiles') {
          return {
            select: jest.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
              if (opts?.count === 'exact') {
                return {
                  eq: jest.fn().mockReturnThis(),
                  then: jest.fn((cb: any) => cb({ count: 0, error: null })),
                };
              }
              return {
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        if (table === 'section_memberships') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const request = new NextRequest('http://localhost/api/auth/register-student?code=ABC-123-XYZ');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.class).toBeNull();
    });

    it('shows capacity available as false when at limit', async () => {
      // Override mock to return namespace at capacity
      mockSupabaseClient.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'sections') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockSection.id,
                name: mockSection.name,
                semester: mockSection.semester,
                namespace_id: mockSection.namespaceId,
                class_id: mockSection.classId,
                join_code: mockSection.joinCode,
                active: true,
              },
              error: null,
            }),
          };
        }
        if (table === 'namespaces') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockNamespace.id,
                display_name: mockNamespace.displayName,
                max_students: 10, // Set a limit
              },
              error: null,
            }),
          };
        }
        if (table === 'classes') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockClass.id,
                name: mockClass.name,
                description: mockClass.description,
              },
              error: null,
            }),
          };
        }
        if (table === 'user_profiles') {
          return {
            select: jest.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
              if (opts?.count === 'exact') {
                // Return count at limit
                return {
                  eq: jest.fn().mockReturnThis(),
                  then: jest.fn((cb: any) => cb({ count: 10, error: null })),
                };
              }
              return {
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        if (table === 'section_memberships') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const request = new NextRequest('http://localhost/api/auth/register-student?code=ABC-123-XYZ');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.capacityAvailable).toBe(false);
    });
  });

  describe('POST /api/auth/register-student', () => {
    const validBody = {
      code: 'ABC-123-XYZ',
      email: 'student@example.com',
      password: 'Password123',
    };

    it('returns 400 for missing required fields', async () => {
      const request = new NextRequest('http://localhost/api/auth/register-student', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    // Note: Password validation (strength requirements) is tested in
    // src/server/invitations/__tests__/student-registration-service.test.ts

    // Note: Email format validation is tested in
    // src/server/invitations/__tests__/student-registration-service.test.ts

    it('returns 400 for invalid code', async () => {
      // Create an error with the correct name and code
      const error = new Error('Invalid join code') as any;
      error.name = 'StudentRegistrationError';
      error.code = 'INVALID_CODE';

      mockStudentRegistrationService.registerStudent.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/auth/register-student', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, code: 'INVALID' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe('INVALID_CODE');
    });

    it('returns 400 when namespace at capacity', async () => {
      // Create a real error with the code property
      const error = new Error('Namespace is at capacity') as any;
      error.name = 'StudentRegistrationError';
      error.code = 'NAMESPACE_AT_CAPACITY';

      mockStudentRegistrationService.registerStudent.mockRejectedValue(error);

      const request = new NextRequest('http://localhost/api/auth/register-student', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('student limit');
    });

    it('returns 409 for duplicate email', async () => {
      mockStudentRegistrationService.registerStudent.mockRejectedValue(
        new Error('User with this email already exists')
      );

      const request = new NextRequest('http://localhost/api/auth/register-student', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toContain('already exists');
      expect(data.code).toBe('EMAIL_EXISTS');
    });

    it('creates student user and joins section on success', async () => {
      const request = new NextRequest('http://localhost/api/auth/register-student', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();

      // createdAt gets serialized to string in JSON response
      expect(data.user).toEqual({
        id: 'student-123',
        email: 'student@example.com',
        role: 'student',
        namespaceId: 'test-namespace',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      expect(data.section).toEqual({
        id: 'section-123',
        name: 'Section A',
        semester: 'Fall 2024',
      });

      expect(mockStudentRegistrationService.registerStudent).toHaveBeenCalledWith(
        'ABC-123-XYZ',
        'student@example.com',
        'Password123',
        undefined
      );
    });

    // Note: Email whitespace trimming is tested in
    // src/server/invitations/__tests__/student-registration-service.test.ts

    it('handles unexpected errors gracefully', async () => {
      mockStudentRegistrationService.registerStudent.mockRejectedValue(
        new Error('Unexpected database error')
      );

      const request = new NextRequest('http://localhost/api/auth/register-student', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Registration failed');
    });

    it('returns 400 with descriptive message for Supabase password validation errors', async () => {
      mockStudentRegistrationService.registerStudent.mockRejectedValue(
        new Error('Password has been found in a data breach')
      );

      const request = new NextRequest('http://localhost/api/auth/register-student', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Password has been found in a data breach');
      expect(data.code).toBe('WEAK_PASSWORD');
    });

    it('auto-signs in user after successful registration', async () => {
      const request = new NextRequest('http://localhost/api/auth/register-student', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();

      // Should call signInWithPassword after registration
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'student@example.com',
        password: 'Password123',
      });

      // Should not have autoLoginFailed flag when auto-login succeeds
      expect(data.autoLoginFailed).toBeUndefined();
    });

    it('returns autoLoginFailed flag when sign-in fails after registration', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        error: { message: 'Sign in failed' },
      });

      const request = new NextRequest('http://localhost/api/auth/register-student', {
        method: 'POST',
        body: JSON.stringify(validBody),
      });
      const response = await POST(request);

      // Registration still succeeds even if auto-login fails
      expect(response.status).toBe(201);
      const data = await response.json();

      // User should still be returned
      expect(data.user.id).toBe('student-123');

      // But autoLoginFailed flag should be set
      expect(data.autoLoginFailed).toBe(true);
    });
  });
});
