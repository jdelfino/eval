/**
 * Service-role backed revision repository for internal system operations.
 *
 * This repository uses service_role to bypass RLS and is only used by
 * internal system components like RevisionBuffer that don't have access
 * to user accessTokens.
 *
 * DO NOT use this repository for user-facing API operations - use
 * SupabaseRevisionRepository with accessToken instead.
 */

import { v4 as uuidv4 } from 'uuid';
import { IRevisionRepository } from './interfaces';
import { CodeRevision, StoredRevision } from './types';
import { getSupabaseClient, RevisionRow } from '../supabase/client';

/**
 * Maps a database row to a StoredRevision domain object
 */
function mapRowToRevision(row: RevisionRow): StoredRevision {
  let executionResult: StoredRevision['executionResult'] | undefined;
  if (row.execution_result) {
    const result = row.execution_result as {
      success?: boolean;
      output?: string;
      error?: string;
    };
    executionResult = {
      success: result.success ?? false,
      output: result.output ?? '',
      error: result.error ?? '',
    };
  }

  return {
    id: row.id,
    namespaceId: row.namespace_id,
    sessionId: row.session_id,
    studentId: row.student_id,
    timestamp: new Date(row.timestamp),
    isDiff: row.is_diff,
    diff: row.diff || undefined,
    fullCode: row.full_code || undefined,
    baseRevisionId: row.base_revision_id || undefined,
    executionResult,
    _metadata: {
      createdAt: new Date(row.timestamp),
      updatedAt: new Date(row.timestamp),
      version: 1,
    },
  };
}

/**
 * Service-role revision repository for internal system operations.
 */
export class ServiceRoleRevisionRepository implements IRevisionRepository {
  private supabase = getSupabaseClient();

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
  }

  async health(): Promise<boolean> {
    const { error } = await this.supabase.from('revisions').select('id').limit(1);
    return !error;
  }

  async saveRevision(revision: CodeRevision): Promise<string> {
    const id = revision.id || uuidv4();

    const revisionData = {
      id,
      namespace_id: revision.namespaceId,
      session_id: revision.sessionId,
      student_id: revision.studentId,
      timestamp: revision.timestamp.toISOString(),
      is_diff: revision.isDiff,
      diff: revision.diff || null,
      full_code: revision.fullCode || null,
      base_revision_id: revision.baseRevisionId || null,
      execution_result: revision.executionResult
        ? {
            success: revision.executionResult.success,
            output: revision.executionResult.output,
            error: revision.executionResult.error,
          }
        : null,
    };

    const { error } = await this.supabase.from('revisions').insert(revisionData);

    if (error) {
      throw new Error(`Failed to save revision: ${error.message}`);
    }

    return id;
  }

  async getRevisions(
    sessionId: string,
    studentId: string,
    namespaceId?: string
  ): Promise<StoredRevision[]> {
    let query = this.supabase
      .from('revisions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .order('timestamp', { ascending: true });

    if (namespaceId) {
      query = query.eq('namespace_id', namespaceId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get revisions: ${error.message}`);
    }

    return data ? data.map(mapRowToRevision) : [];
  }

  async getRevision(revisionId: string): Promise<StoredRevision | null> {
    const { data, error } = await this.supabase
      .from('revisions')
      .select('*')
      .eq('id', revisionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get revision: ${error.message}`);
    }

    return data ? mapRowToRevision(data) : null;
  }

  async getLatestRevision(
    sessionId: string,
    studentId: string
  ): Promise<StoredRevision | null> {
    const { data, error } = await this.supabase
      .from('revisions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get latest revision: ${error.message}`);
    }

    return data ? mapRowToRevision(data) : null;
  }

  async deleteRevisions(sessionId: string, studentId?: string): Promise<void> {
    let query = this.supabase.from('revisions').delete().eq('session_id', sessionId);

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { error } = await query;

    if (error) {
      throw new Error(`Failed to delete revisions: ${error.message}`);
    }
  }

  async countRevisions(sessionId: string, studentId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('revisions')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('student_id', studentId);

    if (error) {
      throw new Error(`Failed to count revisions: ${error.message}`);
    }

    return count ?? 0;
  }

  async getAllSessionRevisions(
    sessionId: string,
    namespaceId?: string
  ): Promise<Map<string, StoredRevision[]>> {
    let query = this.supabase
      .from('revisions')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });

    if (namespaceId) {
      query = query.eq('namespace_id', namespaceId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get all session revisions: ${error.message}`);
    }

    const result = new Map<string, StoredRevision[]>();

    if (data) {
      for (const row of data) {
        const revision = mapRowToRevision(row);
        const studentId = revision.studentId;

        if (!result.has(studentId)) {
          result.set(studentId, []);
        }
        result.get(studentId)!.push(revision);
      }
    }

    return result;
  }
}
