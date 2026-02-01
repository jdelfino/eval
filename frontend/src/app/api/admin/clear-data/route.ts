/**
 * POST /api/admin/clear-data
 * Clear all application data (for testing/development).
 * Requires admin permissions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { createStorage } from '@/server/persistence';
// requirePermission available from '@/server/auth/api-helpers'
import * as SessionService from '@/server/services/session-service';

export async function POST(request: NextRequest) {
  try {
    // Check authentication and authorization using Supabase session
    const authProvider = await getAuthProvider();
    const session = await authProvider.getSessionFromRequest(request);
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // SECURITY: Only system-admin can clear ALL data (destructive operation)
    if (session.user.role !== 'system-admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only system administrators can clear all data' },
        { status: 403 }
      );
    }

    const _auth = { user: session.user };
    const accessToken = session.sessionId;

    // Get storage backend and clear all data
    const storage = await createStorage(accessToken);

    // Clear in dependency order:
    // 1. Sessions (depend on users, sections)
    // 2. Memberships (depend on users, sections)
    // 3. Sections (depend on classes)
    // 4. Classes (depend on users)
    // 5. Problems (depend on users)
    // 6. Auth sessions (depend on users)
    // 7. Users (last)

    // 1. Clear all active sessions via session service
    const allSessions = await storage.sessions.listAllSessions();
    for (const s of allSessions) {
      try {
        await SessionService.endSession(storage, s.id);
      } catch (error) {
        console.error(`[Admin Clear Data] Error ending session ${s.id}:`, error);
      }
    }

    // 2. Clear memberships
    if (storage.memberships) {
      const membershipRepo = storage.memberships as any;
      if (typeof membershipRepo.clear === 'function') {
        await membershipRepo.clear();
      }
    }

    // 3. Clear sections
    if (storage.sections) {
      const sectionRepo = storage.sections as any;
      if (typeof sectionRepo.clear === 'function') {
        await sectionRepo.clear();
      }
    }

    // 4. Clear classes
    if (storage.classes) {
      const classRepo = storage.classes as any;
      if (typeof classRepo.clear === 'function') {
        await classRepo.clear();
      }
    }

    // 5. Clear problems
    const problems = await storage.problems.getAll({});
    for (const problem of problems) {
      try {
        await storage.problems.delete(problem.id);
      } catch (error) {
        console.error(`[Admin Clear Data] Error deleting problem ${problem.id}:`, error);
      }
    }

    // 6. Clear revisions
    if (storage.revisions) {
      const revisionRepo = storage.revisions as any;
      if (typeof revisionRepo.clear === 'function') {
        await revisionRepo.clear();
      }
    }

    // 7. Clear auth users
    const users = await authProvider.getAllUsers();

    // Delete all users except the current admin/instructor (to prevent lockout)
    // Note: Supabase JWT sessions are stateless and expire automatically.
    // Deleting the auth.users record invalidates all their JWTs.
    let _deletedCount = 0;
    for (const user of users) {
      if (user.id !== session.user.id) {
        try {
          await authProvider.deleteUser(user.id);
          _deletedCount++;
        } catch (error) {
          console.error(`[Admin Clear Data] Error deleting user ${user.id}:`, error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'All data cleared successfully',
      preserved: {
        admin: {
          id: session.user.id,
          email: session.user.email,
        },
      },
    });
  } catch (error) {
    console.error('[Admin Clear Data] Error:', error);
    return NextResponse.json(
      { error: 'Failed to clear data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
