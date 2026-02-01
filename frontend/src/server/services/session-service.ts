/**
 * Session Service - Pure functions for session business logic
 *
 * This service contains stateless functions that handle session operations.
 * All functions accept storage as a dependency (no instance state).
 *
 * Extracted from session-manager.ts to separate business logic from
 * WebSocket state management.
 */

import { v4 as uuidv4 } from 'uuid';
import { IStorageRepository } from '@/server/persistence/interfaces';
import { Session, Student } from '@/server/types';
import { Problem, ExecutionSettings } from '@/server/types/problem';

// ============================================================================
// Session Creation
// ============================================================================

/**
 * Create a new session within a section
 *
 * Business logic:
 * - Validates section exists and namespace matches
 * - Creates session with empty problem
 *
 * @throws Error if validation fails
 */
export async function createSession(
  storage: IStorageRepository,
  creatorId: string,
  sectionId: string,
  namespaceId: string
): Promise<Session> {
  // Validate section exists
  if (!storage.sections) {
    throw new Error(
      'Sections repository not available - this is a critical system error.'
    );
  }

  const section = await storage.sections.getSection(sectionId, namespaceId);
  if (!section) {
    throw new Error(`Section ${sectionId} not found in namespace ${namespaceId}`);
  }

  // Verify namespace consistency
  if (section.namespaceId !== namespaceId) {
    throw new Error(
      `Namespace mismatch: Section ${sectionId} belongs to namespace ${section.namespaceId}, not ${namespaceId}`
    );
  }

  // Create session
  const sessionId = uuidv4();
  const session: Session = {
    id: sessionId,
    namespaceId: section.namespaceId,
    problem: createEmptyProblem(creatorId, section.namespaceId, section.classId),
    students: new Map(),
    createdAt: new Date(),
    lastActivity: new Date(),
    creatorId,
    participants: [],
    status: 'active',
    sectionId,
    sectionName: section.name,
  };

  await storage.sessions.createSession(session);
  return session;
}

/**
 * Create session with a cloned problem
 */
export async function createSessionWithProblem(
  storage: IStorageRepository,
  creatorId: string,
  sectionId: string,
  namespaceId: string,
  problemId: string
): Promise<Session> {
  // Validate problem exists and belongs to namespace
  const problem = await storage.problems.getById(problemId, namespaceId);
  if (!problem) {
    throw new Error(
      `Problem ${problemId} not found in namespace ${namespaceId}. ` +
        `Cross-namespace problem references are not allowed.`
    );
  }

  // Validate section exists
  if (!storage.sections) {
    throw new Error(
      'Sections repository not available - this is a critical system error.'
    );
  }

  const section = await storage.sections.getSection(sectionId, namespaceId);
  if (!section) {
    throw new Error(`Section ${sectionId} not found in namespace ${namespaceId}`);
  }

  // Create session with cloned problem
  const sessionId = uuidv4();
  const session: Session = {
    id: sessionId,
    namespaceId: section.namespaceId,
    problem: cloneProblem(problem),
    students: new Map(),
    createdAt: new Date(),
    lastActivity: new Date(),
    creatorId,
    participants: [],
    status: 'active',
    sectionId,
    sectionName: section.name,
  };

  await storage.sessions.createSession(session);
  return session;
}

// ============================================================================
// Student Operations
// ============================================================================

/**
 * Add a student to a session (or update existing student on rejoin)
 *
 * Business logic:
 * - Preserves existing code on rejoin
 * - Initializes with starter code on first join
 * - Adds to participants list if not present
 */
export async function addStudent(
  storage: IStorageRepository,
  session: Session,
  userId: string,
  name: string
): Promise<Student> {
  // Check if student already exists (rejoining)
  const existingStudent = session.students.get(userId);

  // Initialize with starter code if first join, preserve existing code otherwise
  const initialCode =
    existingStudent?.code !== undefined
      ? existingStudent.code
      : session.problem?.starterCode || '';

  const student: Student = {
    userId,
    name: name.trim(),
    code: initialCode,
    lastUpdate: new Date(),
    executionSettings: existingStudent?.executionSettings,
  };

  // Update session (keyed by userId)
  session.students.set(userId, student);

  if (!session.participants.includes(userId)) {
    session.participants.push(userId);
  }

  // Persist - only upsert the single student being added, not all students.
  // RLS policies restrict students to updating their own rows (user_id = auth.uid()).
  const singleStudentMap = new Map([[userId, student]]);
  await storage.sessions.updateSession(session.id, {
    students: singleStudentMap,
    participants: session.participants,
    lastActivity: new Date(),
  });

  return student;
}

/**
 * Update student code and optionally execution settings
 */
export async function updateStudentCode(
  storage: IStorageRepository,
  session: Session,
  userId: string,
  code: string,
  executionSettings?: ExecutionSettings
): Promise<void> {
  const student = session.students.get(userId);
  if (!student) {
    throw new Error(`Student ${userId} not found in session`);
  }

  student.code = code;
  student.lastUpdate = new Date();

  if (executionSettings) {
    student.executionSettings = {
      ...student.executionSettings,
      ...executionSettings,
    };
  }

  // Only upsert the single student being updated, not all students.
  // RLS policies restrict students to updating their own rows (user_id = auth.uid()),
  // so sending all students would fail for any student besides the caller.
  const singleStudentMap = new Map([[userId, student]]);
  await storage.sessions.updateSession(session.id, {
    students: singleStudentMap,
    lastActivity: new Date(),
  });
}

/**
 * Get student data with merged execution settings
 *
 * Merges problem-level settings with student-level overrides
 */
export function getStudentData(
  session: Session,
  userId: string
):
  | {
      code: string;
      executionSettings?: ExecutionSettings;
    }
  | undefined {
  const student = session.students.get(userId);
  if (!student) return undefined;

  const problemSettings = session.problem?.executionSettings;
  const studentSettings = student.executionSettings;

  // Build merged execution settings
  const mergedSettings: ExecutionSettings = {
    stdin: studentSettings?.stdin ?? problemSettings?.stdin,
    randomSeed:
      studentSettings?.randomSeed !== undefined
        ? studentSettings.randomSeed
        : problemSettings?.randomSeed,
    attachedFiles:
      studentSettings?.attachedFiles !== undefined
        ? studentSettings.attachedFiles
        : problemSettings?.attachedFiles,
  };

  const hasSettings =
    mergedSettings.stdin !== undefined ||
    mergedSettings.randomSeed !== undefined ||
    mergedSettings.attachedFiles !== undefined;

  return {
    code: student.code,
    executionSettings: hasSettings ? mergedSettings : undefined,
  };
}

// ============================================================================
// Featured Submissions
// ============================================================================

/**
 * Set a student's code as the featured submission
 */
export async function setFeaturedSubmission(
  storage: IStorageRepository,
  session: Session,
  studentId: string
): Promise<void> {
  const student = session.students.get(studentId);
  if (!student) {
    throw new Error(`Student ${studentId} not found in session`);
  }

  await storage.sessions.updateSession(session.id, {
    featuredStudentId: studentId,
    featuredCode: student.code,
    lastActivity: new Date(),
  });
}

/**
 * Set arbitrary code as the featured display (e.g. a solution)
 */
export async function setFeaturedCode(
  storage: IStorageRepository,
  sessionId: string,
  code: string
): Promise<void> {
  await storage.sessions.updateSession(sessionId, {
    featuredStudentId: undefined,
    featuredCode: code,
    lastActivity: new Date(),
  });
}

/**
 * Clear the featured submission
 */
export async function clearFeaturedSubmission(
  storage: IStorageRepository,
  sessionId: string
): Promise<void> {
  await storage.sessions.updateSession(sessionId, {
    featuredStudentId: undefined,
    featuredCode: undefined,
    lastActivity: new Date(),
  });
}

// ============================================================================
// Problem Management
// ============================================================================

/**
 * Update the problem in an active session
 *
 * @param storage Storage repository
 * @param sessionId Session to update
 * @param problem Problem to set (will be cloned)
 * @param executionSettings Optional execution settings override
 */
export async function updateSessionProblem(
  storage: IStorageRepository,
  sessionId: string,
  problem: Problem,
  executionSettings?: ExecutionSettings
): Promise<void> {
  // Clone the problem to avoid mutation
  const clonedProblem = cloneProblem(problem);

  // Merge executionSettings into the cloned problem
  if (executionSettings !== undefined) {
    clonedProblem.executionSettings = executionSettings;
  }

  await storage.sessions.updateSession(sessionId, {
    problem: clonedProblem,
    lastActivity: new Date(),
  });
}

// ============================================================================
// Session Lifecycle
// ============================================================================

/**
 * End any existing active session for a user in a namespace.
 * Returns the ended session's ID, or undefined if no active session existed.
 */
export async function endActiveSessionIfExists(
  storage: IStorageRepository,
  creatorId: string,
  namespaceId: string
): Promise<string | undefined> {
  const activeSessions = await storage.sessions.listAllSessions({
    instructorId: creatorId,
    active: true,
    namespaceId,
  });

  if (activeSessions.length > 0) {
    const sessionId = activeSessions[0].id;
    await endSession(storage, sessionId);
    return sessionId;
  }

  return undefined;
}

/**
 * End a session (mark as completed)
 */
export async function endSession(
  storage: IStorageRepository,
  sessionId: string
): Promise<void> {
  await storage.sessions.updateSession(sessionId, {
    status: 'completed',
    endedAt: new Date(),
  });
}

/**
 * Reopen a completed session (set back to active)
 *
 * Business logic:
 * - Session must be in 'completed' status
 * - No other active session may exist for the same section
 * - Clears endedAt, sets status to active, updates lastActivity
 *
 * @throws Error if session is not completed or active session exists for section
 */
export async function reopenSession(
  storage: IStorageRepository,
  sessionId: string
): Promise<void> {
  const session = await storage.sessions.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'completed') {
    throw new Error('Only completed sessions can be reopened');
  }

  // Check for existing active sessions in the same section
  const activeSessions = await storage.sessions.listAllSessions({
    active: true,
    namespaceId: session.namespaceId,
  });

  const activeInSection = activeSessions.filter(s => s.sectionId === session.sectionId);
  if (activeInSection.length > 0) {
    throw new Error(
      'Cannot reopen session: An active session already exists for this section. ' +
      'End the current session before reopening this one.'
    );
  }

  await storage.sessions.updateSession(sessionId, {
    status: 'active',
    endedAt: undefined,
    lastActivity: new Date(),
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clone a problem for use in a session
 * Creates a deep copy to avoid modifying the original
 */
export function cloneProblem(problem: Problem): Problem {
  return {
    ...problem,
    testCases: problem.testCases
      ? [...problem.testCases.map((tc) => ({ ...tc }))]
      : undefined,
    executionSettings: problem.executionSettings
      ? {
          ...problem.executionSettings,
          attachedFiles: problem.executionSettings.attachedFiles
            ? problem.executionSettings.attachedFiles.map((f) => ({ ...f }))
            : undefined,
        }
      : undefined,
  };
}

/**
 * Create an empty problem for a new session
 */
export function createEmptyProblem(authorId: string, namespaceId: string, classId: string): Problem {
  return {
    id: uuidv4(),
    namespaceId,
    title: 'Untitled Session',
    description: '',
    starterCode: '',
    testCases: [],
    executionSettings: undefined,
    authorId,
    classId,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
