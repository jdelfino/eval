/**
 * Supabase client for browser-side usage.
 * Used for operations that must happen client-side, like verifying OTP tokens.
 */

import { createBrowserClient } from '@supabase/ssr';

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Get or create a Supabase browser client.
 * Uses singleton pattern to avoid creating multiple clients.
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    supabaseClient = createBrowserClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}
