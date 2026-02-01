/**
 * Tests for namespace isolation in API routes.
 * Verifies that users can only access data from their own namespace,
 * and that system-admin can access data from any namespace.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as apiHelpers from '@/server/auth/api-helpers';
import { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';

// Mock user data for tests - namespace-1 users
const namespace1Instructor: User = {
  id: 'instructor-ns1',
  email: 'alice@example.com',
  role: 'instructor',
  namespaceId: 'namespace-1',
  createdAt: new Date(),
};

const namespace1Student: User = {
  id: 'student-ns1',
  email: 'student1@example.com',
  role: 'student',
  namespaceId: 'namespace-1',
  createdAt: new Date(),
};

const namespace1Admin: User = {
  id: 'admin-ns1',
  email: 'admin1@example.com',
  role: 'namespace-admin',
  namespaceId: 'namespace-1',
  createdAt: new Date(),
};

// Namespace-2 users
const namespace2Instructor: User = {
  id: 'instructor-ns2',
  email: 'bob@example.com',
  role: 'instructor',
  namespaceId: 'namespace-2',
  createdAt: new Date(),
};

const namespace2Student: User = {
  id: 'student-ns2',
  email: 'student2@example.com',
  role: 'student',
  namespaceId: 'namespace-2',
  createdAt: new Date(),
};

const namespace2Admin: User = {
  id: 'admin-ns2',
  email: 'admin2@example.com',
  role: 'namespace-admin',
  namespaceId: 'namespace-2',
  createdAt: new Date(),
};

// System admin (can access all namespaces)
const systemAdminUser: User = {
  id: 'sys-admin',
  email: 'sysadmin@example.com',
  role: 'system-admin',
  namespaceId: 'default',
  createdAt: new Date(),
};

describe('getNamespaceContext', () => {
  it('returns user namespace for regular users', () => {
    const request = new NextRequest('http://localhost/api/classes');
    const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Instructor);
    expect(namespaceId).toBe('namespace-1');
  });

  it('returns undefined (all namespaces) for system-admin without query param', () => {
    const request = new NextRequest('http://localhost/api/classes');
    const namespaceId = apiHelpers.getNamespaceContext(request, systemAdminUser);
    expect(namespaceId).toBeUndefined();
  });

  it('returns query param namespace for system-admin when provided', () => {
    const request = new NextRequest('http://localhost/api/classes?namespace=namespace-1');
    const namespaceId = apiHelpers.getNamespaceContext(request, systemAdminUser);
    expect(namespaceId).toBe('namespace-1');
  });

  it('ignores query param namespace for non-system-admin users', () => {
    const request = new NextRequest('http://localhost/api/classes?namespace=namespace-2');
    const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Instructor);
    expect(namespaceId).toBe('namespace-1');
  });

  it('ignores query param namespace for namespace-admin', () => {
    const request = new NextRequest('http://localhost/api/classes?namespace=namespace-2');
    const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Admin);
    expect(namespaceId).toBe('namespace-1');
  });

  it('ignores query param namespace for students', () => {
    const request = new NextRequest('http://localhost/api/classes?namespace=namespace-2');
    const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Student);
    expect(namespaceId).toBe('namespace-1');
  });
});

describe('API Namespace Isolation Patterns', () => {
  let requireAuthSpy: jest.SpyInstance;

  beforeEach(() => {
    requireAuthSpy = jest.spyOn(apiHelpers, 'requireAuth');
  });

  afterEach(() => {
    requireAuthSpy.mockRestore();
  });

  describe('Regular user access patterns', () => {
    it('should only access own namespace data', async () => {
      requireAuthSpy.mockResolvedValue({
        user: namespace1Instructor,
        rbac: { hasPermission: jest.fn().mockReturnValue(true) },
      });

      const request = new NextRequest('http://localhost/api/classes');
      const auth = await apiHelpers.requireAuth(request);

      if (!(auth instanceof NextResponse)) {
        const namespaceId = apiHelpers.getNamespaceContext(request, auth.user);
        expect(namespaceId).toBe('namespace-1');
      }
    });

    it('cannot access other namespace data via query param', () => {
      const request = new NextRequest('http://localhost/api/classes?namespace=namespace-2');
      const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Instructor);
      expect(namespaceId).toBe('namespace-1');
    });
  });

  describe('System admin access patterns', () => {
    it('returns undefined (all namespaces) without query param', () => {
      const request = new NextRequest('http://localhost/api/classes');
      const namespaceId = apiHelpers.getNamespaceContext(request, systemAdminUser);
      expect(namespaceId).toBeUndefined();
    });

    it('can access specific namespace via query param', () => {
      const request = new NextRequest('http://localhost/api/classes?namespace=namespace-1');
      const namespaceId = apiHelpers.getNamespaceContext(request, systemAdminUser);
      expect(namespaceId).toBe('namespace-1');
    });

    it('can switch between namespaces', () => {
      const request1 = new NextRequest('http://localhost/api/classes?namespace=namespace-1');
      const namespaceId1 = apiHelpers.getNamespaceContext(request1, systemAdminUser);
      expect(namespaceId1).toBe('namespace-1');

      const request2 = new NextRequest('http://localhost/api/classes?namespace=namespace-2');
      const namespaceId2 = apiHelpers.getNamespaceContext(request2, systemAdminUser);
      expect(namespaceId2).toBe('namespace-2');
    });
  });
});

describe('Cross-namespace user management (RBAC)', () => {
  describe('namespace-admin boundaries', () => {
    it('namespace-admin-1 can manage users in namespace-1', () => {
      const rbac = new RBACService(namespace1Admin);
      expect(rbac.canManageUser(namespace1Admin, namespace1Instructor)).toBe(true);
      expect(rbac.canManageUser(namespace1Admin, namespace1Student)).toBe(true);
    });

    it('namespace-admin-1 CANNOT manage users in namespace-2', () => {
      const rbac = new RBACService(namespace1Admin);
      expect(rbac.canManageUser(namespace1Admin, namespace2Admin)).toBe(false);
      expect(rbac.canManageUser(namespace1Admin, namespace2Instructor)).toBe(false);
      expect(rbac.canManageUser(namespace1Admin, namespace2Student)).toBe(false);
    });

    it('namespace-admin cannot manage other namespace-admins in same namespace', () => {
      const anotherNs1Admin: User = {
        ...namespace1Admin,
        id: 'admin-ns1-2',
      };
      const rbac = new RBACService(namespace1Admin);
      expect(rbac.canManageUser(namespace1Admin, anotherNs1Admin)).toBe(false);
    });
  });

  describe('instructor boundaries', () => {
    it('instructor-1 can manage students in namespace-1', () => {
      const rbac = new RBACService(namespace1Instructor);
      expect(rbac.canManageUser(namespace1Instructor, namespace1Student)).toBe(true);
    });

    it('instructor-1 CANNOT manage students in namespace-2', () => {
      const rbac = new RBACService(namespace1Instructor);
      expect(rbac.canManageUser(namespace1Instructor, namespace2Student)).toBe(false);
    });

    it('instructor cannot manage other instructors', () => {
      const rbac = new RBACService(namespace1Instructor);
      const anotherNs1Instructor: User = {
        ...namespace1Instructor,
        id: 'instructor-ns1-2',
      };
      expect(rbac.canManageUser(namespace1Instructor, anotherNs1Instructor)).toBe(false);
    });
  });

  describe('system-admin boundaries', () => {
    it('system-admin can manage users in any namespace', () => {
      const rbac = new RBACService(systemAdminUser);
      expect(rbac.canManageUser(systemAdminUser, namespace1Admin)).toBe(true);
      expect(rbac.canManageUser(systemAdminUser, namespace1Instructor)).toBe(true);
      expect(rbac.canManageUser(systemAdminUser, namespace1Student)).toBe(true);
      expect(rbac.canManageUser(systemAdminUser, namespace2Admin)).toBe(true);
      expect(rbac.canManageUser(systemAdminUser, namespace2Instructor)).toBe(true);
      expect(rbac.canManageUser(systemAdminUser, namespace2Student)).toBe(true);
    });

    it('system-admin can manage other system-admins', () => {
      const anotherSysAdmin: User = {
        ...systemAdminUser,
        id: 'sys-admin-2',
      };
      const rbac = new RBACService(systemAdminUser);
      expect(rbac.canManageUser(systemAdminUser, anotherSysAdmin)).toBe(true);
    });
  });

  describe('student boundaries', () => {
    it('students cannot manage anyone', () => {
      const rbac = new RBACService(namespace1Student);
      expect(rbac.canManageUser(namespace1Student, namespace1Student)).toBe(false);
      expect(rbac.canManageUser(namespace1Student, namespace1Instructor)).toBe(false);
      expect(rbac.canManageUser(namespace1Student, namespace2Student)).toBe(false);
    });
  });
});

describe('Namespace context for API filtering', () => {
  /**
   * These tests verify that the namespace context is correctly applied
   * based on user role and query parameters.
   */

  describe('Classes API namespace filtering', () => {
    it('instructor gets their namespace for filtering classes', () => {
      const request = new NextRequest('http://localhost/api/classes');
      const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Instructor);

      // This namespaceId would be passed to classRepo.listClasses(userId, namespaceId)
      expect(namespaceId).toBe('namespace-1');
    });

    it('system-admin can query different namespace for classes', () => {
      const request = new NextRequest('http://localhost/api/classes?namespace=namespace-2');
      const namespaceId = apiHelpers.getNamespaceContext(request, systemAdminUser);

      expect(namespaceId).toBe('namespace-2');
    });
  });

  describe('Sections API namespace filtering', () => {
    it('student gets their namespace for section join', () => {
      const request = new NextRequest('http://localhost/api/sections/join');
      const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Student);

      // Section join would verify section.namespaceId === this namespaceId
      expect(namespaceId).toBe('namespace-1');
    });
  });

  describe('Sessions API namespace filtering', () => {
    it('instructor gets their namespace for session filtering', () => {
      const request = new NextRequest('http://localhost/api/sessions');
      const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Instructor);

      expect(namespaceId).toBe('namespace-1');
    });
  });

  describe('Problems API namespace filtering', () => {
    it('instructor gets their namespace for problem filtering', () => {
      const request = new NextRequest('http://localhost/api/problems');
      const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Instructor);

      expect(namespaceId).toBe('namespace-1');
    });
  });

  describe('Admin users API namespace filtering', () => {
    it('namespace-admin cannot override namespace query param', () => {
      const request = new NextRequest('http://localhost/api/admin/users?namespace=namespace-2');
      const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Admin);

      // Still gets their own namespace
      expect(namespaceId).toBe('namespace-1');
    });

    it('system-admin can query specific namespace for users', () => {
      const request = new NextRequest('http://localhost/api/admin/users?namespace=namespace-2');
      const namespaceId = apiHelpers.getNamespaceContext(request, systemAdminUser);

      expect(namespaceId).toBe('namespace-2');
    });
  });
});

describe('Multi-tenant data isolation scenarios', () => {
  /**
   * These tests verify specific multi-tenant isolation scenarios
   */

  it('instructor in namespace-1 cannot access namespace-2 via any query param trick', () => {
    // Try various query param formats
    const urls = [
      'http://localhost/api/classes?namespace=namespace-2',
      'http://localhost/api/classes?namespaceId=namespace-2',
      'http://localhost/api/classes?ns=namespace-2',
    ];

    for (const url of urls) {
      const request = new NextRequest(url);
      const namespaceId = apiHelpers.getNamespaceContext(request, namespace1Instructor);
      expect(namespaceId).toBe('namespace-1');
    }
  });

  it('system-admin gets undefined (all namespaces) when no query param provided', () => {
    const request = new NextRequest('http://localhost/api/classes');
    const namespaceId = apiHelpers.getNamespaceContext(request, systemAdminUser);
    expect(namespaceId).toBeUndefined();
  });

  it('empty namespace query param returns undefined for system-admin', () => {
    const request = new NextRequest('http://localhost/api/classes?namespace=');
    const namespaceId = apiHelpers.getNamespaceContext(request, systemAdminUser);
    // Empty string means "all namespaces" for system-admin
    expect(namespaceId).toBeUndefined();
  });
});
