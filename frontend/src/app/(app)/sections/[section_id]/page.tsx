'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePreview } from '@/contexts/PreviewContext';
import type { Session, PublishedProblemWithStatus, StudentProgress } from '@/types/api';
import { getSection, getActiveSessions } from '@/lib/api/sections';
import { getClass } from '@/lib/api/classes';
import { listSectionProblems } from '@/lib/api/section-problems';
import { listStudentProgress } from '@/lib/api/student-review';
import { BackButton } from '@/components/ui/BackButton';
import StudentSectionView from './components/StudentSectionView';
import InstructorSectionView from './components/InstructorSectionView';

export interface SectionDetail {
  id: string;
  classId: string;
  name: string;
  className: string;
  classDescription: string;
  semester: string | null;
  role: 'instructor' | 'student';
}

export default function SectionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const section_id = params.section_id as string;
  const { user } = useAuth();
  const { isPreview, previewSectionId, enterPreview, exitPreview } = usePreview();
  const [section, setSection] = useState<SectionDetail | null>(null);
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [publishedProblems, setPublishedProblems] = useState<PublishedProblemWithStatus[]>([]);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && section_id) {
      loadSectionData();
    }
  }, [user, section_id]);

  const userIsInstructor = user != null && ['instructor', 'namespace-admin', 'system-admin'].includes(user.role);

  const loadSectionData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch section, sessions, and problems in parallel.
      // For instructors, also fetch student progress (gated behind PermContentManage).
      const parallelFetches: [
        ReturnType<typeof getSection>,
        ReturnType<typeof getActiveSessions>,
        ReturnType<typeof listSectionProblems>,
        Promise<StudentProgress[]>,
      ] = [
        getSection(section_id),
        getActiveSessions(section_id),
        listSectionProblems(section_id),
        userIsInstructor ? listStudentProgress(section_id) : Promise.resolve([]),
      ];

      const [sectionData, sessionsData, problemsData, studentsData] = await Promise.all(parallelFetches);

      // Fetch class name using the section's class_id
      const classData = await getClass(sectionData.class_id);

      const sectionDetail: SectionDetail = {
        id: sectionData.id,
        classId: sectionData.class_id,
        name: sectionData.name,
        className: classData.class.name,
        classDescription: classData.class.description || '',
        semester: sectionData.semester,
        role: user!.role as 'instructor' | 'student',
      };
      setSection(sectionDetail);

      // Separate active and past sessions
      const active = sessionsData.filter((s: Session) => s.status === 'active');
      const past = sessionsData.filter((s: Session) => s.status !== 'active');

      setActiveSessions(active);
      setPastSessions(past);

      // Sort problems: live session problems first, then by last_worked DESC
      const sortedProblems = [...problemsData].sort((a, b) => {
        const aIsLive = active.some((s) => s.problem?.id === a.problem.id);
        const bIsLive = active.some((s) => s.problem?.id === b.problem.id);

        if (aIsLive && !bIsLive) return -1;
        if (!aIsLive && bIsLive) return 1;

        // Both live or both not live: sort by last_update DESC
        const aTime = a.student_work?.last_update;
        const bTime = b.student_work?.last_update;
        if (aTime && !bTime) return -1;
        if (!aTime && bTime) return 1;
        if (aTime && bTime) {
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        }
        return 0;
      });

      setPublishedProblems(sortedProblems);
      setStudents(studentsData);
    } catch (err) {
      console.error('Error loading section data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load section');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error || !section) {
    // In preview mode, the error could be a permission error because the preview
    // student doesn't have access. Exit preview and return to the section's instructor view.
    const isPreviewingThisSectionOnError = isPreview && previewSectionId === section_id;
    const handleErrorBack = isPreviewingThisSectionOnError
      ? async () => {
          await exitPreview();
          router.push(`/sections/${section_id}`);
        }
      : undefined;

    return (
      <div className="space-y-6">
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-red-600 mb-4">{error || 'Section not found'}</p>
          {handleErrorBack ? (
            <BackButton onClick={handleErrorBack}>Back to Section</BackButton>
          ) : (
            <BackButton href={userIsInstructor ? '/classes' : '/sections'}>
              {userIsInstructor ? 'Back to Classes' : 'Back to My Sections'}
            </BackButton>
          )}
        </div>
      </div>
    );
  }

  // Instructor previewing this section as a student
  const isPreviewingThisSection = isPreview && previewSectionId === section_id;

  if (!userIsInstructor || isPreviewingThisSection) {
    // In preview mode, back navigation should exit preview and return to the
    // section's instructor view rather than going to /sections (which the preview
    // student has no access to).
    const handlePreviewBack = isPreviewingThisSection
      ? async () => {
          await exitPreview();
          router.push(`/sections/${section_id}`);
        }
      : undefined;

    return (
      <StudentSectionView
        section={section}
        activeSessions={activeSessions}
        publishedProblems={publishedProblems}
        sectionId={section_id}
        onBack={handlePreviewBack}
      />
    );
  }

  const handleEnterPreview = () => {
    enterPreview(section_id);
  };

  return (
    <InstructorSectionView
      section={section}
      activeSessions={activeSessions}
      pastSessions={pastSessions}
      publishedProblems={publishedProblems}
      students={students}
      onEnterPreview={handleEnterPreview}
    />
  );
}
