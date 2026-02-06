/**
 * Typed API client function for Centrifugo realtime token.
 */

import { apiGet } from '@/lib/api-client';

/**
 * Response from the realtime token endpoint.
 */
export interface RealtimeTokenResponse {
  token: string;
}

/**
 * Get a Centrifugo connection token for realtime updates.
 * @returns The token response containing the JWT token
 */
export async function getRealtimeToken(): Promise<RealtimeTokenResponse> {
  return apiGet<RealtimeTokenResponse>('/realtime/token');
}
