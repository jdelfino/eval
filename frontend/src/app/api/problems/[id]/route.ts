/**
 * Individual problem API endpoints
 *
 * GET /api/problems/[id] - Get a specific problem
 * PATCH /api/problems/[id] - Update a problem
 * DELETE /api/problems/[id] - Delete a problem
 */

import { NextRequest, NextResponse } from 'next/server';
import { createStorage } from '@/server/persistence';
import { requireAuth, getNamespaceContext } from '@/server/auth/api-helpers';
import { rateLimit } from '@/server/rate-limit';

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * GET /api/problems/[id]
 *
 * Get a specific problem by ID
 */
export async function GET(
  request: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth; // Return 401 error response
    }

    const { user, accessToken } = auth;

    // Rate limit by user ID (read operation)
    const limited = await rateLimit('read', request, user.id);
    if (limited) return limited;

    const namespaceId = getNamespaceContext(request, user);

    const storage = await createStorage(accessToken);
    const problem = await storage.problems.getById(id, namespaceId);

    if (!problem) {
      return NextResponse.json(
        { error: 'Problem not found' },
        { status: 404 }
      );
    }

    // TODO: Check permissions (author, class member, or public)

    return NextResponse.json({ problem });
  } catch (error: any) {
    console.error('Error getting problem:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get problem' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/problems/[id]
 *
 * Update a problem
 */
export async function PATCH(
  request: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth; // Return 401 error response
    }

    const { user, accessToken } = auth;

    // Rate limit by user ID (write operation)
    const limited = await rateLimit('write', request, user.id);
    if (limited) return limited;

    const namespaceId = getNamespaceContext(request, user);
    const storage = await createStorage(accessToken);

    // Get existing problem
    const existing = await storage.problems.getById(id, namespaceId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Problem not found' },
        { status: 404 }
      );
    }

    // Check permission (author or namespace-admin)
    if (existing.authorId !== user.id && user.role !== 'namespace-admin' && user.role !== 'system-admin') {
      return NextResponse.json(
        { error: 'Forbidden: You can only edit your own problems' },
        { status: 403 }
      );
    }

    const updates = await request.json();

    // Update problem
    const problem = await storage.problems.update(id, updates);

    return NextResponse.json({ problem });
  } catch (error: any) {
    console.error('Error updating problem:', error);

    if (error.code === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'Problem not found' },
        { status: 404 }
      );
    }

    if (error.code === 'INVALID_DATA') {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to update problem' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/problems/[id]
 *
 * Delete a problem
 */
export async function DELETE(
  request: NextRequest,
  { params }: Params
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth; // Return 401 error response
    }

    const { user, accessToken } = auth;

    // Rate limit by user ID (write operation)
    const limited = await rateLimit('write', request, user.id);
    if (limited) return limited;

    const namespaceId = getNamespaceContext(request, user);
    const storage = await createStorage(accessToken);

    // Get existing problem
    const existing = await storage.problems.getById(id, namespaceId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Problem not found' },
        { status: 404 }
      );
    }

    // Check permission (author or namespace-admin)
    if (existing.authorId !== user.id && user.role !== 'namespace-admin' && user.role !== 'system-admin') {
      return NextResponse.json(
        { error: 'Forbidden: You can only delete your own problems' },
        { status: 403 }
      );
    }

    // Delete problem
    await storage.problems.delete(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting problem:', error);

    if (error.code === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'Problem not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to delete problem' },
      { status: 500 }
    );
  }
}
