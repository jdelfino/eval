/**
 * Cross-namespace security tests for API routes.
 * Verifies that data access is properly isolated by namespace.
 *
 * These tests focus on the security primitives (RBAC, getNamespaceContext)
 * that enforce namespace isolation. Individual route tests in their own
 * __tests__ directories verify the routes correctly use these primitives.
 */

import { NextRequest } from 'next/server';
import type { User } from '@/server/auth/types';
import { RBACService } from '@/server/auth/rbac';
import { getNamespaceContext } from '@/server/auth/api-helpers';

// Test users in different namespaces
const namespaceAInstructor: User = {
  id: 'instructor-a',
  email: 'alice@namespace-a.com',
  role: 'instructor',
  namespaceId: 'namespace-a',
  createdAt: new Date(),
};

const namespaceBInstructor: User = {
  id: 'instructor-b',
  email: 'bob@namespace-b.com',
  role: 'instructor',
  namespaceId: 'namespace-b',
  createdAt: new Date(),
};

const namespaceAStudent: User = {
  id: 'student-a',
  email: 'student@namespace-a.com',
  role: 'student',
  namespaceId: 'namespace-a',
  createdAt: new Date(),
};

const namespaceBStudent: User = {
  id: 'student-b',
  email: 'student@namespace-b.com',
  role: 'student',
  namespaceId: 'namespace-b',
  createdAt: new Date(),
};

const namespaceAAdmin: User = {
  id: 'admin-a',
  email: 'admin@namespace-a.com',
  role: 'namespace-admin',
  namespaceId: 'namespace-a',
  createdAt: new Date(),
};

const namespaceBAdmin: User = {
  id: 'admin-b',
  email: 'admin@namespace-b.com',
  role: 'namespace-admin',
  namespaceId: 'namespace-b',
  createdAt: new Date(),
};

const systemAdmin: User = {
  id: 'sys-admin',
  email: 'admin@system.com',
  role: 'system-admin',
  namespaceId: 'default',
  createdAt: new Date(),
};

describe('Cross-namespace query param protection (getNamespaceContext)', () => {
  describe('Instructor namespace isolation', () => {
    it('instructor in namespace-a gets namespace-a for API requests', () => {
      const request = new NextRequest('http://localhost/api/classes');
      const result = getNamespaceContext(request, namespaceAInstructor);
      expect(result).toBe('namespace-a');
    });

    it('instructor in namespace-a cannot override namespace via query param', () => {
      const request = new NextRequest('http://localhost/api/classes?namespace=namespace-b');
      const result = getNamespaceContext(request, namespaceAInstructor);
      expect(result).toBe('namespace-a');
    });

    it('instructor in namespace-b gets namespace-b for API requests', () => {
      const request = new NextRequest('http://localhost/api/classes');
      const result = getNamespaceContext(request, namespaceBInstructor);
      expect(result).toBe('namespace-b');
    });
  });

  describe('Student namespace isolation', () => {
    it('student in namespace-a cannot override namespace via query param', () => {
      const request = new NextRequest('http://localhost/api/sections/join?namespace=namespace-b');
      const result = getNamespaceContext(request, namespaceAStudent);
      expect(result).toBe('namespace-a');
    });
  });

  describe('Namespace-admin isolation', () => {
    it('namespace-admin cannot override namespace via query param', () => {
      const request = new NextRequest('http://localhost/api/admin/users?namespace=namespace-b');
      const result = getNamespaceContext(request, namespaceAAdmin);
      expect(result).toBe('namespace-a');
    });
  });

  describe('System-admin cross-namespace access', () => {
    it('system-admin can use namespace query param', () => {
      const request = new NextRequest('http://localhost/api/classes?namespace=namespace-b');
      const result = getNamespaceContext(request, systemAdmin);
      expect(result).toBe('namespace-b');
    });

    it('system-admin gets undefined (all namespaces) without query param', () => {
      const request = new NextRequest('http://localhost/api/classes');
      const result = getNamespaceContext(request, systemAdmin);
      expect(result).toBeUndefined();
    });

    it('system-admin can switch between namespaces', () => {
      const requestA = new NextRequest('http://localhost/api/classes?namespace=namespace-a');
      const resultA = getNamespaceContext(requestA, systemAdmin);
      expect(resultA).toBe('namespace-a');

      const requestB = new NextRequest('http://localhost/api/classes?namespace=namespace-b');
      const resultB = getNamespaceContext(requestB, systemAdmin);
      expect(resultB).toBe('namespace-b');
    });
  });
});

describe('Cross-namespace user management (RBAC canManageUser)', () => {
  describe('Namespace-admin boundaries', () => {
    it('namespace-admin-a can manage users in namespace-a', () => {
      const rbac = new RBACService(namespaceAAdmin);
      expect(rbac.canManageUser(namespaceAAdmin, namespaceAInstructor)).toBe(true);
      expect(rbac.canManageUser(namespaceAAdmin, namespaceAStudent)).toBe(true);
    });

    it('namespace-admin-a CANNOT manage users in namespace-b', () => {
      const rbac = new RBACService(namespaceAAdmin);
      expect(rbac.canManageUser(namespaceAAdmin, namespaceBAdmin)).toBe(false);
      expect(rbac.canManageUser(namespaceAAdmin, namespaceBInstructor)).toBe(false);
      expect(rbac.canManageUser(namespaceAAdmin, namespaceBStudent)).toBe(false);
    });

    it('namespace-admin-a cannot manage other namespace-admins in same namespace', () => {
      const anotherNsAAdmin: User = { ...namespaceAAdmin, id: 'admin-a2', email: 'admin-a2@namespace-a.com' };
      const rbac = new RBACService(namespaceAAdmin);
      expect(rbac.canManageUser(namespaceAAdmin, anotherNsAAdmin)).toBe(false);
    });
  });

  describe('Instructor boundaries', () => {
    it('instructor-a can manage students in namespace-a', () => {
      const rbac = new RBACService(namespaceAInstructor);
      expect(rbac.canManageUser(namespaceAInstructor, namespaceAStudent)).toBe(true);
    });

    it('instructor-a CANNOT manage students in namespace-b', () => {
      const rbac = new RBACService(namespaceAInstructor);
      expect(rbac.canManageUser(namespaceAInstructor, namespaceBStudent)).toBe(false);
    });

    it('instructor-a cannot manage instructors', () => {
      const rbac = new RBACService(namespaceAInstructor);
      expect(rbac.canManageUser(namespaceAInstructor, namespaceBInstructor)).toBe(false);
      // Also cannot manage instructors in same namespace
      const anotherNsAInstructor: User = { ...namespaceAInstructor, id: 'instructor-a2' };
      expect(rbac.canManageUser(namespaceAInstructor, anotherNsAInstructor)).toBe(false);
    });
  });

  describe('System-admin boundaries', () => {
    it('system-admin can manage users in any namespace', () => {
      const rbac = new RBACService(systemAdmin);
      expect(rbac.canManageUser(systemAdmin, namespaceAAdmin)).toBe(true);
      expect(rbac.canManageUser(systemAdmin, namespaceAInstructor)).toBe(true);
      expect(rbac.canManageUser(systemAdmin, namespaceAStudent)).toBe(true);
      expect(rbac.canManageUser(systemAdmin, namespaceBAdmin)).toBe(true);
      expect(rbac.canManageUser(systemAdmin, namespaceBInstructor)).toBe(true);
      expect(rbac.canManageUser(systemAdmin, namespaceBStudent)).toBe(true);
    });

    it('system-admin can manage other system-admins', () => {
      const anotherSysAdmin: User = { ...systemAdmin, id: 'sys-admin-2' };
      const rbac = new RBACService(systemAdmin);
      expect(rbac.canManageUser(systemAdmin, anotherSysAdmin)).toBe(true);
    });
  });

  describe('Student boundaries', () => {
    it('students cannot manage anyone', () => {
      const rbac = new RBACService(namespaceAStudent);
      expect(rbac.canManageUser(namespaceAStudent, namespaceAStudent)).toBe(false);
      expect(rbac.canManageUser(namespaceAStudent, namespaceAInstructor)).toBe(false);
      expect(rbac.canManageUser(namespaceAStudent, namespaceBStudent)).toBe(false);
    });
  });
});

describe('Namespace isolation security scenarios', () => {
  it('attacker in namespace-a cannot bypass isolation with various query param formats', () => {
    const attackUrls = [
      'http://localhost/api/classes?namespace=namespace-b',
      'http://localhost/api/classes?namespaceId=namespace-b',
      'http://localhost/api/classes?ns=namespace-b',
      'http://localhost/api/classes?NAMESPACE=namespace-b',
      'http://localhost/api/classes?namespace=namespace-b&namespace=namespace-a',
    ];

    for (const url of attackUrls) {
      const request = new NextRequest(url);
      const result = getNamespaceContext(request, namespaceAInstructor);
      expect(result).toBe('namespace-a');
    }
  });

  it('empty namespace query param returns undefined (all namespaces) for system-admin', () => {
    const request = new NextRequest('http://localhost/api/classes?namespace=');
    const result = getNamespaceContext(request, systemAdmin);
    // Empty string means "all namespaces" for system-admin
    expect(result).toBeUndefined();
  });

  it('whitespace namespace query param is passed through for system-admin', () => {
    const request = new NextRequest('http://localhost/api/classes?namespace=%20%20');
    const result = getNamespaceContext(request, systemAdmin);
    // Note: whitespace is passed through - repository layer handles validation
    expect(result).toBe('  ');
  });
});

describe('Cross-namespace permission matrix', () => {
  /**
   * Comprehensive permission matrix for cross-namespace operations.
   * This documents which users can manage which other users.
   */

  const users = {
    sysAdmin: systemAdmin,
    nsAdminA: namespaceAAdmin,
    nsAdminB: namespaceBAdmin,
    instructorA: namespaceAInstructor,
    instructorB: namespaceBInstructor,
    studentA: namespaceAStudent,
    studentB: namespaceBStudent,
  };

  // Test matrix: [actor, target, expected]
  const permissionMatrix: [keyof typeof users, keyof typeof users, boolean][] = [
    // System admin can manage everyone
    ['sysAdmin', 'nsAdminA', true],
    ['sysAdmin', 'nsAdminB', true],
    ['sysAdmin', 'instructorA', true],
    ['sysAdmin', 'instructorB', true],
    ['sysAdmin', 'studentA', true],
    ['sysAdmin', 'studentB', true],

    // Namespace admin A can only manage users in namespace A (except other admins)
    ['nsAdminA', 'instructorA', true],
    ['nsAdminA', 'studentA', true],
    ['nsAdminA', 'nsAdminB', false],      // Cross-namespace
    ['nsAdminA', 'instructorB', false],   // Cross-namespace
    ['nsAdminA', 'studentB', false],      // Cross-namespace

    // Namespace admin B can only manage users in namespace B (except other admins)
    ['nsAdminB', 'instructorB', true],
    ['nsAdminB', 'studentB', true],
    ['nsAdminB', 'nsAdminA', false],      // Cross-namespace
    ['nsAdminB', 'instructorA', false],   // Cross-namespace
    ['nsAdminB', 'studentA', false],      // Cross-namespace

    // Instructors can only manage students in their namespace
    ['instructorA', 'studentA', true],
    ['instructorA', 'studentB', false],   // Cross-namespace
    ['instructorA', 'instructorB', false], // Cannot manage instructors
    ['instructorB', 'studentB', true],
    ['instructorB', 'studentA', false],   // Cross-namespace

    // Students cannot manage anyone
    ['studentA', 'studentA', false],
    ['studentA', 'studentB', false],
    ['studentA', 'instructorA', false],
    ['studentB', 'studentB', false],
    ['studentB', 'instructorB', false],
  ];

  it.each(permissionMatrix)(
    '%s can manage %s: %s',
    (actorKey, targetKey, expected) => {
      const actor = users[actorKey];
      const target = users[targetKey];
      const rbac = new RBACService(actor);
      expect(rbac.canManageUser(actor, target)).toBe(expected);
    }
  );
});
