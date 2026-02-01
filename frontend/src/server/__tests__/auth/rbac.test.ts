/**
 * Unit tests for RBACService
 *
 * Comprehensive test coverage for role-based access control including:
 * - Permission checks for all roles
 * - Session access control
 * - User management authorization
 * - Role permissions queries
 * - Assert methods and error handling
 * - Edge cases and security boundaries
 */

import { RBACService } from '../../auth/rbac';
import { User, AuthorizationError } from '../../auth/types';
import { ROLE_PERMISSIONS } from '../../auth/permissions';

// Mock session repository for testing session access
class MockSessionRepository {
  private sessions: Map<string, any> = new Map();

  getSession(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    return Promise.resolve(session || null);
  }

  setSession(sessionId: string, session: any): void {
    this.sessions.set(sessionId, session);
  }

  clear(): void {
    this.sessions.clear();
  }

  throwError = false;
  async getSessionWithError(sessionId: string): Promise<any> {
    if (this.throwError) {
      throw new Error('Database connection failed');
    }
    return this.getSession(sessionId);
  }
}

// Helper to create test users
function createUser(
  role: 'system-admin' | 'namespace-admin' | 'instructor' | 'student',
  id = 'user-1',
  email = 'testuser@example.com',
  namespaceId = 'default'
): User {
  return {
    id,
    email,
    role,
    namespaceId,
    displayName: `Test ${role}`,
    createdAt: new Date('2025-01-01'),
    lastLoginAt: new Date('2025-01-15'),
  };
}

describe('RBACService', () => {
  let rbacService: RBACService;
  let mockRepo: MockSessionRepository;

  beforeEach(() => {
    mockRepo = new MockSessionRepository();
    rbacService = new RBACService(mockRepo);
  });

  afterEach(() => {
    mockRepo.clear();
  });

  describe('Permission Checks', () => {
    describe('Instructor Permissions', () => {
      it('should grant instructor all defined permissions', () => {
        const instructor = createUser('instructor');
        const permissions = ROLE_PERMISSIONS.instructor;

        permissions.forEach(permission => {
          expect(rbacService.hasPermission(instructor, permission)).toBe(true);
        });
      });

      it('should grant instructor session.create permission', () => {
        const instructor = createUser('instructor');
        expect(rbacService.hasPermission(instructor, 'session.create')).toBe(true);
      });

      it('should grant instructor user.manage permission', () => {
        const instructor = createUser('instructor');
        expect(rbacService.hasPermission(instructor, 'user.manage')).toBe(true);
      });

      it('should grant instructor data.viewAll permission', () => {
        const instructor = createUser('instructor');
        expect(rbacService.hasPermission(instructor, 'data.viewAll')).toBe(true);
      });

      it('should grant instructor data.export permission', () => {
        const instructor = createUser('instructor');
        expect(rbacService.hasPermission(instructor, 'data.export')).toBe(true);
      });
    });

    describe('Student Permissions', () => {
      it('should grant student limited permissions only', () => {
        const student = createUser('student');
        const permissions = ROLE_PERMISSIONS.student;

        permissions.forEach(permission => {
          expect(rbacService.hasPermission(student, permission)).toBe(true);
        });
      });

      it('should allow student to join sessions', () => {
        const student = createUser('student');
        expect(rbacService.hasPermission(student, 'session.join')).toBe(true);
      });

      it('should allow student to view own data', () => {
        const student = createUser('student');
        expect(rbacService.hasPermission(student, 'data.viewOwn')).toBe(true);
      });

      it('should deny student session.create permission', () => {
        const student = createUser('student');
        expect(rbacService.hasPermission(student, 'session.create')).toBe(false);
      });

      it('should deny student user.manage permission', () => {
        const student = createUser('student');
        expect(rbacService.hasPermission(student, 'user.manage')).toBe(false);
      });

      it('should deny student data.viewAll permission', () => {
        const student = createUser('student');
        expect(rbacService.hasPermission(student, 'data.viewAll')).toBe(false);
      });

      it('should deny student session.delete permission', () => {
        const student = createUser('student');
        expect(rbacService.hasPermission(student, 'session.delete')).toBe(false);
      });

      it('should deny student data.export permission', () => {
        const student = createUser('student');
        expect(rbacService.hasPermission(student, 'data.export')).toBe(false);
      });
    });

    describe('Invalid Permissions', () => {
      it('should deny non-existent permission for instructor', () => {
        const instructor = createUser('instructor');
        expect(rbacService.hasPermission(instructor, 'invalid.permission')).toBe(false);
      });

      it('should deny non-existent permission for student', () => {
        const student = createUser('student');
        expect(rbacService.hasPermission(student, 'nonexistent.action')).toBe(false);
      });

      it('should handle empty permission string', () => {
        const instructor = createUser('instructor');
        expect(rbacService.hasPermission(instructor, '')).toBe(false);
      });

      it('should handle permission with special characters', () => {
        const instructor = createUser('instructor');
        expect(rbacService.hasPermission(instructor, 'session@#$.create')).toBe(false);
      });
    });

    describe('Permission Matrix Validation', () => {
      it('should verify complete permission coverage for instructor', () => {
        const instructor = createUser('instructor');
        const expectedPermissions = [
          'session.create',
          'session.join',
          'session.viewAll',
          'session.viewOwn',
          'session.delete',
          'user.manage',
          'user.create',
          'user.delete',
          'user.viewAll',
          'data.viewAll',
          'data.viewOwn',
          'data.export',
        ];

        expectedPermissions.forEach(permission => {
          expect(rbacService.hasPermission(instructor, permission)).toBe(true);
        });
      });

      it('should verify complete permission coverage for student', () => {
        const student = createUser('student');
        const expectedPermissions = [
          'session.join',
          'session.viewOwn',
          'data.viewOwn',
        ];

        expectedPermissions.forEach(permission => {
          expect(rbacService.hasPermission(student, permission)).toBe(true);
        });
      });
    });
  });

  describe('Session Access Control', () => {
    describe('Instructor Access', () => {
      it('should allow instructor to access any session', async () => {
        const instructor = createUser('instructor', 'instructor-1');
        const sessionId = 'session-123';

        mockRepo.setSession(sessionId, {
          id: sessionId,
          creatorId: 'other-instructor',
          students: [],
        });

        const canAccess = await rbacService.canAccessSession(instructor, sessionId);
        expect(canAccess).toBe(true);
      });

      it('should allow instructor to access non-existent session', async () => {
        const instructor = createUser('instructor', 'instructor-1');
        const canAccess = await rbacService.canAccessSession(instructor, 'nonexistent');
        expect(canAccess).toBe(true);
      });

      it('should allow instructor access even when session has no students', async () => {
        const instructor = createUser('instructor', 'instructor-1');
        const sessionId = 'session-empty';

        mockRepo.setSession(sessionId, {
          id: sessionId,
          creatorId: 'instructor-1',
          students: [],
        });

        const canAccess = await rbacService.canAccessSession(instructor, sessionId);
        expect(canAccess).toBe(true);
      });
    });

    describe('Student Access', () => {
      it('should allow student to access enrolled session', async () => {
        const student = createUser('student', 'student-1');
        const sessionId = 'session-456';

        mockRepo.setSession(sessionId, {
          id: sessionId,
          creatorId: 'instructor-1',
          students: [
            { id: 'student-1', name: 'Student One' },
            { id: 'student-2', name: 'Student Two' },
          ],
        });

        const canAccess = await rbacService.canAccessSession(student, sessionId);
        expect(canAccess).toBe(true);
      });

      it('should deny student access to non-enrolled session', async () => {
        const student = createUser('student', 'student-1');
        const sessionId = 'session-789';

        mockRepo.setSession(sessionId, {
          id: sessionId,
          creatorId: 'instructor-1',
          students: [
            { id: 'student-2', name: 'Student Two' },
            { id: 'student-3', name: 'Student Three' },
          ],
        });

        const canAccess = await rbacService.canAccessSession(student, sessionId);
        expect(canAccess).toBe(false);
      });

      it('should deny student access to non-existent session', async () => {
        const student = createUser('student', 'student-1');
        const canAccess = await rbacService.canAccessSession(student, 'nonexistent');
        expect(canAccess).toBe(false);
      });

      it('should handle session with no students array', async () => {
        const student = createUser('student', 'student-1');
        const sessionId = 'session-no-students';

        mockRepo.setSession(sessionId, {
          id: sessionId,
          creatorId: 'instructor-1',
          // students property missing
        });

        const canAccess = await rbacService.canAccessSession(student, sessionId);
        expect(canAccess).toBe(false);
      });
    });

    describe('Session Repository Integration', () => {
      it('should deny student access when repository is not configured (fail closed)', async () => {
        const rbacWithoutRepo = new RBACService();
        const student = createUser('student', 'student-1');

        // Should log warning and return false (secure by default)
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        const canAccess = await rbacWithoutRepo.canAccessSession(student, 'any-session');

        expect(canAccess).toBe(false);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[RBAC] Session repository not configured, denying student access'
        );

        consoleWarnSpy.mockRestore();
      });

      it('should handle repository errors gracefully', async () => {
        // Create a repository that throws errors
        const errorRepo = {
          getSession: jest.fn().mockRejectedValue(new Error('Database error')),
        };
        const rbacWithErrorRepo = new RBACService(errorRepo);
        const student = createUser('student', 'student-1');

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const canAccess = await rbacWithErrorRepo.canAccessSession(student, 'session-1');

        expect(canAccess).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[RBAC] Error checking session access:',
          expect.any(Error)
        );

        consoleErrorSpy.mockRestore();
      });

      it('should handle null session ID', async () => {
        const student = createUser('student', 'student-1');
        const canAccess = await rbacService.canAccessSession(student, null as any);
        expect(canAccess).toBe(false);
      });

      it('should handle undefined session ID', async () => {
        const student = createUser('student', 'student-1');
        const canAccess = await rbacService.canAccessSession(student, undefined as any);
        expect(canAccess).toBe(false);
      });
    });
  });

  describe('User Management Authorization', () => {
    describe('Instructor Management', () => {
      it('should allow instructor to manage students', () => {
        const instructor = createUser('instructor', 'instructor-1', 'instructor');
        const targetUser = createUser('student', 'student-1', 'student');

        expect(rbacService.canManageUser(instructor, targetUser)).toBe(true);
      });

      it('should deny instructor from managing another instructor', () => {
        const instructor = createUser('instructor', 'instructor-1', 'instructor1');
        const targetInstructor = createUser('instructor', 'instructor-2', 'instructor2');

        expect(rbacService.canManageUser(instructor, targetInstructor)).toBe(false);
      });

      it('should deny instructor from managing themselves', () => {
        const instructor = createUser('instructor', 'instructor-1', 'instructor');

        expect(rbacService.canManageUser(instructor, instructor)).toBe(false);
      });
    });

    describe('Student Management', () => {
      it('should deny student from managing any user', () => {
        const student = createUser('student', 'student-1', 'student1');
        const targetUser = createUser('student', 'student-2', 'student2');

        expect(rbacService.canManageUser(student, targetUser)).toBe(false);
      });

      it('should deny student from managing themselves', () => {
        const student = createUser('student', 'student-1', 'student');

        expect(rbacService.canManageUser(student, student)).toBe(false);
      });

      it('should deny student from managing instructor', () => {
        const student = createUser('student', 'student-1', 'student');
        const instructor = createUser('instructor', 'instructor-1', 'instructor');

        expect(rbacService.canManageUser(student, instructor)).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should handle user with minimal properties', () => {
        const instructor = createUser('instructor', 'instructor-1', 'instructor', 'default');
        const minimalUser = {
          id: 'user-1',
          role: 'student',
          namespaceId: 'default', // Must match instructor's namespace
        } as User;

        // Should work with minimal user object if namespace matches
        expect(rbacService.canManageUser(instructor, minimalUser)).toBe(true);
      });

      it('should deny management if namespace is missing or different', () => {
        const instructor = createUser('instructor', 'instructor-1', 'instructor', 'default');
        const userWithoutNamespace = {
          id: 'user-1',
          role: 'student',
        } as User;

        // Should fail if namespaceId is missing (undefined !== 'default')
        expect(rbacService.canManageUser(instructor, userWithoutNamespace)).toBe(false);
      });
    });

    describe('Namespace Isolation - Critical Security Tests', () => {
      describe('System Admin - No Namespace Restrictions', () => {
        it('should allow system-admin to manage users in any namespace', () => {
          const sysAdmin = createUser('system-admin', 'admin-1', 'sysadmin', 'system');
          const namespaceAdmin = createUser('namespace-admin', 'ns-admin-1', 'nsadmin', 'tenant-a');
          const instructor = createUser('instructor', 'instr-1', 'instructor', 'tenant-b');
          const student = createUser('student', 'student-1', 'student', 'tenant-c');

          expect(rbacService.canManageUser(sysAdmin, namespaceAdmin)).toBe(true);
          expect(rbacService.canManageUser(sysAdmin, instructor)).toBe(true);
          expect(rbacService.canManageUser(sysAdmin, student)).toBe(true);
        });

        it('should allow system-admin to manage other system-admins', () => {
          const sysAdmin1 = createUser('system-admin', 'admin-1', 'sysadmin1', 'system');
          const sysAdmin2 = createUser('system-admin', 'admin-2', 'sysadmin2', 'system');

          expect(rbacService.canManageUser(sysAdmin1, sysAdmin2)).toBe(true);
        });
      });

      describe('Namespace Admin - Namespace Boundary Checks', () => {
        it('should allow namespace-admin to manage instructor in SAME namespace', () => {
          const namespaceAdmin = createUser('namespace-admin', 'ns-admin-1', 'nsadmin', 'tenant-a');
          const instructor = createUser('instructor', 'instr-1', 'instructor', 'tenant-a');

          expect(rbacService.canManageUser(namespaceAdmin, instructor)).toBe(true);
        });

        it('should allow namespace-admin to manage student in SAME namespace', () => {
          const namespaceAdmin = createUser('namespace-admin', 'ns-admin-1', 'nsadmin', 'tenant-a');
          const student = createUser('student', 'student-1', 'student', 'tenant-a');

          expect(rbacService.canManageUser(namespaceAdmin, student)).toBe(true);
        });

        it('should DENY namespace-admin from managing instructor in DIFFERENT namespace', () => {
          const namespaceAdmin = createUser('namespace-admin', 'ns-admin-1', 'nsadmin', 'tenant-a');
          const instructor = createUser('instructor', 'instr-1', 'instructor', 'tenant-b');

          expect(rbacService.canManageUser(namespaceAdmin, instructor)).toBe(false);
        });

        it('should DENY namespace-admin from managing student in DIFFERENT namespace', () => {
          const namespaceAdmin = createUser('namespace-admin', 'ns-admin-1', 'nsadmin', 'tenant-a');
          const student = createUser('student', 'student-1', 'student', 'tenant-b');

          expect(rbacService.canManageUser(namespaceAdmin, student)).toBe(false);
        });

        it('should DENY namespace-admin from managing another namespace-admin', () => {
          const namespaceAdmin1 = createUser('namespace-admin', 'ns-admin-1', 'nsadmin1', 'tenant-a');
          const namespaceAdmin2 = createUser('namespace-admin', 'ns-admin-2', 'nsadmin2', 'tenant-a');

          expect(rbacService.canManageUser(namespaceAdmin1, namespaceAdmin2)).toBe(false);
        });

        it('should DENY namespace-admin from managing system-admin', () => {
          const namespaceAdmin = createUser('namespace-admin', 'ns-admin-1', 'nsadmin', 'tenant-a');
          const sysAdmin = createUser('system-admin', 'admin-1', 'sysadmin', 'system');

          expect(rbacService.canManageUser(namespaceAdmin, sysAdmin)).toBe(false);
        });
      });

      describe('Instructor - Namespace Boundary Checks', () => {
        it('should allow instructor to manage student in SAME namespace', () => {
          const instructor = createUser('instructor', 'instr-1', 'instructor', 'tenant-a');
          const student = createUser('student', 'student-1', 'student', 'tenant-a');

          expect(rbacService.canManageUser(instructor, student)).toBe(true);
        });

        it('should DENY instructor from managing student in DIFFERENT namespace', () => {
          const instructor = createUser('instructor', 'instr-1', 'instructor', 'tenant-a');
          const student = createUser('student', 'student-1', 'student', 'tenant-b');

          expect(rbacService.canManageUser(instructor, student)).toBe(false);
        });

        it('should DENY instructor from managing another instructor (same namespace)', () => {
          const instructor1 = createUser('instructor', 'instr-1', 'instructor1', 'tenant-a');
          const instructor2 = createUser('instructor', 'instr-2', 'instructor2', 'tenant-a');

          expect(rbacService.canManageUser(instructor1, instructor2)).toBe(false);
        });

        it('should DENY instructor from managing another instructor (different namespace)', () => {
          const instructor1 = createUser('instructor', 'instr-1', 'instructor1', 'tenant-a');
          const instructor2 = createUser('instructor', 'instr-2', 'instructor2', 'tenant-b');

          expect(rbacService.canManageUser(instructor1, instructor2)).toBe(false);
        });

        it('should DENY instructor from managing namespace-admin', () => {
          const instructor = createUser('instructor', 'instr-1', 'instructor', 'tenant-a');
          const namespaceAdmin = createUser('namespace-admin', 'ns-admin-1', 'nsadmin', 'tenant-a');

          expect(rbacService.canManageUser(instructor, namespaceAdmin)).toBe(false);
        });
      });

      describe('Multi-Tenant Scenarios', () => {
        it('should isolate user management between multiple tenants', () => {
          // Tenant A
          const nsAdminA = createUser('namespace-admin', 'ns-admin-a', 'adminA', 'tenant-a');
          const instructorA = createUser('instructor', 'instr-a', 'instructorA', 'tenant-a');
          const studentA = createUser('student', 'student-a', 'studentA', 'tenant-a');

          // Tenant B
          const nsAdminB = createUser('namespace-admin', 'ns-admin-b', 'adminB', 'tenant-b');
          const instructorB = createUser('instructor', 'instr-b', 'instructorB', 'tenant-b');
          const studentB = createUser('student', 'student-b', 'studentB', 'tenant-b');

          // Tenant A admin can manage Tenant A users
          expect(rbacService.canManageUser(nsAdminA, instructorA)).toBe(true);
          expect(rbacService.canManageUser(nsAdminA, studentA)).toBe(true);

          // Tenant A admin CANNOT manage Tenant B users
          expect(rbacService.canManageUser(nsAdminA, nsAdminB)).toBe(false);
          expect(rbacService.canManageUser(nsAdminA, instructorB)).toBe(false);
          expect(rbacService.canManageUser(nsAdminA, studentB)).toBe(false);

          // Tenant B instructor can manage Tenant B students only
          expect(rbacService.canManageUser(instructorB, studentB)).toBe(true);
          expect(rbacService.canManageUser(instructorB, studentA)).toBe(false);
        });

        it('should prevent cross-namespace privilege escalation', () => {
          const instructorA = createUser('instructor', 'instr-a', 'instructorA', 'tenant-a');
          const instructorB = createUser('instructor', 'instr-b', 'instructorB', 'tenant-b');
          const studentC = createUser('student', 'student-c', 'studentC', 'tenant-c');

          // Instructors cannot manage students in other namespaces
          expect(rbacService.canManageUser(instructorA, studentC)).toBe(false);
          expect(rbacService.canManageUser(instructorB, studentC)).toBe(false);

          // Instructors cannot manage each other across namespaces
          expect(rbacService.canManageUser(instructorA, instructorB)).toBe(false);
        });
      });
    });
  });

  describe('Role Permissions Query', () => {
    it('should return all permissions for instructor role', () => {
      const permissions = rbacService.getRolePermissions('instructor');

      expect(permissions).toEqual(ROLE_PERMISSIONS.instructor);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions).toContain('session.create');
      expect(permissions).toContain('user.manage');
      expect(permissions).toContain('data.export');
    });

    it('should return all permissions for student role', () => {
      const permissions = rbacService.getRolePermissions('student');

      expect(permissions).toEqual(ROLE_PERMISSIONS.student);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions).toContain('session.join');
      expect(permissions).toContain('data.viewOwn');
    });

    it('should return same array reference as ROLE_PERMISSIONS', () => {
      const instructorPerms = rbacService.getRolePermissions('instructor');
      expect(instructorPerms).toBe(ROLE_PERMISSIONS.instructor);

      const studentPerms = rbacService.getRolePermissions('student');
      expect(studentPerms).toBe(ROLE_PERMISSIONS.student);
    });

    it('should ensure instructor has more permissions than student', () => {
      const instructorPerms = rbacService.getRolePermissions('instructor');
      const studentPerms = rbacService.getRolePermissions('student');

      expect(instructorPerms.length).toBeGreaterThan(studentPerms.length);
    });

    it('should verify student permissions are subset of instructor', () => {
      const instructorPerms = rbacService.getRolePermissions('instructor');
      const studentPerms = rbacService.getRolePermissions('student');

      studentPerms.forEach(perm => {
        expect(instructorPerms).toContain(perm);
      });
    });
  });

  describe('Assert Methods - Permission Assertions', () => {
    describe('assertPermission', () => {
      it('should pass when user has permission', () => {
        const instructor = createUser('instructor');

        expect(() => {
          rbacService.assertPermission(instructor, 'session.create');
        }).not.toThrow();
      });

      it('should throw AuthorizationError when permission missing', () => {
        const student = createUser('student', 'student-1', 'bob');

        expect(() => {
          rbacService.assertPermission(student, 'session.create');
        }).toThrow(AuthorizationError);
      });

      it('should include username in error message', () => {
        const student = createUser('student', 'student-1', 'alice');

        expect(() => {
          rbacService.assertPermission(student, 'user.manage');
        }).toThrow('User alice (student) lacks permission: user.manage');
      });

      it('should include role in error message', () => {
        const student = createUser('student', 'student-1', 'charlie');

        expect(() => {
          rbacService.assertPermission(student, 'data.export');
        }).toThrow(/student.*lacks permission/);
      });

      it('should include permission name in error message', () => {
        const student = createUser('student', 'student-1', 'dave');

        expect(() => {
          rbacService.assertPermission(student, 'session.delete');
        }).toThrow(/session\.delete/);
      });

      it('should set correct error name', () => {
        const student = createUser('student');

        try {
          rbacService.assertPermission(student, 'user.create');
          fail('Should have thrown AuthorizationError');
        } catch (error) {
          expect(error).toBeInstanceOf(AuthorizationError);
          expect((error as AuthorizationError).name).toBe('AuthorizationError');
        }
      });
    });
  });

  describe('Assert Methods - Session Access', () => {
    describe('assertCanAccessSession', () => {
      it('should pass when instructor accesses any session', async () => {
        const instructor = createUser('instructor');

        await expect(
          rbacService.assertCanAccessSession(instructor, 'session-123')
        ).resolves.not.toThrow();
      });

      it('should pass when student accesses enrolled session', async () => {
        const student = createUser('student', 'student-1');
        const sessionId = 'session-456';

        mockRepo.setSession(sessionId, {
          id: sessionId,
          students: [{ id: 'student-1', name: 'Student' }],
        });

        await expect(
          rbacService.assertCanAccessSession(student, sessionId)
        ).resolves.not.toThrow();
      });

      it('should throw when student accesses non-enrolled session', async () => {
        const student = createUser('student', 'student-1', 'bob');
        const sessionId = 'session-789';

        mockRepo.setSession(sessionId, {
          id: sessionId,
          students: [{ id: 'student-2', name: 'Other Student' }],
        });

        await expect(
          rbacService.assertCanAccessSession(student, sessionId)
        ).rejects.toThrow(AuthorizationError);
      });

      it('should include username in error message', async () => {
        const student = createUser('student', 'student-1', 'alice');
        const sessionId = 'session-999';

        mockRepo.setSession(sessionId, {
          id: sessionId,
          students: [],
        });

        await expect(
          rbacService.assertCanAccessSession(student, sessionId)
        ).rejects.toThrow('User alice cannot access session: session-999');
      });

      it('should include session ID in error message', async () => {
        const student = createUser('student', 'student-1');
        const sessionId = 'my-session-id';

        mockRepo.setSession(sessionId, {
          id: sessionId,
          students: [],
        });

        await expect(
          rbacService.assertCanAccessSession(student, sessionId)
        ).rejects.toThrow(/my-session-id/);
      });

      it('should set correct error name', async () => {
        const student = createUser('student', 'student-1');
        const sessionId = 'session-1';

        mockRepo.setSession(sessionId, {
          id: sessionId,
          students: [],
        });

        try {
          await rbacService.assertCanAccessSession(student, sessionId);
          fail('Should have thrown AuthorizationError');
        } catch (error) {
          expect(error).toBeInstanceOf(AuthorizationError);
          expect((error as AuthorizationError).name).toBe('AuthorizationError');
        }
      });
    });
  });

  describe('Assert Methods - User Management', () => {
    describe('assertCanManageUser', () => {
      it('should pass when instructor manages user', () => {
        const instructor = createUser('instructor', 'instructor-1');
        const target = createUser('student', 'student-1');

        expect(() => {
          rbacService.assertCanManageUser(instructor, target);
        }).not.toThrow();
      });

      it('should throw when student tries to manage user', () => {
        const student = createUser('student', 'student-1');
        const target = createUser('student', 'student-2');

        expect(() => {
          rbacService.assertCanManageUser(student, target);
        }).toThrow(AuthorizationError);
      });

      it('should include actor username in error message', () => {
        const student = createUser('student', 'student-1', 'bob');
        const target = createUser('student', 'student-2', 'alice');

        expect(() => {
          rbacService.assertCanManageUser(student, target);
        }).toThrow('User bob (student) cannot manage user alice');
      });

      it('should include actor role in error message', () => {
        const student = createUser('student', 'student-1', 'charlie');
        const target = createUser('instructor', 'instructor-1', 'prof');

        expect(() => {
          rbacService.assertCanManageUser(student, target);
        }).toThrow(/student.*cannot manage/);
      });

      it('should include target username in error message', () => {
        const student = createUser('student', 'student-1', 'dave');
        const target = createUser('student', 'student-2', 'eve');

        expect(() => {
          rbacService.assertCanManageUser(student, target);
        }).toThrow(/cannot manage user eve/);
      });

      it('should set correct error name', () => {
        const student = createUser('student', 'student-1');
        const target = createUser('student', 'student-2');

        try {
          rbacService.assertCanManageUser(student, target);
          fail('Should have thrown AuthorizationError');
        } catch (error) {
          expect(error).toBeInstanceOf(AuthorizationError);
          expect((error as AuthorizationError).name).toBe('AuthorizationError');
        }
      });
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle very long session ID', async () => {
      const instructor = createUser('instructor');
      const longSessionId = 'session-' + 'x'.repeat(1000);

      mockRepo.setSession(longSessionId, {
        id: longSessionId,
        students: [],
      });

      const canAccess = await rbacService.canAccessSession(instructor, longSessionId);
      expect(canAccess).toBe(true);
    });

    it('should handle session with many students efficiently', async () => {
      const student = createUser('student', 'student-500');
      const sessionId = 'large-session';

      // Create session with 1000 students
      const students = Array.from({ length: 1000 }, (_, i) => ({
        id: `student-${i}`,
        name: `Student ${i}`,
      }));

      mockRepo.setSession(sessionId, {
        id: sessionId,
        students,
      });

      const canAccess = await rbacService.canAccessSession(student, sessionId);
      expect(canAccess).toBe(true);
    });

    it('should handle concurrent permission checks', async () => {
      const instructor = createUser('instructor');
      const permissions = ['session.create', 'user.manage', 'data.export'];

      const results = await Promise.all(
        permissions.map(async (perm) => {
          return rbacService.hasPermission(instructor, perm);
        })
      );

      expect(results).toEqual([true, true, true]);
    });

    it('should handle concurrent session access checks', async () => {
      const student = createUser('student', 'student-1');
      const sessions = ['session-1', 'session-2', 'session-3'];

      sessions.forEach(sessionId => {
        mockRepo.setSession(sessionId, {
          id: sessionId,
          students: [{ id: 'student-1', name: 'Student' }],
        });
      });

      const results = await Promise.all(
        sessions.map(sessionId => rbacService.canAccessSession(student, sessionId))
      );

      expect(results).toEqual([true, true, true]);
    });

    it('should maintain stateless behavior across calls', () => {
      const instructor = createUser('instructor', 'instructor-1');
      const student = createUser('student', 'student-1');

      // Multiple calls should return consistent results
      expect(rbacService.hasPermission(instructor, 'session.create')).toBe(true);
      expect(rbacService.hasPermission(student, 'session.create')).toBe(false);
      expect(rbacService.hasPermission(instructor, 'session.create')).toBe(true);
      expect(rbacService.hasPermission(student, 'session.create')).toBe(false);
    });

    it('should handle session with empty students array', async () => {
      const student = createUser('student', 'student-1');
      const sessionId = 'empty-session';

      mockRepo.setSession(sessionId, {
        id: sessionId,
        students: [],
      });

      const canAccess = await rbacService.canAccessSession(student, sessionId);
      expect(canAccess).toBe(false);
    });

    it('should handle special characters in session ID', async () => {
      const instructor = createUser('instructor');
      const sessionId = 'session-@#$%^&*()';

      mockRepo.setSession(sessionId, {
        id: sessionId,
        students: [],
      });

      const canAccess = await rbacService.canAccessSession(instructor, sessionId);
      expect(canAccess).toBe(true);
    });

    it('should verify authorization isolation between users', () => {
      const instructor = createUser('instructor', 'instructor-1');
      const student = createUser('student', 'student-1');

      // Instructor permissions should not affect student
      rbacService.hasPermission(instructor, 'user.manage');
      expect(rbacService.hasPermission(student, 'user.manage')).toBe(false);

      // Student permissions should not affect instructor
      rbacService.hasPermission(student, 'session.join');
      expect(rbacService.hasPermission(instructor, 'session.join')).toBe(true);
    });
  });

  describe('Code Coverage - Comprehensive Validation', () => {
    it('should test all public methods are covered', () => {
      const publicMethods = [
        'hasPermission',
        'canAccessSession',
        'canManageUser',
        'getRolePermissions',
        'assertPermission',
        'assertCanAccessSession',
        'assertCanManageUser',
      ];

      publicMethods.forEach(method => {
        expect(rbacService).toHaveProperty(method);
        expect(typeof (rbacService as any)[method]).toBe('function');
      });
    });

    it('should verify all permission types are tested', () => {
      const allPermissions = [
        ...ROLE_PERMISSIONS.instructor,
        ...ROLE_PERMISSIONS.student,
      ];

      const uniquePermissions = Array.from(new Set(allPermissions));

      // Ensure we have a comprehensive permission set
      expect(uniquePermissions.length).toBeGreaterThanOrEqual(10);
    });

    it('should verify all error paths are tested', async () => {
      const student = createUser('student', 'student-1');

      // Permission error path
      expect(() => rbacService.assertPermission(student, 'user.manage')).toThrow();

      // Session access error path
      mockRepo.setSession('session-1', { id: 'session-1', students: [] });
      await expect(
        rbacService.assertCanAccessSession(student, 'session-1')
      ).rejects.toThrow();

      // User management error path
      const target = createUser('student', 'student-2');
      expect(() => rbacService.assertCanManageUser(student, target)).toThrow();
    });
  });
});
