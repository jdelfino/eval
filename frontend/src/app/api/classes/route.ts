/**
 * GET /api/classes - List instructor's classes
 * POST /api/classes - Create a new class
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClassRepository } from '@/server/classes';
import { requirePermission, requireAuth, getNamespaceContext } from '@/server/auth/api-helpers';
import { rateLimit } from '@/server/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth; // Return 401 error response
    }

    const { user, accessToken } = auth;

    // Rate limit by user ID (read operation)
    const limited = await rateLimit('read', request, user.id);
    if (limited) return limited;

    const namespaceId = getNamespaceContext(request, user);

    // Get all classes where user is an instructor, filtered by namespace
    const classRepo = getClassRepository(accessToken);
    const classes = await classRepo.listClasses(user.id, namespaceId);

    return NextResponse.json({ classes });
  } catch (error) {
    console.error('[API] Get classes error:', error);
    return NextResponse.json(
      { error: 'Failed to get classes' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication and authorization
    const auth = await requirePermission(request, 'session.create');
    if (auth instanceof NextResponse) {
      return auth; // Return 401/403 error response
    }

    const { user, accessToken } = auth;

    // Rate limit by user ID (write operation)
    const limited = await rateLimit('write', request, user.id);
    if (limited) return limited;

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Class name is required' },
        { status: 400 }
      );
    }

    const classRepo = getClassRepository(accessToken);
    const newClass = await classRepo.createClass({
      name: name.trim(),
      description: description?.trim() || '',
      createdBy: user.id,
      namespaceId: user.namespaceId!,
    });

    return NextResponse.json({ class: newClass }, { status: 201 });
  } catch (error) {
    console.error('[API] Create class error:', error);
    return NextResponse.json(
      { error: 'Failed to create class' },
      { status: 500 }
    );
  }
}
