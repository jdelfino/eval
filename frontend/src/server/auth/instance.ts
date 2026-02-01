/**
 * Factory functions for authentication-related services.
 *
 * Note: getAuthProvider() is a singleton since it handles authentication
 * and needs service_role access. Other repositories accept accessToken
 * for RLS-backed access control.
 */

import { IAuthProvider, IUserRepository, INamespaceRepository } from './interfaces';
import { SupabaseAuthProvider } from './supabase-provider';
import { SupabaseUserRepository } from '../persistence/supabase/user-repository';
import { SupabaseNamespaceRepository } from '../persistence/supabase/namespace-repository';

let authProviderInstance: IAuthProvider | null = null;

/**
 * Get the auth provider singleton.
 * Auth provider uses service_role internally since it handles authentication.
 */
export async function getAuthProvider(): Promise<IAuthProvider> {
  if (!authProviderInstance) {
    authProviderInstance = new SupabaseAuthProvider();
    await authProviderInstance.userRepository.initialize?.();
  }
  return authProviderInstance;
}

/**
 * Get user repository with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getUserRepository(accessToken: string): IUserRepository {
  return new SupabaseUserRepository(accessToken);
}

/**
 * Get namespace repository with RLS-backed access control.
 * @param accessToken - JWT access token for RLS policies (required)
 */
export function getNamespaceRepository(accessToken: string): INamespaceRepository {
  return new SupabaseNamespaceRepository(accessToken);
}

