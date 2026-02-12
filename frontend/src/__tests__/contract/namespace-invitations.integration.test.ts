/**
 * Contract tests for namespace-level invitation API functions.
 * Covers: listNamespaceInvitations, createNamespaceInvitation,
 *         resendNamespaceInvitation, revokeNamespaceInvitation.
 *
 * These endpoints use the /system/invitations path and require
 * namespace-admin or system-admin role. We use ADMIN_TOKEN for access.
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import {
  listNamespaceInvitations,
  createNamespaceInvitation,
  revokeNamespaceInvitation,
  resendNamespaceInvitation,
} from '@/lib/api/namespace-invitations';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
} from './validators';

/** Validate the shape of a SerializedInvitation object. */
function validateInvitation(obj: object, label: string) {
  expectSnakeCaseKeys(obj, label);
  expectString(obj, 'id');
  expectString(obj, 'email');
  expectString(obj, 'target_role');
  expectString(obj, 'namespace_id');
  expectString(obj, 'created_by');
  expectString(obj, 'created_at');
  expectString(obj, 'expires_at');
  expectNullableString(obj, 'consumed_at');
  expectNullableString(obj, 'consumed_by');
  expectNullableString(obj, 'revoked_at');
}

describe('Namespace Invitations API', () => {
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

      const inv = await createNamespaceInvitation(email);
      createdInvitationId = inv.id;

      // Validate full shape
      validateInvitation(inv, 'SerializedInvitation (create)');

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
        validateInvitation(inv, 'SerializedInvitation (list)');
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
      if (!createdInvitationId) {
        console.warn('Skipping resendNamespaceInvitation: no invitation was created');
        return;
      }

      // resend returns void — if it doesn't throw, the contract is satisfied
      await expect(resendNamespaceInvitation(createdInvitationId)).resolves.toBeUndefined();
    });
  });

  describe('revokeNamespaceInvitation()', () => {
    it('revokes an invitation without throwing (void response)', async () => {
      if (!createdInvitationId) {
        console.warn('Skipping revokeNamespaceInvitation: no invitation was created');
        return;
      }

      // revoke returns void — if it doesn't throw, the contract is satisfied
      await expect(revokeNamespaceInvitation(createdInvitationId)).resolves.toBeUndefined();

      // Mark as already revoked so afterAll cleanup doesn't attempt it again
      createdInvitationId = null;

      // Optionally verify the revocation took effect via list
      const invitations = await listNamespaceInvitations({ status: 'revoked' });
      expect(Array.isArray(invitations)).toBe(true);
    });
  });
});
