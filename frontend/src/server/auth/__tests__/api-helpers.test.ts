/**
 * Tests for getNamespaceContext in api-helpers
 */

import { NextRequest } from 'next/server';
import { getNamespaceContext } from '../api-helpers';
import type { User } from '../types';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    role: 'instructor',
    namespaceId: 'ns-1',
    createdAt: new Date(),
    emailConfirmed: true,
    ...overrides,
  };
}

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

describe('getNamespaceContext', () => {
  it('returns user namespaceId for non-system-admin', () => {
    const user = makeUser({ role: 'instructor', namespaceId: 'ns-1' });
    const request = makeRequest('/api/admin/users');
    expect(getNamespaceContext(request, user)).toBe('ns-1');
  });

  it('returns specified namespace for system-admin with query param', () => {
    const user = makeUser({ role: 'system-admin', namespaceId: 'default' });
    const request = makeRequest('/api/admin/users?namespace=custom-ns');
    expect(getNamespaceContext(request, user)).toBe('custom-ns');
  });

  it('returns undefined for system-admin without namespace query param', () => {
    const user = makeUser({ role: 'system-admin', namespaceId: 'default' });
    const request = makeRequest('/api/admin/users');
    expect(getNamespaceContext(request, user)).toBeUndefined();
  });

  it('returns undefined for system-admin with empty namespace query param', () => {
    const user = makeUser({ role: 'system-admin', namespaceId: 'default' });
    const request = makeRequest('/api/admin/users?namespace=');
    expect(getNamespaceContext(request, user)).toBeUndefined();
  });
});
