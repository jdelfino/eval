'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { Session, PublishedProblemWithStatus } from '@/types/api';
import { getSection, getActiveSessions } from '@/lib/api/sections';
import { getClass } from '@/lib/api/classes';
import { listSectionProblems } from '@/lib/api/section-problems';
import { BackButton } from '@/components/ui/BackButton';
import StudentSectionView from './components/StudentSectionView';
import InstructorSectionView from './components/InstructorSectionView';

interface SectionDetail {
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
  const { user, isLoading: authLoading } = useAuth();
  const [section, setSection] = useState<SectionDetail | null>(null);
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [publishedProblems, setPublishedProblems] = useState<PublishedProblemWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/signin');
      return;
    }

    if (user && section_id) {
      loadSectionData();
    }
  }, [user, authLoading, section_id, router]);

  const loadSectionData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch section, sessions, and problems in parallel
      const [sectionData, sessionsData, problemsData] = await Promise.all([
        getSection(section_id),
        getActiveSessions(section_id),
        listSectionProblems(section_id),
      ]);

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
    } catch (err) {
      console.error('Error loading section data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load section');
    } finally {
      setLoading(false);
    }
  };

  const isInstructor = user != null && ['instructor', 'namespace-admin', 'system-admin'].includes(user.role);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error || !section) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-red-600 mb-4">{error || 'Section not found'}</p>
          <BackButton href={isInstructor ? '/classes' : '/sections'}>
            {isInstructor ? 'Back to Classes' : 'Back to My Sections'}
          </BackButton>
        </div>
      </div>
    );
  }

  if (!isInstructor) {
    return (
      <StudentSectionView
        section={section}
        activeSessions={activeSessions}
        publishedProblems={publishedProblems}
        sectionId={section_id}
      />
    );
  }

  return (
    <InstructorSectionView
      section={section}
      activeSessions={activeSessions}
      pastSessions={pastSessions}
      publishedProblems={publishedProblems}
    />
  );
}
