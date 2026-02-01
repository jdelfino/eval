/**
 * Supabase Backend State Repository
 *
 * Implements IBackendStateRepository using Supabase's session_backend_state table.
 * Provides persistence for backend assignments and state across serverless invocations.
 *
 * Table schema (session_backend_state):
 * - session_id: Session ID (primary key, references sessions)
 * - backend_type: Type of backend assigned ('vercel-sandbox', 'local-python', etc.)
 * - state_id: Backend-specific identifier (sandbox ID, container ID, etc.)
 * - created_at: Timestamp
 */

import { getSupabaseClient } from '../supabase/client';
import { IBackendStateRepository } from './interfaces';

/**
 * Table name for backend state
 */
const TABLE_NAME = 'session_backend_state';

/**
 * Supabase-based implementation of IBackendStateRepository
 *
 * Uses session_backend_state table to persist backend assignments and state.
 */
export class SupabaseBackendStateRepository implements IBackendStateRepository {
  /**
   * Assign a backend type to a session
   *
   * Creates or updates the session_backend_state row for the session.
   *
   * @param sessionId - Session ID
   * @param backendType - Backend type identifier
   */
  async assignBackend(sessionId: string, backendType: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert({
        session_id: sessionId,
        backend_type: backendType,
        // state_id will be set by saveState when backend is ready
        state_id: `pending-${backendType}`,
      }, {
        onConflict: 'session_id',
      });

    if (error) {
      throw new Error(`Failed to assign backend: ${error.message}`);
    }
  }

  /**
   * Get the assigned backend type for a session
   *
   * @param sessionId - Session ID
   * @returns Backend type or null if not assigned
   */
  async getAssignedBackend(sessionId: string): Promise<string | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('backend_type')
      .eq('session_id', sessionId)
      .single();

    // PGRST116 = not found, which is expected when no assignment exists
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get assigned backend: ${error.message}`);
    }

    return data?.backend_type ?? null;
  }

  /**
   * Save backend-specific state for a session
   *
   * Stores state.sandboxId (or other backend-specific ID) as the state_id column.
   *
   * @param sessionId - Session ID
   * @param state - Backend-specific state object (expects { sandboxId: string } or similar)
   */
  async saveState(sessionId: string, state: Record<string, unknown>): Promise<void> {
    const supabase = getSupabaseClient();

    // Accept sandboxId for backward compatibility, or stateId for new callers
    const stateId = (state.sandboxId ?? state.stateId) as string;
    if (!stateId) {
      throw new Error('saveState requires state.sandboxId or state.stateId');
    }

    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ state_id: stateId })
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(`Failed to save state: ${error.message}`);
    }
  }

  /**
   * Get backend-specific state for a session
   *
   * Returns { sandboxId: state_id } for backward compatibility with VercelSandboxBackend.
   *
   * @param sessionId - Session ID
   * @returns State object or null if not found
   */
  async getState(sessionId: string): Promise<Record<string, unknown> | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('state_id, backend_type')
      .eq('session_id', sessionId)
      .single();

    // PGRST116 = not found
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get state: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    // Return sandboxId for backward compatibility
    return {
      sandboxId: data.state_id,
      stateId: data.state_id,
      backendType: data.backend_type,
    };
  }

  /**
   * Delete backend state for a session
   *
   * Removes the session_backend_state row.
   *
   * @param sessionId - Session ID
   */
  async deleteState(sessionId: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(`Failed to delete state: ${error.message}`);
    }
  }

  /**
   * Check if state exists for a session
   *
   * @param sessionId - Session ID
   * @returns true if state exists
   */
  async hasState(sessionId: string): Promise<boolean> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('session_id')
      .eq('session_id', sessionId)
      .single();

    // PGRST116 = not found, which means no state
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to check state: ${error.message}`);
    }

    return data !== null;
  }
}
