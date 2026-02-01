/**
 * GET /api/instructor/dashboard - Get instructor dashboard data
 *
 * Returns all classes with their sections and active session info.
 * Used by the InstructorDashboard component for the table view.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClassRepository, getSectionRepository, getMembershipRepository } from '@/server/classes';
import { requireAuth, getNamespaceContext } from '@/server/auth/api-helpers';
import { createStorage } from '@/server/persistence';
import { rateLimit } from '@/server/rate-limit';

interface SectionInfo {
  id: string;
  name: string;
  semester?: string;
  joinCode: string;
  studentCount: number;
  activeSessionId?: string;
}

interface ClassWithSections {
  id: string;
  name: string;
  description?: string;
  sections: SectionInfo[];
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { user, accessToken } = auth;

    // Rate limit by user ID (read operation)
    const limited = await rateLimit('read', request, user.id);
    if (limited) return limited;

    const namespaceId = getNamespaceContext(request, user);

    // Get all classes for the instructor
    const classRepo = getClassRepository(accessToken);
    const classes = await classRepo.listClasses(user.id, namespaceId);

    // Get sections and active sessions for each class
    const sectionRepo = getSectionRepository(accessToken);
    const membershipRepo = getMembershipRepository(accessToken);
    const storage = await createStorage(accessToken);

    const classesWithSections: ClassWithSections[] = await Promise.all(
      classes.map(async (classInfo): Promise<ClassWithSections> => {
        // Get all sections for this class
        const sections = await sectionRepo.listSections({
          classId: classInfo.id,
          namespaceId,
        });

        // For each section, get student count and active session
        const sectionsWithInfo: SectionInfo[] = await Promise.all(
          sections.map(async (section): Promise<SectionInfo> => {
            // Get student count
            const students = await membershipRepo.getSectionMembers(section.id, 'student');

            // Get active session for this section
            const sessions = await storage.sessions.listAllSessions({ sectionId: section.id });
            const activeSession = sessions.find(s => s.status === 'active');

            return {
              id: section.id,
              name: section.name,
              semester: section.semester,
              joinCode: section.joinCode,
              studentCount: students.length,
              activeSessionId: activeSession?.id,
              // Join code for sessions comes from the section, not stored on the session
            };
          })
        );

        return {
          id: classInfo.id,
          name: classInfo.name,
          description: classInfo.description,
          sections: sectionsWithInfo,
        };
      })
    );

    return NextResponse.json({ classes: classesWithSections });
  } catch (error) {
    console.error('[API] Dashboard error:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard' },
      { status: 500 }
    );
  }
}
