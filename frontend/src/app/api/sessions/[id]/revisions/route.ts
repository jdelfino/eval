/**
 * API endpoint for fetching code revision history
 * GET /api/sessions/:id/revisions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { createStorage } from '@/server/persistence';
import * as DiffMatchPatch from 'diff-match-patch';
import { rateLimit } from '@/server/rate-limit';

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * GET /api/sessions/:id/revisions?studentId=xxx
 *
 * Fetch revision history for a student in a session.
 * Reconstructs full code from diffs.
 *
 * Query parameters:
 * - studentId: string (required)
 *
 * Response:
 * {
 *   success: boolean,
 *   revisions: Array<{ id: string, timestamp: Date, code: string }>
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: Params
) {
  try {
    const { id: sessionId } = await params;

    // Verify authentication using Supabase session
    const authProvider = await getAuthProvider();
    const authSession = await authProvider.getSessionFromRequest(request);
    if (!authSession || !authSession.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user is an instructor (only instructors can view revision history)
    if (authSession.user.role !== 'instructor' && authSession.user.role !== 'namespace-admin') {
      return NextResponse.json(
        { error: 'Only instructors can view revision history' },
        { status: 403 }
      );
    }

    // Rate limit by user ID (read operation)
    const limited = await rateLimit('read', request, authSession.user.id);
    if (limited) return limited;

    // Get studentId from query params
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');

    if (!studentId) {
      return NextResponse.json(
        { error: 'studentId query parameter is required' },
        { status: 400 }
      );
    }

    const accessToken = authSession.sessionId;

    // Fetch revisions from storage
    const storage = await createStorage(accessToken);
    const storedRevisions = await storage.revisions.getRevisions(sessionId, studentId);

    // Reconstruct full code for each revision from diffs
    const dmp = new DiffMatchPatch.diff_match_patch();
    const revisions = [];

    for (const rev of storedRevisions) {
      let fullCode: string;

      if (rev.isDiff && rev.diff) {
        // Apply diff to reconstruct code
        // Find the previous full snapshot
        const prevSnapshot = storedRevisions
          .slice(0, storedRevisions.indexOf(rev))
          .reverse()
          .find(r => !r.isDiff && r.fullCode !== undefined);

        if (prevSnapshot && prevSnapshot.fullCode !== undefined) {
          // Start with previous snapshot
          let currentCode = prevSnapshot.fullCode;

          // Apply all diffs between snapshot and current revision
          const startIdx = storedRevisions.indexOf(prevSnapshot) + 1;
          const endIdx = storedRevisions.indexOf(rev) + 1;

          for (let i = startIdx; i < endIdx; i++) {
            const r = storedRevisions[i];
            if (r.isDiff && r.diff) {
              const patches = dmp.patch_fromText(r.diff);
              const [patchedCode] = dmp.patch_apply(patches, currentCode);
              currentCode = patchedCode;
            } else if (r.fullCode !== undefined) {
              currentCode = r.fullCode;
            }
          }
          fullCode = currentCode;
        } else {
          // No previous snapshot, skip or use empty
          fullCode = '';
        }
      } else if (rev.fullCode !== undefined) {
        fullCode = rev.fullCode;
      } else {
        fullCode = '';
      }

      revisions.push({
        id: rev.id,
        timestamp: rev.timestamp,
        code: fullCode,
      });
    }

    return NextResponse.json({
      success: true,
      revisions,
    });

  } catch (error) {
    console.error('Error fetching revisions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revisions' },
      { status: 500 }
    );
  }
}
