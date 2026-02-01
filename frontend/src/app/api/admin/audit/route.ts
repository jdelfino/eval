/**
 * Admin API - Audit Log
 * GET /api/admin/audit
 * 
 * Returns audit log entries for role changes and other admin actions
 * Requires 'system.admin' permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { LocalAuditLogRepository } from '@/server/auth/local/audit-log-repository';
import { AuditLogEntry } from '@/server/auth/audit';
import { requirePermission } from '@/server/auth/api-helpers';

export async function GET(request: NextRequest) {
  try {
    // Check authentication and authorization
    const auth = await requirePermission(request, 'system.admin');
    if (auth instanceof NextResponse) {
      return auth; // Return 401/403 error response
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get audit log entries
    const auditRepo = new LocalAuditLogRepository();
    const entries = await auditRepo.getEntries({
      action: action as AuditLogEntry['action'] | undefined,
      limit,
      offset,
    });

    const total = await auditRepo.getCount({
      action: action as AuditLogEntry['action'] | undefined,
    });

    return NextResponse.json({
      entries,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('[Admin Audit API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit log' },
      { status: 500 }
    );
  }
}
