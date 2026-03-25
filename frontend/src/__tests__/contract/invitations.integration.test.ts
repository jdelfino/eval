/**
 * Contract tests for system invitation API functions.
 * Validates that the typed API functions work correctly against the real backend.
 *
 * Note: The system invitations endpoints require system-admin role.
 * This test uses the admin token which has full access.
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import { listSystemInvitations, createSystemInvitation, revokeSystemInvitation } from '@/lib/api/system';
import { state } from './shared-state';

describe('listSystemInvitations()', () => {
  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns SerializedInvitation[] with correct snake_case shape', async () => {
    const invitations = await listSystemInvitations();

    expect(Array.isArray(invitations)).toBe(true);

    // If there are invitations, validate the shape
    if (invitations.length > 0) {
      const inv = invitations[0];

      expect(typeof inv.id).toBe('string');
      expect(typeof inv.email).toBe('string');
      expect(typeof inv.target_role).toBe('string');
      expect(typeof inv.namespace_id).toBe('string');
      expect(typeof inv.created_by).toBe('string');
      expect(typeof inv.created_at).toBe('string');
      expect(typeof inv.expires_at).toBe('string');
      expect(inv.consumed_at === null || typeof inv.consumed_at === 'string').toBe(true);
      expect(inv.consumed_by === null || typeof inv.consumed_by === 'string').toBe(true);
      expect(inv.revoked_at === null || typeof inv.revoked_at === 'string').toBe(true);

      // Verify role is one of the expected values
      expect(['instructor', 'namespace-admin']).toContain(inv.target_role);
    }
  });
});

describe('createSystemInvitation()', () => {
  let createdInvitationId: string | null = null;

  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(async () => {
    // Clean up: revoke the created invitation if it was created
    if (createdInvitationId) {
      try {
        await revokeSystemInvitation(createdInvitationId);
      } catch {
        // Best-effort cleanup; don't fail the test suite
      }
    }
    resetAuthProvider();
  });

  it('creates an invitation and returns SerializedInvitation with correct snake_case shape', async () => {
    const email = `contract-create-test-${Date.now()}@test.local`;
    const namespaceId = state.namespaceId;
    expect(namespaceId).toBeTruthy();

    const inv = await createSystemInvitation(email, namespaceId, 'instructor');
    createdInvitationId = inv.id;

    // Validate required string fields
    expect(typeof inv.id).toBe('string');
    expect(typeof inv.email).toBe('string');
    expect(typeof inv.target_role).toBe('string');
    expect(typeof inv.namespace_id).toBe('string');
    expect(typeof inv.created_by).toBe('string');
    expect(typeof inv.created_at).toBe('string');
    expect(typeof inv.expires_at).toBe('string');

    // Validate nullable fields
    expect(inv.consumed_at === null || typeof inv.consumed_at === 'string').toBe(true);
    expect(inv.consumed_by === null || typeof inv.consumed_by === 'string').toBe(true);
    expect(inv.revoked_at === null || typeof inv.revoked_at === 'string').toBe(true);

    // Verify the values match what we sent
    expect(inv.email).toBe(email);
    expect(inv.namespace_id).toBe(namespaceId);
    expect(inv.target_role).toBe('instructor');
  });
});

describe('revokeSystemInvitation()', () => {
  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('revokes an invitation and verifies revocation took effect', async () => {
    const email = `contract-revoke-test-${Date.now()}@test.local`;
    const namespaceId = state.namespaceId;
    expect(namespaceId).toBeTruthy();

    // Create an invitation to revoke
    const inv = await createSystemInvitation(email, namespaceId, 'namespace-admin');
    expect(inv.id).toBeTruthy();

    // Revoke should complete without throwing
    await expect(revokeSystemInvitation(inv.id)).resolves.toBeUndefined();

    // Verify the invitation now shows as revoked
    const invitations = await listSystemInvitations({ status: 'revoked' });
    const revoked = invitations.find(i => i.id === inv.id);
    expect(revoked).toBeDefined();
    expect(revoked!.revoked_at).not.toBeNull();
  });
});
