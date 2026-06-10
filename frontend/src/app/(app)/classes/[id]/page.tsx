'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useClasses } from '@/hooks/useClasses';
import type { Class, Section } from '@/types/api';
import { getClass } from '@/lib/api/classes';
import { formatJoinCodeForDisplay } from '@/lib/join-code';
import CreateSectionForm from '../components/CreateSectionForm';
import { BackButton } from '@/components/ui/BackButton';

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

  useEffect(() => {
    if (user) {
      loadClassDetails();
    }
  }, [user, class_id]);

  const loadClassDetails = async () => {
    try {
      const data = await getClass(class_id);
      setClassData(data.class);
      setSections(data.sections || []);
      setInstructorNames(data.instructorNames || {});
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
    try {
      const updatedSection = await regenerateJoinCode(section_id);
      setSections(prev => prev.map(s =>
        s.id === section_id ? updatedSection : s
      ));
    } finally {
      setRegeneratingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
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
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Class · {sections.length} section{sections.length !== 1 ? 's' : ''}
        </p>
        <h1 className="text-3xl font-bold text-gray-900">{classData.name}</h1>
        {classData.description && (
          <p className="mt-1 text-gray-600">{classData.description}</p>
        )}
      </div>

      <div className="flex justify-between items-center">
        <div />
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Section
          </button>
        )}
      </div>

      {showCreateForm && (
        <CreateSectionForm
          class_id={class_id}
          className={classData.name}
          onSubmit={handleCreateSection}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Main 2-column layout: sections table + right rail */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Sections table */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Sections
          </div>

          {sections.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500 mb-4">No sections yet</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Create First Section
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full border-collapse text-sm" data-testid="sections-table">
                <thead className="bg-gray-50">
                  <tr>
                    {['Section', 'Code', 'Students', 'Status', ''].map((h, i) => (
                      <th
                        key={h || `col-${i}`}
                        className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400"
                        style={i === 4 ? { textAlign: 'right' } : {}}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => (
                    <tr key={section.id} className="border-t border-gray-100">
                      <td className="px-3 py-2.5 font-medium text-gray-900">{section.name}</td>
                      <td className="px-3 py-2.5">
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
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">—</td>
                      <td className="px-3 py-2.5">
                        {section.active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded-full">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
                            Idle
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          href={`/sections/${section.id}`}
                          className="text-xs text-blue-600 hover:text-blue-800"
                          data-testid={`open-section-${section.id}`}
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right rail: About + Co-instructors */}
        <div className="flex flex-col gap-4">
          {/* About */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">About</h3>
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Co-instructors</h3>
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
