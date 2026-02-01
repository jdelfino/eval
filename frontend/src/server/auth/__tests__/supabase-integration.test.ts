/**
 * Integration tests for Supabase Auth flows
 *
 * These tests run against a real local Supabase instance and validate
 * end-to-end authentication workflows.
 *
 * Prerequisites:
 * - Local Supabase instance running (`npx supabase start`)
 * - Environment variables set (NEXT_PUBLIC_SUPABASE_URL, etc.)
 * - Database migrations applied
 *
 * These tests are SKIPPED when Supabase credentials are not available.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthProvider } from '../supabase-provider';
import { UserRole } from '../types';

// Skip these tests if Supabase credentials are not available
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
const hasSupabaseCredentials = Boolean(supabaseUrl && serviceRoleKey);

const describeIfSupabase = hasSupabaseCredentials ? describe : describe.skip;

describeIfSupabase('Supabase Auth Integration', () => {
  let supabase: SupabaseClient;
  let authProvider: SupabaseAuthProvider;

  beforeAll(() => {
    supabase = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    authProvider = new SupabaseAuthProvider();
  });

  afterEach(async () => {
    // Clean up test users
    try {
      const { data: users } = await supabase.auth.admin.listUsers();
      for (const user of users.users) {
        if (user.email?.endsWith('@integration-test.local')) {
          await supabase.auth.admin.deleteUser(user.id);
        }
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Registration', () => {
    it('should create auth.users + user_profiles on signUp', async () => {
      const email = 'test-register@integration-test.local';
      const password = 'testpassword123';
      const role: UserRole = 'student';
      const namespaceId = 'default';

      const user = await authProvider.signUp(email, password, role, namespaceId);

      expect(user.id).toBeDefined();
      expect(user.email).toBe(email);
      expect(user.role).toBe(role);
      expect(user.namespaceId).toBe(namespaceId);

      // Verify auth.users
      const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
      expect(authUser?.user?.email).toBe(email);

      // Verify user_profiles
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      expect(profile.role).toBe(role);
      expect(profile.namespace_id).toBe(namespaceId);
    });

    it('should rollback on profile creation failure', async () => {
      // Try to create user with invalid namespace (should fail FK constraint)
      await expect(
        authProvider.signUp(
          'test-rollback@integration-test.local',
          'password123',
          'student' as UserRole,
          'nonexistent-namespace-xyz'
        )
      ).rejects.toThrow();

      // Verify auth.users was NOT created (rolled back)
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users.users.find(u => u.email === 'test-rollback@integration-test.local');
      expect(user).toBeUndefined();
    });

    it('should reject duplicate email', async () => {
      const email = 'duplicate@integration-test.local';

      await authProvider.signUp(email, 'password123', 'student' as UserRole, 'default');

      await expect(
        authProvider.signUp(email, 'password123', 'student' as UserRole, 'default')
      ).rejects.toThrow();
    });

    it('should create system-admin without namespace', async () => {
      const email = 'sysadmin@integration-test.local';
      const password = 'testpassword123';
      const role: UserRole = 'system-admin';

      const user = await authProvider.signUp(email, password, role, null);

      expect(user.role).toBe('system-admin');
      expect(user.namespaceId).toBeNull();

      // Verify profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      expect(profile.role).toBe('system-admin');
      expect(profile.namespace_id).toBeNull();
    });
  });

  describe('Sign-in', () => {
    const testEmail = 'signin-test@integration-test.local';
    const testPassword = 'password123';

    beforeEach(async () => {
      // Create test user
      await authProvider.signUp(
        testEmail,
        testPassword,
        'student' as UserRole,
        'default'
      );
    });

    it('should authenticate with valid credentials', async () => {
      const user = await authProvider.authenticateWithPassword(testEmail, testPassword);

      expect(user).toBeDefined();
      expect(user!.email).toBe(testEmail);
      expect(user!.role).toBe('student');
    });

    it('should return null for invalid credentials', async () => {
      const user = await authProvider.authenticateWithPassword(testEmail, 'wrongpassword');

      expect(user).toBeNull();
    });

    it('should return null for nonexistent user', async () => {
      const user = await authProvider.authenticateWithPassword(
        'nonexistent@integration-test.local',
        'password123'
      );

      expect(user).toBeNull();
    });
  });

  describe('Session management', () => {
    let testUserId: string;
    let accessToken: string;

    beforeEach(async () => {
      // Create and sign in user
      const user = await authProvider.signUp(
        'session-test@integration-test.local',
        'password123',
        'student' as UserRole,
        'default'
      );
      testUserId = user.id;

      // Sign in to get access token
      const { data } = await supabase.auth.signInWithPassword({
        email: 'session-test@integration-test.local',
        password: 'password123'
      });

      if (!data.session) {
        throw new Error('Failed to create session');
      }

      accessToken = data.session.access_token;
    });

    it('should validate JWT and return session', async () => {
      const session = await authProvider.getSession(accessToken);

      expect(session).toBeDefined();
      expect(session!.user.id).toBe(testUserId);
    });

    it('should return null for expired/invalid JWT', async () => {
      const session = await authProvider.getSession('invalid-jwt-token');

      expect(session).toBeNull();
    });

    it('should handle session expiration gracefully', async () => {
      // This test validates that the session validation logic handles expired tokens
      // In a real scenario, we'd need to wait for token expiration or mock the time

      // For now, just verify that invalid tokens return null
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjF9.invalid';
      const session = await authProvider.getSession(expiredToken);

      expect(session).toBeNull();
    });
  });

  describe('User profile operations', () => {
    let testUserId: string;

    beforeEach(async () => {
      const user = await authProvider.signUp(
        'profile-test@integration-test.local',
        'password123',
        'student' as UserRole,
        'default'
      );
      testUserId = user.id;
    });

    it('should fetch user by ID', async () => {
      const user = await authProvider.getUser(testUserId);

      expect(user).toBeDefined();
      expect(user!.id).toBe(testUserId);
    });

    it('should update user profile', async () => {
      await authProvider.updateUser(testUserId, {
        displayName: 'Updated Name'
      });

      const user = await authProvider.getUser(testUserId);
      expect(user!.displayName).toBe('Updated Name');
    });

    it('should update user role', async () => {
      await authProvider.updateUser(testUserId, {
        role: 'instructor' as UserRole
      });

      const user = await authProvider.getUser(testUserId);
      expect(user!.role).toBe('instructor');
    });

    it('should delete user', async () => {
      await authProvider.deleteUser(testUserId);

      const user = await authProvider.getUser(testUserId);
      expect(user).toBeNull();

      // Verify auth.users was deleted
      const { data: authUser } = await supabase.auth.admin.getUserById(testUserId);
      expect(authUser.user).toBeNull();
    });
  });

  describe('Admin operations', () => {
    it('should list all users with admin client', async () => {
      // Create multiple test users
      await authProvider.signUp(
        'admin-test-1@integration-test.local',
        'password123',
        'student' as UserRole,
        'default'
      );
      await authProvider.signUp(
        'admin-test-2@integration-test.local',
        'password123',
        'instructor' as UserRole,
        'default'
      );

      const adminClient = authProvider.getSupabaseClient('admin');

      // Query user_profiles via auth users (since we removed username)
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const testUsers = authUsers.users.filter(u =>
        u.email === 'admin-test-1@integration-test.local' ||
        u.email === 'admin-test-2@integration-test.local'
      );

      expect(testUsers.length).toBe(2);
    });

    it('should update user email via admin API', async () => {
      const user = await authProvider.signUp(
        'update-email-test@integration-test.local',
        'password123',
        'student' as UserRole,
        'default'
      );

      const adminClient = authProvider.getSupabaseClient('admin');
      const newEmail = 'updated-email@integration-test.local';

      // Update email via admin API
      const { error } = await adminClient.auth.admin.updateUserById(user.id, {
        email: newEmail
      });

      expect(error).toBeNull();

      // Verify email was updated
      const { data: authUser } = await adminClient.auth.admin.getUserById(user.id);
      expect(authUser.user?.email).toBe(newEmail);
    });
  });

  describe('Edge cases', () => {
    it('should handle concurrent signUp attempts for same email', async () => {
      const email = 'concurrent@integration-test.local';

      // Both should fail except the first one that succeeds
      const promises = [
        authProvider.signUp(email, 'password123', 'student' as UserRole, 'default'),
        authProvider.signUp(email, 'password123', 'student' as UserRole, 'default')
      ];

      const results = await Promise.allSettled(promises);

      // Only one should succeed
      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);
    });

    it('should handle deleteUser with nonexistent user ID', async () => {
      const nonexistentId = '00000000-0000-0000-0000-000000000000';

      await expect(
        authProvider.deleteUser(nonexistentId)
      ).rejects.toThrow();
    });
  });
});
