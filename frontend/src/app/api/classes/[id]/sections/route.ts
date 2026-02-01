/**
 * GET /api/classes/:id/sections - Get all sections for a class
 * POST /api/classes/:id/sections - Create a new section in a class
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClassRepository, getSectionRepository, getMembershipRepository } from '@/server/classes';
import { requireAuth, requirePermission, getNamespaceContext } from '@/server/auth/api-helpers';
import { rateLimit } from '@/server/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classId } = await params;

    // Check authentication
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth; // Return 401 error response
    }

    const { user, accessToken } = auth;

    // Rate limit by user ID (read operation)
    const limited = await rateLimit('read', request, user.id);
    if (limited) return limited;

    const namespaceId = getNamespaceContext(request, user);

    // Verify class exists
    const classRepo = getClassRepository(accessToken);
    const classData = await classRepo.getClass(classId, namespaceId);

    if (!classData) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Get sections for this class
    const sectionRepo = getSectionRepository(accessToken);
    const allSections = await sectionRepo.listSections({ classId, namespaceId });

    // For users with viewAll permission, add student count and active session count
    if (auth.rbac.hasPermission(user, 'session.viewAll')) {
      const membershipRepo = getMembershipRepository(accessToken);
      const sectionsWithCounts = await Promise.all(
        allSections.map(async (section) => {
          const students = await membershipRepo.getSectionMembers(section.id, 'student');
          const studentCount = students.length;

          // TODO: Add active session count when we have a way to query sessions by section
          return {
            id: section.id,
            name: section.name,
            joinCode: section.joinCode,
            schedule: section.semester, // Using semester field as schedule
            location: '', // Not stored yet
            studentCount,
            sessionCount: 0, // TODO: Query actual session count
            activeSessionCount: 0,
          };
        })
      );
      return NextResponse.json({ sections: sectionsWithCounts });
    }

    // For students, just return basic section info
    return NextResponse.json({
      sections: allSections.map(s => ({
        id: s.id,
        name: s.name,
        schedule: s.semester,
      }))
    });
  } catch (error) {
    console.error('[API] Get sections error:', error);
    return NextResponse.json(
      { error: 'Failed to load sections' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: classId } = await params;

    // Check authentication and authorization
    const auth = await requirePermission(request, 'session.create');
    if (auth instanceof NextResponse) {
      return auth; // Return 401/403 error response
    }

    const { user, accessToken } = auth;

    // Rate limit by user ID (write operation)
    const limited = await rateLimit('write', request, user.id);
    if (limited) return limited;
    const namespaceId = getNamespaceContext(request, user);

    const classRepo = getClassRepository(accessToken);
    const classData = await classRepo.getClass(classId, namespaceId);

    if (!classData) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, semester } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Section name is required' },
        { status: 400 }
      );
    }

    const sectionRepo = getSectionRepository(accessToken);
    const newSection = await sectionRepo.createSection({
      classId,
      name: name.trim(),
      semester: semester?.trim() || '',
      active: true,
      namespaceId: user.namespaceId!,
    });

    // Add the creating instructor as a section member
    const membershipRepo = getMembershipRepository(accessToken);
    await membershipRepo.addMembership({
      userId: user.id,
      sectionId: newSection.id,
      role: 'instructor',
    });

    return NextResponse.json({ section: newSection }, { status: 201 });
  } catch (error) {
    console.error('[API] Create section error:', error);
    return NextResponse.json(
      { error: 'Failed to create section' },
      { status: 500 }
    );
  }
}
