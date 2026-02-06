/**
 * Integration test: listInvitations()
 * Validates that the typed API function works correctly against the real backend.
 *
 * Note: The invitations endpoints require namespace-admin or higher permissions.
 * This test uses the admin token which has full access.
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import { listInvitations } from '@/lib/api/invitations';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
} from './validators';

describe('listInvitations()', () => {
  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns SerializedInvitation[] with correct snake_case shape', async () => {
    const invitations = await listInvitations();

    expect(Array.isArray(invitations)).toBe(true);

    // If there are invitations, validate the shape
    if (invitations.length > 0) {
      const inv = invitations[0];

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

      // Verify role is one of the expected values
      expect(['instructor', 'namespace-admin']).toContain(inv.target_role);
    }
  });
});
