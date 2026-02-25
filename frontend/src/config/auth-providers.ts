/**
 * Auth provider configuration.
 *
 * Contains only static data — NO Firebase imports.
 * Provider instantiation is handled lazily in SignInButtons.
 * Adding/removing providers is a one-line config change.
 */

export interface ProviderConfig {
  id: string;
  name: string;
  providerType: 'google' | 'github' | 'microsoft';
}

export const authProviders: ProviderConfig[] = [
  { id: 'google.com', name: 'Google', providerType: 'google' },
  { id: 'github.com', name: 'GitHub', providerType: 'github' },
  { id: 'microsoft.com', name: 'Microsoft', providerType: 'microsoft' },
];
