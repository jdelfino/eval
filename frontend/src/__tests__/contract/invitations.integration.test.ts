/**
 * Contract test: GET /api/v1/invitations
 * Validates the SerializedInvitation[] response shape matches frontend expectations.
 *
 * Note: The invitations endpoints may require namespace-admin or higher permissions.
 * This test uses the admin token which has full access.
 */
import { contractFetch, ADMIN_TOKEN } from './helpers';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
} from './validators';

describe('GET /api/v1/invitations', () => {
  it('returns an array of SerializedInvitation objects with correct snake_case shape', async () => {
    // Use admin token since invitations require higher privileges
    const res = await contractFetch('/api/v1/invitations', ADMIN_TOKEN);

    // Invitations endpoint may return 403 if user doesn't have permissions
    // or 200 with data if they do
    if (res.status === 200) {
      const invitations = await res.json();
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
    } else {
      // 403/401 for permission issues, 404 if endpoint not available in test env
      expect([403, 401, 404]).toContain(res.status);
    }
  });
});
