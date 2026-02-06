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
  expectString,
  expectNullableString,
  expectBoolean,
  expectNullableNumber,
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
    expectString(ns, 'id');
    expectString(ns, 'display_name');
    expectBoolean(ns, 'active');
    expectNullableNumber(ns, 'max_instructors');
    expectNullableNumber(ns, 'max_students');
    expectString(ns, 'created_at');
    expectNullableString(ns, 'created_by');
    expectString(ns, 'updated_at');

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
    expectString(user, 'id');
    expectNullableString(user, 'external_id');
    expectString(user, 'email');
    expectString(user, 'role');
    expectNullableString(user, 'namespace_id');
    expectNullableString(user, 'display_name');
    expectString(user, 'created_at');
    expectString(user, 'updated_at');

    // No PascalCase
    expectSnakeCaseKeys(user, 'User');
  });
});
