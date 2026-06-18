'use client';

/**
 * InstructorDashboard - v4 reskin of the instructor home page.
 *
 * G4 (T13): the live indicator derives from the section pointer
 * (`section.currentSessionId`) plus the 60-min liveness heuristic
 * (`section.lastActivity`, see lib/liveness). A non-null pointer means the
 * section has a "current problem" (rejoin target). "Live now" emphasis (pulse +
 * green pill) additionally requires recent activity; a stale pointer shows the
 * current-problem affordance (rejoin) WITHOUT the live pulse.
 *
 * Layout:
 *   1. Live strip — one card per section with a current-session pointer. Shows
 *      "Live now · N/M connected" (recent) or "Current problem · N/M connected"
 *      (stale), where N = joined students (from GET /sessions/{id}/students) and
 *      M = section.studentCount. Degrades to no fraction when the secondary fetch
 *      fails. Always offers Rejoin.
 *   2. Classes table — class · section name, student count, status pill
 *      (Live / Idle), and action button (Start Session for sections with no
 *      pointer). Rejoin for sections with a pointer is in the live strip above.
 *      No "Meets" column (no meeting-time data). No right rail (dropped per spec).
 *
 * Preserves: start-session-{id} / rejoin-session-{id} testids required by e2e.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/hooks/usePermissions';
import { ErrorAlert } from '@/components/ErrorAlert';
import { formatJoinCodeForDisplay } from '@/lib/join-code';
import { getInstructorDashboard, type DashboardClass } from '@/lib/api/instructor';
import { getSessionStudents } from '@/lib/api/sessions';
import { isSectionLive } from '@/lib/liveness';
import { Pill } from '@/components/ui/Pill';
import { Table } from '@/components/ui/Table';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ConnectionDot } from '@/components/ui/ConnectionDot';
import CreateClassModal from './CreateClassModal';

interface InstructorDashboardProps {
  /** Callback when user wants to start a new session for a section */
  onStartSession: (section_id: string, section_name: string) => void;
  /** Callback when user wants to rejoin an existing active session */
  onRejoinSession: (session_id: string) => void;
}

/**
 * Fetches connected student counts for all current-pointer sessions in parallel.
 * Returns a map of sessionId -> connectedCount.
 * Sessions that fail to fetch are omitted from the map (graceful degradation).
 */
async function fetchConnectedCounts(
  classes: DashboardClass[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  const currentSessions: Array<{ sessionId: string }> = [];
  for (const cls of classes) {
    for (const section of cls.sections) {
      if (section.currentSessionId) {
        currentSessions.push({ sessionId: section.currentSessionId });
      }
    }
  }

  if (currentSessions.length === 0) return results;

  await Promise.all(
    currentSessions.map(async ({ sessionId }) => {
      try {
        const students = await getSessionStudents(sessionId);
        results.set(sessionId, students.length);
      } catch {
        // Degrade gracefully: omit this session from the map
      }
    })
  );

  return results;
}

export function InstructorDashboard({
  onStartSession,
  onRejoinSession,
}: InstructorDashboardProps) {
  const { user } = useAuth();
  const [classesWithSections, setClassesWithSections] = useState<DashboardClass[]>([]);
  // Map of sessionId -> connected student count; null = not yet loaded
  const [connectedCounts, setConnectedCounts] = useState<Map<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);

  const canCreateClass = user && hasPermission(user, 'content.manage');
  const canCreateSession = user && hasPermission(user, 'session.manage');

  const loadDashboardData = useCallback(async (cancelled: { current: boolean }) => {
    try {
      setLoading(true);
      setError(null);

      const data = await getInstructorDashboard();
      if (cancelled.current) return;
      const classes = data.classes || [];

      // Render the table immediately with classes data, then fill in connected counts.
      setClassesWithSections(classes);
      setLoading(false);

      // Fetch connected student counts in the background.
      // Guard against stale updates if the component remounts or loadDashboardData
      // is called again before this secondary fetch resolves.
      fetchConnectedCounts(classes).then((counts) => {
        if (cancelled.current) return;
        setConnectedCounts(counts);
      });
    } catch (err) {
      if (cancelled.current) return;
      console.error('Error loading dashboard:', err);
      setError(err instanceof Error ? err : new Error('Failed to load dashboard'));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cancelled = { current: false };
    loadDashboardData(cancelled);
    return () => { cancelled.current = true; };
  }, [loadDashboardData]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Spinner size="lg" label="Loading dashboard..." />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorAlert
        error={error}
        title="Error loading dashboard"
        onRetry={() => loadDashboardData({ current: false })}
        isRetrying={loading}
      />
    );
  }

  /**
   * Returns all sections with a current-session pointer across all classes.
   * These are the "current problem" / rejoin targets; whether each is "live now"
   * (recent activity) vs stale is decided per-card via the liveness heuristic.
   */
  const getCurrentSections = (classes: DashboardClass[]) => {
    const entries: Array<{ section: DashboardClass['sections'][0]; className: string }> = [];
    for (const cls of classes) {
      for (const section of cls.sections) {
        if (section.currentSessionId) {
          entries.push({ section, className: cls.name });
        }
      }
    }
    return entries;
  };

  const createClassModal = showCreateClassModal ? (
    <CreateClassModal
      onClose={() => setShowCreateClassModal(false)}
      onSuccess={() => {
        setShowCreateClassModal(false);
        loadDashboardData({ current: false });
      }}
    />
  ) : null;

  // Empty state
  if (classesWithSections.length === 0) {
    return (
      <>
        <EmptyState
          icon="book"
          title="Welcome to the Instructor Dashboard"
          body="Create your first class to get started teaching."
          primary={canCreateClass ? (
            <Button
              variant="accent"
              onClick={() => setShowCreateClassModal(true)}
              data-testid="create-first-class-btn"
            >
              Create Your First Class
            </Button>
          ) : undefined}
          className="bg-bg-sunken rounded-lg border-2 border-dashed border-border"
        />
        {createClassModal}
      </>
    );
  }

  const currentSectionEntries = getCurrentSections(classesWithSections);

  return (
    <div data-testid="instructor-dashboard">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-600 mt-1">Manage your classes and start sessions</p>
        </div>
        {canCreateClass && (
          <button
            onClick={() => setShowCreateClassModal(true)}
            className="px-4 py-2 bg-accent text-accent-fg rounded-lg hover:brightness-110 transition-colors font-semibold flex items-center gap-2"
            data-testid="create-class-btn"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Class
          </button>
        )}
      </div>

      {/* Current-problem strip — one card per section with a pointer.
          "Live now" pulse appears only when the pointer session is recently
          active (60-min heuristic); a stale pointer shows "Current problem"
          without the pulse but still offers Rejoin. */}
      {currentSectionEntries.length > 0 && (
        <div className="flex flex-col gap-3 mb-6">
          {currentSectionEntries.map(({ section, className }) => {
            const connectedCount = connectedCounts?.get(section.currentSessionId!) ?? null;
            const subtitle =
              connectedCount !== null
                ? `${connectedCount}/${section.studentCount} connected`
                : null;
            const live = isSectionLive(section.currentSessionId, section.lastActivity);
            const label = live ? 'Live now' : 'Current problem';

            return (
              <div
                key={section.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-info bg-info-soft px-4 py-3"
              >
                <div>
                  <SectionLabel style={{ color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {live && <ConnectionDot status="live" compact />}
                    <span>{label}{subtitle ? ` · ${subtitle}` : null}</span>
                  </SectionLabel>
                  <div className="mt-1 text-base font-semibold text-gray-900">
                    {section.name} · {className}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-gray-500">
                    {formatJoinCodeForDisplay(section.join_code)}
                  </div>
                </div>
                <button
                  onClick={() => onRejoinSession(section.currentSessionId!)}
                  className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:brightness-110 transition-colors"
                  data-testid={`rejoin-session-${section.id}`}
                >
                  Rejoin session
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Classes table — no Meets column, no right rail */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Class</Table.HeaderCell>
              <Table.HeaderCell>Section</Table.HeaderCell>
              <Table.HeaderCell>Students</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell align="right">Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {classesWithSections.map((classInfo) => (
              classInfo.sections.length === 0 ? (
                // Class with no sections
                <Table.Row key={classInfo.id}>
                  <Table.Cell>
                    <Link
                      href={`/classes/${classInfo.id}`}
                      className="font-medium text-accent-ink hover:underline"
                      data-testid={`class-link-${classInfo.id}`}
                    >
                      {classInfo.name}
                    </Link>
                  </Table.Cell>
                  <Table.Cell className="text-gray-500 italic">No sections yet</Table.Cell>
                  <Table.Cell className="text-gray-500">—</Table.Cell>
                  <Table.Cell>—</Table.Cell>
                  <Table.Cell align="right">—</Table.Cell>
                </Table.Row>
              ) : (
                // Class with sections — one row per section
                classInfo.sections.map((section, sectionIndex) => {
                  const sectionLive = isSectionLive(section.currentSessionId, section.lastActivity);
                  const hasPointer = !!section.currentSessionId;
                  return (
                  <Table.Row
                    key={section.id}
                    data-testid={`section-row-${section.id}`}
                  >
                    <Table.Cell>
                      {sectionIndex === 0 ? (
                        <Link
                          href={`/classes/${classInfo.id}`}
                          className="font-medium text-accent-ink hover:underline"
                          data-testid={`class-link-${classInfo.id}`}
                        >
                          {classInfo.name}
                        </Link>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell>
                      <Link
                        href={`/sections/${section.id}`}
                        className="text-sm font-medium text-accent-ink hover:underline"
                        data-testid={`section-link-${section.id}`}
                      >
                        {section.name}
                      </Link>
                      <div className="text-xs text-gray-500 font-mono" data-testid="join-code">
                        {formatJoinCodeForDisplay(section.join_code)}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-gray-500">
                      {section.studentCount}
                    </Table.Cell>
                    <Table.Cell>
                      <Pill
                        tone={sectionLive ? 'ok' : 'neutral'}
                        dot={sectionLive}
                        data-testid={`status-pill-${section.id}`}
                      >
                        {sectionLive ? 'Live' : 'Idle'}
                      </Pill>
                    </Table.Cell>
                    <Table.Cell align="right">
                      {/* Start session button only for sections with no current
                          pointer. Rejoin for sections with a pointer is provided
                          in the current-problem strip above. */}
                      {canCreateSession && !hasPointer && (
                        <button
                          onClick={() => onStartSession(section.id, section.name)}
                          className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent-soft text-accent-ink hover:brightness-105 transition-colors"
                          data-testid={`start-session-${section.id}`}
                        >
                          Start Session
                        </button>
                      )}
                    </Table.Cell>
                  </Table.Row>
                  );
                })
              )
            ))}
          </Table.Body>
        </Table>
      </div>

      {createClassModal}
    </div>
  );
}
