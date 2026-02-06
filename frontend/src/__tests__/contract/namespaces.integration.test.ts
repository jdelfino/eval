/**
 * Contract tests for namespace-related API endpoints.
 * Validates the response shapes match frontend type definitions.
 *
 * Note: listNamespaces() and getNamespaceUsers() require system-admin role,
 * so we use the ADMIN_TOKEN for these tests.
 */
import { contractFetch, ADMIN_TOKEN, getSetupState } from './helpers';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectBoolean,
  expectNullableNumber,
} from './validators';

describe('GET /api/v1/namespaces (system-admin only)', () => {
  it('returns an array of Namespace objects with correct snake_case shape', async () => {
    const res = await contractFetch('/api/v1/namespaces', ADMIN_TOKEN);
    expect(res.status).toBe(200);

    const namespaces = await res.json();
    // Backend returns plain array (not wrapped in { namespaces: [...] })
    expect(Array.isArray(namespaces)).toBe(true);

    // Validate at least one namespace exists (setup created one)
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

describe('GET /api/v1/namespaces/{id}/users (system-admin only)', () => {
  it('returns an array of User objects with correct snake_case shape', async () => {
    const state = getSetupState();
    const namespaceId = state?.namespaceId;
    expect(namespaceId).toBeTruthy();

    const res = await contractFetch(`/api/v1/namespaces/${namespaceId}/users`, ADMIN_TOKEN);
    expect(res.status).toBe(200);

    const users = await res.json();
    // Backend returns plain array (not wrapped in { users: [...] })
    expect(Array.isArray(users)).toBe(true);

    // Validate at least one user exists (setup created one)
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
