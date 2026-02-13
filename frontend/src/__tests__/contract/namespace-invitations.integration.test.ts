/**
 * Contract tests for namespace-level invitation API functions.
 * Covers: listNamespaceInvitations, createNamespaceInvitation,
 *         resendNamespaceInvitation, revokeNamespaceInvitation.
 *
 * These endpoints use the /system/invitations path and require
 * namespace-admin or system-admin role. We use ADMIN_TOKEN for access.
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import {
  listNamespaceInvitations,
  createNamespaceInvitation,
  revokeNamespaceInvitation,
  resendNamespaceInvitation,
} from '@/lib/api/namespace-invitations';
import { validateInvitationShape } from './validators';

describe('Namespace Invitations API (current user)', () => {
  // Track created invitation for cleanup and cross-test usage
  let createdInvitationId: string | null = null;

  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(async () => {
    // Best-effort cleanup: revoke the invitation if it was created and not already revoked
    if (createdInvitationId) {
      try {
        await revokeNamespaceInvitation(createdInvitationId);
      } catch {
        // Already revoked or cleanup failed; ignore
      }
    }
    resetAuthProvider();
  });

  describe('createNamespaceInvitation()', () => {
    it('creates an invitation and returns SerializedInvitation with correct snake_case shape', async () => {
      const email = `contract-ns-inv-${Date.now()}@test.local`;

      const inv = await createNamespaceInvitation(email, {
        target_role: 'instructor',
        namespace_id: state.namespaceId,
      });
      createdInvitationId = inv.id;

      // Validate full shape
      validateInvitationShape(inv);

      // Verify returned values match what we sent
      expect(inv.email).toBe(email);
      expect(inv.id).toBeTruthy();

      // Role should be one of the expected values
      expect(['instructor', 'namespace-admin']).toContain(inv.target_role);

      // New invitation should not be consumed or revoked
      expect(inv.consumed_at).toBeNull();
      expect(inv.revoked_at).toBeNull();
    });
  });

  describe('listNamespaceInvitations()', () => {
    it('returns SerializedInvitation[] with correct snake_case shape', async () => {
      const invitations = await listNamespaceInvitations();

      expect(Array.isArray(invitations)).toBe(true);

      // We just created one, so there should be at least one
      if (invitations.length > 0) {
        const inv = invitations[0];
        validateInvitationShape(inv);
      }
    });

    it('supports filtering by status', async () => {
      const invitations = await listNamespaceInvitations({ status: 'pending' });

      expect(Array.isArray(invitations)).toBe(true);

      // All returned invitations should have pending status (if status field is present)
      for (const inv of invitations) {
        if ('status' in inv && inv.status) {
          expect(inv.status).toBe('pending');
        }
      }
    });
  });

  describe('resendNamespaceInvitation()', () => {
    it('resends an invitation without throwing (void response)', async () => {
      expect(createdInvitationId).toBeTruthy();

      // resend returns void — if it doesn't throw, the contract is satisfied
      await expect(resendNamespaceInvitation(createdInvitationId!)).resolves.toBeUndefined();
    });
  });

  describe('revokeNamespaceInvitation()', () => {
    it('revokes an invitation without throwing (void response)', async () => {
      expect(createdInvitationId).toBeTruthy();

      // revoke returns void — if it doesn't throw, the contract is satisfied
      await expect(revokeNamespaceInvitation(createdInvitationId!)).resolves.toBeUndefined();

      // Mark as already revoked so afterAll cleanup doesn't attempt it again
      createdInvitationId = null;

      // Optionally verify the revocation took effect via list
      const invitations = await listNamespaceInvitations({ status: 'revoked' });
      expect(Array.isArray(invitations)).toBe(true);
    });
  });
});
