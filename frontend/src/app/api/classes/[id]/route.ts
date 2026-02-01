/**
 * GET /api/classes/:id - Get class details
 * PUT /api/classes/:id - Update class
 * DELETE /api/classes/:id - Delete class
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getNamespaceContext } from '@/server/auth/api-helpers';
import { getClassRepository, getMembershipRepository } from '@/server/classes';
import { rateLimit } from '@/server/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const classRepo = getClassRepository(accessToken);
    const classData = await classRepo.getClass(id, namespaceId);

    if (!classData) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Get sections for this class
    const sections = await classRepo.getClassSections(id, namespaceId);

    // Collect all unique instructor IDs from memberships
    const membershipRepo = getMembershipRepository(accessToken);
    const instructorIds = new Set<string>();
    for (const section of sections) {
      const instructorUsers = await membershipRepo.getSectionMembers(section.id, 'instructor');
      for (const instructor of instructorUsers) {
        instructorIds.add(instructor.id);
      }
    }

    // Fetch instructor display names from user_profiles
    const instructorNames: Record<string, string> = {};
    if (instructorIds.size > 0) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.SUPABASE_SECRET_KEY!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch user profiles and emails
      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .in('id', Array.from(instructorIds));

      if (profileError) {
        console.error('[API] Failed to fetch instructor profiles:', profileError);
      }

      // Fetch emails from auth.users for each instructor
      for (const instructorId of instructorIds) {
        const profile = profiles?.find(p => p.id === instructorId);

        if (profile?.display_name) {
          instructorNames[instructorId] = profile.display_name;
        } else {
          // Try to get email from auth
          const { data: authUser } = await supabase.auth.admin.getUserById(instructorId);
          if (authUser?.user?.email) {
            instructorNames[instructorId] = authUser.user.email;
          } else {
            // Last resort: show truncated ID
            instructorNames[instructorId] = `Instructor (${instructorId.slice(0, 8)}...)`;
          }
        }
      }
    }

    return NextResponse.json({
      class: classData,
      sections,
      instructorNames
    });
  } catch (error) {
    console.error('[API] Get class error:', error);
    return NextResponse.json(
      { error: 'Failed to get class' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const classRepo = getClassRepository(accessToken);
    const classData = await classRepo.getClass(id, namespaceId);

    if (!classData) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Check if user is the creator
    if (classData.createdBy !== user.id) {
      return NextResponse.json(
        { error: 'Only the class creator can update it' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description } = body;

    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();

    const updatedClass = await classRepo.updateClass(id, updates);

    return NextResponse.json({ class: updatedClass });
  } catch (error) {
    console.error('[API] Update class error:', error);
    return NextResponse.json(
      { error: 'Failed to update class' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const classRepo = getClassRepository(accessToken);
    const classData = await classRepo.getClass(id, namespaceId);

    if (!classData) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      );
    }

    // Check if user is the creator
    if (classData.createdBy !== user.id) {
      return NextResponse.json(
        { error: 'Only the class creator can delete it' },
        { status: 403 }
      );
    }

    // Check if class has sections
    const sections = await classRepo.getClassSections(id, namespaceId);

    if (sections.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete class with existing sections. Delete sections first.' },
        { status: 400 }
      );
    }

    await classRepo.deleteClass(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Delete class error:', error);
    return NextResponse.json(
      { error: 'Failed to delete class' },
      { status: 500 }
    );
  }
}
