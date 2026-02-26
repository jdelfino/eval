/**
 * Contract tests for remaining system administration API functions in system.ts.
 *
 * Covers the 2 functions not tested by other system contract tests:
 *   1. listSystemNamespaces() -> NamespaceInfo[]
 *   2. getSystemNamespace(namespaceId) -> NamespaceInfo
 *
 * Uses the admin token (system-admin role required).
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import {
  listSystemNamespaces,
  getSystemNamespace,
} from '@/lib/api/system';

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
      expect(typeof ns.id).toBe('string');
      expect(typeof ns.displayName).toBe('string');
      expect(typeof ns.active).toBe('boolean');

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
      expect(typeof ns.id).toBe('string');
      expect(typeof ns.displayName).toBe('string');
      expect(typeof ns.active).toBe('boolean');

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

});
