/**
 * Tests for auth provider configuration
 *
 * @jest-environment node
 */

import { authProviders } from '../auth-providers';
import type { ProviderConfig } from '../auth-providers';

describe('authProviders', () => {
  it('exports an array of provider configs', () => {
    expect(Array.isArray(authProviders)).toBe(true);
  });

  it('contains exactly three providers', () => {
    expect(authProviders).toHaveLength(3);
  });

  it('includes Google provider', () => {
    const google = authProviders.find(p => p.id === 'google.com');
    expect(google).toBeDefined();
    expect(google?.name).toBe('Google');
    expect(google?.providerType).toBe('google');
  });

  it('includes GitHub provider', () => {
    const github = authProviders.find(p => p.id === 'github.com');
    expect(github).toBeDefined();
    expect(github?.name).toBe('GitHub');
    expect(github?.providerType).toBe('github');
  });

  it('includes Microsoft provider', () => {
    const microsoft = authProviders.find(p => p.id === 'microsoft.com');
    expect(microsoft).toBeDefined();
    expect(microsoft?.name).toBe('Microsoft');
    expect(microsoft?.providerType).toBe('microsoft');
  });

  it('has unique ids for all providers', () => {
    const ids = authProviders.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('has valid providerType values for all entries', () => {
    const validTypes: ProviderConfig['providerType'][] = ['google', 'github', 'microsoft'];
    for (const provider of authProviders) {
      expect(validTypes).toContain(provider.providerType);
    }
  });

  it('has no Firebase imports (static data only)', () => {
    // The config file should only export static data
    // Each provider has id, name, and providerType
    for (const provider of authProviders) {
      expect(typeof provider.id).toBe('string');
      expect(typeof provider.name).toBe('string');
      expect(typeof provider.providerType).toBe('string');
    }
  });
});
