/**
 * Contract tests for remaining system administration API functions in system.ts.
 *
 * Covers the 3 functions not tested by other system contract tests:
 *   1. listSystemNamespaces() -> NamespaceInfo[]
 *   2. getSystemNamespace(namespaceId) -> NamespaceInfo
 *   3. resendSystemInvitation(invitationId) -> void
 *
 * Uses the admin token (system-admin role required).
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import {
  listSystemNamespaces,
  getSystemNamespace,
  resendSystemInvitation,
  createSystemInvitation,
} from '@/lib/api/system';
import { expectString, expectBoolean } from './validators';

describe('System API — full coverage', () => {
  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  // -----------------------------------------------------------------------
  // 1. listSystemNamespaces
  // -----------------------------------------------------------------------
  describe('listSystemNamespaces()', () => {
    it('returns NamespaceInfo[] with correct shape (camelCase displayName)', async () => {
      const namespaces = await listSystemNamespaces();

      expect(Array.isArray(namespaces)).toBe(true);
      expect(namespaces.length).toBeGreaterThan(0);

      const ns = namespaces[0];

      // NamespaceInfo has camelCase fields due to internal mapping:
      // { id: string, displayName: string, active: boolean, userCount?: number }
      expectString(ns, 'id');
      expectString(ns, 'displayName');
      expectBoolean(ns, 'active');

      // userCount is optional — if present, it should be a number
      if ('userCount' in ns && ns.userCount !== undefined) {
        expect(typeof ns.userCount).toBe('number');
      }

      // No PascalCase leaks
      expect(ns).not.toHaveProperty('ID');
      expect(ns).not.toHaveProperty('DisplayName');
      expect(ns).not.toHaveProperty('Active');
    });
  });

  // -----------------------------------------------------------------------
  // 2. getSystemNamespace
  // -----------------------------------------------------------------------
  describe('getSystemNamespace(namespaceId)', () => {
    it('returns NamespaceInfo with correct shape for a known namespace', async () => {
      const namespaceId = state.namespaceId;
      expect(namespaceId).toBeTruthy();

      const ns = await getSystemNamespace(namespaceId);

      // NamespaceInfo shape: { id, displayName, active, userCount? }
      expectString(ns, 'id');
      expectString(ns, 'displayName');
      expectBoolean(ns, 'active');

      // Verify the id matches what we requested
      expect(ns.id).toBe(namespaceId);

      // userCount is optional
      if ('userCount' in ns && ns.userCount !== undefined) {
        expect(typeof ns.userCount).toBe('number');
      }

      // No PascalCase leaks
      expect(ns).not.toHaveProperty('ID');
      expect(ns).not.toHaveProperty('DisplayName');
      expect(ns).not.toHaveProperty('Active');
    });
  });

  // -----------------------------------------------------------------------
  // 3. resendSystemInvitation
  // -----------------------------------------------------------------------
  describe('resendSystemInvitation(invitationId)', () => {
    let createdInvitationId: string | null = null;

    afterAll(async () => {
      // Best-effort cleanup: revoke the invitation we created
      if (createdInvitationId) {
        try {
          const { revokeSystemInvitation } = await import('@/lib/api/system');
          await revokeSystemInvitation(createdInvitationId);
        } catch {
          // Best-effort cleanup
        }
      }
    });

    it('resends an invitation without throwing (or handles expected email errors)', async () => {
      const namespaceId = state.namespaceId;
      expect(namespaceId).toBeTruthy();

      // Create an invitation to resend
      const email = `contract-resend-test-${Date.now()}@test.local`;
      const inv = await createSystemInvitation(email, namespaceId, 'instructor');
      createdInvitationId = inv.id;
      expect(inv.id).toBeTruthy();

      try {
        // resendSystemInvitation returns void
        await resendSystemInvitation(inv.id);
        // If it succeeds, the contract is satisfied (void return)
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 500 || status === 502 || status === 503) {
          console.warn(`resendSystemInvitation() returned status ${status} — email service likely not configured`);
          return;
        }
        throw err;
      }
    });
  });
});
