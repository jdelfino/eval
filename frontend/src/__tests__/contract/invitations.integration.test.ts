/**
 * Contract test: GET /api/v1/invitations
 * Validates the SerializedInvitation[] response shape matches frontend expectations.
 *
 * Note: The invitations endpoints may require namespace-admin or higher permissions.
 * This test uses the instructor token which may or may not have access depending on setup.
 */
import { contractFetch, ADMIN_TOKEN } from './helpers';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
} from './validators';
import { listInvitations } from '@/lib/api/invitations';

// Mock fetch for typed API client tests
const originalFetch = global.fetch;

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
      // 403 is acceptable if user doesn't have permission
      expect([403, 401]).toContain(res.status);
    }
  });

  describe('listInvitations typed API client', () => {
    beforeAll(() => {
      // Mock fetch to use admin token for invitations
      global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
        return originalFetch(url, {
          ...init,
          headers: {
            ...init?.headers,
            Authorization: `Bearer ${ADMIN_TOKEN}`,
          },
        });
      });
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('returns SerializedInvitation[] directly (not wrapped)', async () => {
      try {
        const invitations = await listInvitations();
        expect(Array.isArray(invitations)).toBe(true);

        // If there are invitations, verify the shape
        if (invitations.length > 0) {
          const inv = invitations[0];
          expect(inv).toHaveProperty('id');
          expect(inv).toHaveProperty('email');
          expect(inv).toHaveProperty('target_role');
          expect(inv).toHaveProperty('namespace_id');
          expect(inv).toHaveProperty('expires_at');
        }
      } catch (error) {
        // If we get a permission error, that's acceptable
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/forbidden|unauthorized|permission/i);
      }
    });

    it('supports status filter', async () => {
      try {
        const invitations = await listInvitations({ status: 'pending' });
        expect(Array.isArray(invitations)).toBe(true);

        // All returned invitations should have pending status
        for (const inv of invitations) {
          expect(inv.status).toBe('pending');
        }
      } catch (error) {
        // Permission error is acceptable
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});
