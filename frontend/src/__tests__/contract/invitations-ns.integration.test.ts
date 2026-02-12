/**
 * Contract tests for namespace-scoped invitation API functions.
 * Validates that the typed API functions work correctly against the real backend.
 *
 * Covers all 4 functions from invitations.ts:
 *   1. listInvitations(namespaceId, filters?)
 *   2. createInvitation(namespaceId, email, targetRole, expiresInDays?)
 *   3. resendInvitation(namespaceId, invitationId)
 *   4. revokeInvitation(namespaceId, invitationId)
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import { listInvitations, createInvitation, revokeInvitation, resendInvitation } from '@/lib/api/invitations';
import { expectSnakeCaseKeys, expectString, expectNullableString } from './validators';

/** Validate the shape of a SerializedInvitation object. */
function validateInvitationShape(inv: object) {
  expectSnakeCaseKeys(inv, 'SerializedInvitation');
  expectString(inv, 'id');
  expectString(inv, 'email');
  expectString(inv, 'target_role');
  expectString(inv, 'namespace_id');
  expectString(inv, 'created_by');
  expectString(inv, 'created_at');
  expectString(inv, 'expires_at');
  expectNullableString(inv, 'consumed_at');
  expectNullableString(inv, 'consumed_by');
  expectNullableString(inv, 'revoked_at');
}

describe('Namespace Invitations API', () => {
  // Track the invitation created during tests so we can clean up
  let createdInvitationId: string | null = null;

  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(async () => {
    // Clean up: revoke the created invitation if it was not already revoked
    if (createdInvitationId) {
      try {
        await revokeInvitation(state.namespaceId, createdInvitationId);
      } catch {
        // Best-effort cleanup; ignore errors (may already be revoked)
      }
    }
    resetAuthProvider();
  });

  // -----------------------------------------------------------------------
  // 1. createInvitation
  // -----------------------------------------------------------------------
  describe('createInvitation()', () => {
    it('creates an invitation and returns SerializedInvitation with correct snake_case shape', async () => {
      const namespaceId = state.namespaceId;
      expect(namespaceId).toBeTruthy();

      const email = `contract-ns-invite-${Date.now()}@test.local`;
      const inv = await createInvitation(namespaceId, email, 'instructor');

      createdInvitationId = inv.id;

      validateInvitationShape(inv);

      // Verify the values match what we sent
      expect(inv.email).toBe(email);
      expect(inv.namespace_id).toBe(namespaceId);
      expect(inv.target_role).toBe('instructor');
    });

    it('accepts optional expiresInDays parameter', async () => {
      const namespaceId = state.namespaceId;
      expect(namespaceId).toBeTruthy();

      const email = `contract-ns-expiry-${Date.now()}@test.local`;
      const inv = await createInvitation(namespaceId, email, 'instructor', 14);

      validateInvitationShape(inv);
      expect(inv.email).toBe(email);

      // Clean up this extra invitation immediately
      try {
        await revokeInvitation(namespaceId, inv.id);
      } catch {
        // Best-effort cleanup
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. resendInvitation
  // -----------------------------------------------------------------------
  describe('resendInvitation()', () => {
    it('resends the invitation and returns SerializedInvitation with correct shape', async () => {
      if (!createdInvitationId) {
        console.warn('Skipping resendInvitation: no invitation was created');
        return;
      }

      const inv = await resendInvitation(state.namespaceId, createdInvitationId);

      validateInvitationShape(inv);
      expect(inv.id).toBe(createdInvitationId);
    });
  });

  // -----------------------------------------------------------------------
  // 3. revokeInvitation
  // -----------------------------------------------------------------------
  describe('revokeInvitation()', () => {
    it('revokes an invitation without throwing (void return)', async () => {
      if (!createdInvitationId) {
        console.warn('Skipping revokeInvitation: no invitation was created');
        return;
      }

      // revokeInvitation returns void; if it does not throw, the contract is satisfied.
      await expect(
        revokeInvitation(state.namespaceId, createdInvitationId)
      ).resolves.toBeUndefined();

      // Mark as cleaned up so afterAll does not attempt double-revoke
      createdInvitationId = null;
    });
  });

  // -----------------------------------------------------------------------
  // 4. listInvitations
  // -----------------------------------------------------------------------
  describe('listInvitations()', () => {
    it('returns SerializedInvitation[] with correct snake_case shape', async () => {
      const namespaceId = state.namespaceId;
      expect(namespaceId).toBeTruthy();

      const invitations = await listInvitations(namespaceId);

      expect(Array.isArray(invitations)).toBe(true);

      // The test environment should have at least one invitation (from setup or our own test)
      if (invitations.length > 0) {
        validateInvitationShape(invitations[0]);

        // Verify role values are valid
        expect(['instructor', 'namespace-admin']).toContain(invitations[0].target_role);
      }
    });

    it('accepts optional status filter', async () => {
      const namespaceId = state.namespaceId;
      expect(namespaceId).toBeTruthy();

      const invitations = await listInvitations(namespaceId, { status: 'revoked' });

      expect(Array.isArray(invitations)).toBe(true);

      // All returned invitations should have revoked status
      for (const inv of invitations) {
        expect(inv.revoked_at).not.toBeNull();
      }
    });

    it('accepts optional email filter', async () => {
      const namespaceId = state.namespaceId;
      expect(namespaceId).toBeTruthy();

      const invitations = await listInvitations(namespaceId, {
        email: 'nonexistent-filter-test@test.local',
      });

      expect(Array.isArray(invitations)).toBe(true);
      // With a nonexistent email filter we expect no results
      expect(invitations.length).toBe(0);
    });
  });
});
