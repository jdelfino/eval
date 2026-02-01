/**
 * Shared test helpers for API route tests with permission-based authorization.
 */

import { NextResponse } from 'next/server';
import { RBACService } from '@/server/auth/rbac';

/**
 * Mock implementation of requirePermission for testing.
 * Returns auth context if user has permission, otherwise returns error response.
 */
export function mockRequirePermission(
  user: any | null,
  requiredPermission: string
): any {
  if (!user) {
    // Not authenticated
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  // Simple mock RBAC - check if user has permission
  const rbac = new RBACService();
  const hasPermission = rbac.hasPermission(user, requiredPermission);

  if (!hasPermission) {
    // Permission denied
    return NextResponse.json(
      { error: `Forbidden: Requires ${requiredPermission} permission` },
      { status: 403 }
    );
  }

  // Auth successful, return auth context
  return {
    user,
    rbac,
  };
}

/**
 * Setup mock for api-helpers.requirePermission in a test.
 * Call this in beforeEach with the user who should be "authenticated".
 */
export function setupRequirePermissionMock(
  mockFn: jest.MockedFunction<any>,
  user: any | null
) {
  mockFn.mockImplementation(async (request: any, permission: string) => {
    return mockRequirePermission(user, permission);
  });
}
