'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useClasses } from '@/hooks/useClasses';
import type { Class, Section } from '@/types/api';
import { getClass } from '@/lib/api/classes';
import { listSectionSessions } from '@/lib/api/sections';
import { formatJoinCodeForDisplay } from '@/lib/join-code';
import CreateSectionForm from '../components/CreateSectionForm';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Table } from '@/components/ui/Table';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Spinner } from '@/components/ui/Spinner';

export default function ClassDetailsPage() {
  const params = useParams();
  const class_id = params.id as string;

  const { user } = useAuth();
  const {
    createSection,
    regenerateJoinCode,
  } = useClasses();

  const [classData, setClassData] = useState<Class | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [instructorNames, setInstructorNames] = useState<Record<string, string>>({});
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  // sectionId -> true when that section has an active session
  const [liveSectionIds, setLiveSectionIds] = useState<Set<string>>(new Set());
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadClassDetails();
    }
  }, [user, class_id]);

  const loadClassDetails = async () => {
    try {
      const data = await getClass(class_id);
      setClassData(data.class);
      const loadedSections: Section[] = data.sections || [];
      setSections(loadedSections);
      setInstructorNames(data.instructorNames || {});

      // Fan out active-session checks per section (bounded by section count).
      // Per-section failure degrades only that entry; others still render correctly.
      if (loadedSections.length > 0) {
        const results = await Promise.allSettled(
          loadedSections.map(async (s) => {
            const activeSessions = await listSectionSessions(s.id, 'active');
            return { id: s.id, live: activeSessions.length > 0 };
          })
        );
        const liveIds = new Set<string>();
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.live) {
            liveIds.add(result.value.id);
          }
        }
        setLiveSectionIds(liveIds);
      }
    } catch (error) {
      console.error('Failed to load class:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSection = async (name: string, semester: string) => {
    const newSection = await createSection(class_id, name, semester);
    setSections([...sections, newSection]);
    setShowCreateForm(false);
  };

  const handleRegenerateCode = async (section_id: string) => {
    setRegeneratingId(section_id);
    setRegenerateError(null);
    try {
      const updatedSection = await regenerateJoinCode(section_id);
      setSections(prev => prev.map(s =>
        s.id === section_id ? updatedSection : s
      ));
    } catch (err) {
      console.error('Failed to regenerate join code:', err);
      setRegenerateError(err instanceof Error ? err.message : 'Failed to regenerate join code');
    } finally {
      setRegeneratingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" label="Loading class..." />
      </div>
    );
  }

  if (!user || !classData) {
    return null;
  }

  // Derive co-instructor names from instructorNames map (all values).
  const coInstructorNames = Object.values(instructorNames);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="mb-4">
          <BackButton href="/classes">Back to Classes</BackButton>
        </div>
        <SectionLabel className="mb-1">
          Class · {sections.length} section{sections.length !== 1 ? 's' : ''}
        </SectionLabel>
        <h1 className="text-3xl font-bold text-gray-900">{classData.name}</h1>
        {classData.description && (
          <p className="mt-1 text-gray-600">{classData.description}</p>
        )}
      </div>

      {!showCreateForm && (
        <div className="flex justify-end">
          <Button
            variant="accent"
            size="sm"
            onClick={() => setShowCreateForm(true)}
          >
            New Section
          </Button>
        </div>
      )}

      {showCreateForm && (
        <CreateSectionForm
          class_id={class_id}
          className={classData.name}
          onSubmit={handleCreateSection}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {regenerateError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700" data-testid="regenerate-error">
          {regenerateError}
        </div>
      )}

      {/* Main 2-column layout: sections table + right rail */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Sections table */}
        <div>
          <SectionLabel className="mb-2">Sections</SectionLabel>

          {sections.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500 mb-4">No sections yet</p>
              <Button variant="accent" size="sm" onClick={() => setShowCreateForm(true)}>
                Create First Section
              </Button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <Table data-testid="sections-table">
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Section</Table.HeaderCell>
                    <Table.HeaderCell>Code</Table.HeaderCell>
                    <Table.HeaderCell>Students</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell align="right" />
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {sections.map((section) => (
                    <Table.Row key={section.id}>
                      <Table.Cell className="font-medium text-gray-900">{section.name}</Table.Cell>
                      <Table.Cell>
                        <div className="flex items-center gap-1">
                          <code className="font-mono text-xs text-gray-600">
                            {formatJoinCodeForDisplay(section.join_code)}
                          </code>
                          <button
                            onClick={() => handleRegenerateCode(section.id)}
                            disabled={regeneratingId === section.id}
                            className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-40"
                            title="Regenerate join code"
                            data-testid={`regenerate-code-${section.id}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="text-gray-500">—</Table.Cell>
                      <Table.Cell>
                        {(() => {
                          const isLive = liveSectionIds.has(section.id);
                          return (
                            <Pill tone={isLive ? 'ok' : 'neutral'} dot={isLive} data-testid={`status-pill-${section.id}`}>
                              {isLive ? 'Live' : 'Idle'}
                            </Pill>
                          );
                        })()}
                      </Table.Cell>
                      <Table.Cell align="right">
                        <Link
                          href={`/sections/${section.id}`}
                          className="text-xs text-blue-600 hover:text-blue-800"
                          data-testid={`open-section-${section.id}`}
                        >
                          Open →
                        </Link>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </div>

        {/* Right rail: About + Co-instructors */}
        <div className="flex flex-col gap-4">
          {/* About */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <SectionLabel as="h2" className="mb-2">About</SectionLabel>
            <div className="text-xs text-gray-500 leading-relaxed" data-testid="about-section">
              {classData.description ? (
                <p>{classData.description}</p>
              ) : (
                <p className="italic">No description.</p>
              )}
            </div>
          </div>

          {/* Co-instructors */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <SectionLabel as="h2" className="mb-2">Co-instructors</SectionLabel>
            <div className="text-xs text-gray-500" data-testid="co-instructors-section">
              {coInstructorNames.length === 0 ? (
                <p>None yet.</p>
              ) : (
                <ul className="space-y-1">
                  {coInstructorNames.map((name, idx) => (
                    <li key={idx}>{name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
