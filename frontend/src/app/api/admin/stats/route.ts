/**
 * Admin API - System Statistics
 * GET /api/admin/stats
 *
 * Returns system-wide statistics for the admin dashboard
 * Requires 'system.admin' permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth/instance';
import { getSectionRepository } from '@/server/classes';
import { getMembershipRepository } from '@/server/classes';
import { createStorage } from '@/server/persistence';
import { requirePermission, getNamespaceContext } from '@/server/auth/api-helpers';

export async function GET(request: NextRequest) {
  try {
    // Check authentication and authorization
    const auth = await requirePermission(request, 'system.admin');
    if (auth instanceof NextResponse) {
      return auth; // Return 401/403 error response
    }

    const { user, accessToken } = auth;
    const namespaceId = getNamespaceContext(request, user);

    // Get auth provider for user queries
    const authProvider = await getAuthProvider();

    // Get repositories
    const sectionRepo = getSectionRepository(accessToken);
    const _membershipRepo = getMembershipRepository(accessToken);
    const storage = await createStorage(accessToken);

    // Get users, optionally filtered by namespace
    const userRepo = authProvider.userRepository;
    const users = namespaceId
      ? await userRepo.listUsers(undefined, namespaceId)
      : await authProvider.getAllUsers();
    const usersByRole = users.reduce((acc: Record<string, number>, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get sections, optionally filtered by namespace
    const allSections = await sectionRepo.listSections(undefined, namespaceId);
    const uniqueClassIds = new Set(allSections.map(s => s.classId));

    // Get session count, optionally filtered by namespace
    // countSessions doesn't support namespace filtering, so use listActiveSessions when filtered
    const sessionCount = namespaceId
      ? (await storage.sessions.listActiveSessions(namespaceId)).length
      : await storage.sessions.countSessions();

    const stats = {
      users: {
        total: users.length,
        byRole: {
          admin: usersByRole.admin || 0,
          instructor: usersByRole.instructor || 0,
          student: usersByRole.student || 0,
        },
      },
      classes: {
        total: uniqueClassIds.size,
      },
      sections: {
        total: allSections.length,
      },
      sessions: {
        active: sessionCount,
      },
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('[Admin Stats API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch system statistics' },
      { status: 500 }
    );
  }
}
