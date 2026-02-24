/**
 * Integration tests for namespace-related typed API functions.
 * Validates that the typed functions work correctly against the real backend.
 *
 * Note: listNamespaces() and getNamespaceUsers() require system-admin role,
 * so we use the ADMIN_TOKEN for these tests.
 */
import { configureTestAuth, ADMIN_TOKEN, getSetupState, resetAuthProvider } from './helpers';
import { listNamespaces, getNamespaceUsers } from '@/lib/api/namespaces';
import {
  expectSnakeCaseKeys,
  } from './validators';

describe('listNamespaces() (system-admin only)', () => {
  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns NamespaceWithStats[] with correct snake_case shape', async () => {
    const namespaces = await listNamespaces();

    expect(Array.isArray(namespaces)).toBe(true);
    expect(namespaces.length).toBeGreaterThan(0);

    const ns = namespaces[0];

    // Field presence and types matching Namespace type
    expect(typeof ns.id).toBe('string');
    expect(typeof ns.display_name).toBe('string');
    expect(typeof ns.active).toBe('boolean');
    expect(ns.max_instructors === null || typeof ns.max_instructors === 'number').toBe(true);
    expect(ns.max_students === null || typeof ns.max_students === 'number').toBe(true);
    expect(typeof ns.created_at).toBe('string');
    expect(ns.created_by === null || typeof ns.created_by === 'string').toBe(true);
    expect(typeof ns.updated_at).toBe('string');

    // No PascalCase
    expectSnakeCaseKeys(ns, 'Namespace');
  });
});

describe('getNamespaceUsers() (system-admin only)', () => {
  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns User[] with correct snake_case shape', async () => {
    const state = getSetupState();
    const namespaceId = state?.namespaceId;
    expect(namespaceId).toBeTruthy();

    const users = await getNamespaceUsers(namespaceId!);

    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);

    const user = users[0];

    // Field presence and types matching User type
    expect(typeof user.id).toBe('string');
    expect(user.external_id === null || typeof user.external_id === 'string').toBe(true);
    expect(typeof user.email).toBe('string');
    expect(typeof user.role).toBe('string');
    expect(user.namespace_id === null || typeof user.namespace_id === 'string').toBe(true);
    expect(user.display_name === null || typeof user.display_name === 'string').toBe(true);
    expect(typeof user.created_at).toBe('string');
    expect(typeof user.updated_at).toBe('string');

    // No PascalCase
    expectSnakeCaseKeys(user, 'User');
  });
});
