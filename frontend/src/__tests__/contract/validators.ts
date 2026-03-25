/**
 * Shared validation helpers for contract tests.
 *
 * Uses typia.assertEquals<T>() to validate API response shapes at runtime.
 * Typia generates validators from TypeScript interfaces at compile time
 * via an AST transformer — no separate schemas to maintain.
 *
 * Each validator throws a TypeGuardError if the object does not exactly
 * match the expected interface: wrong field names, extra unexpected fields,
 * missing required fields, or wrong types all cause failures.
 */

import typia from 'typia';
import type { User, Session, SessionStudent, TestResponse, SectionProblem, PublishedProblemWithStatus, StudentWork, StudentWorkWithProblem, StudentProgress, StudentWorkSummary } from '@/types/api';
import type { SerializedInvitation } from '@/lib/api/invitations';
import type {
  StudentJoinedData,
  StudentCodeUpdatedData,
  SessionEndedData,
  SessionReplacedData,
  FeaturedStudentChangedData,
  ProblemUpdatedData,
  SessionStartedInSectionData,
  SessionEndedInSectionData,
} from '@/types/realtime-events';

// ---------------------------------------------------------------------------
// API resource validators (11)
// ---------------------------------------------------------------------------

/** Validate the shape of a User object from the backend. */
export function validateUserShape(user: User): void {
  typia.assertEquals<User>(user);
}

/** Validate the shape of a SerializedInvitation object from the backend. */
export function validateInvitationShape(inv: SerializedInvitation): void {
  typia.assertEquals<SerializedInvitation>(inv);
}

/** Validate the shape of a Session object from the backend. */
export function validateSessionShape(session: Session): void {
  typia.assertEquals<Session>(session);
}

/** Validate the shape of a SessionStudent object with type-safe field access. */
export function validateSessionStudentShape(obj: SessionStudent, _label = 'SessionStudent'): void {
  typia.assertEquals<SessionStudent>(obj);
}

/** Validate the shape of a TestResponse object from the backend (cases[] protocol). */
export function validateTestResponseShape(obj: TestResponse, _label = 'TestResponse'): void {
  typia.assertEquals<TestResponse>(obj);
}

/** Validate the shape of a SectionProblem object from the backend. */
export function validateSectionProblemShape(obj: SectionProblem, _label = 'SectionProblem'): void {
  typia.assertEquals<SectionProblem>(obj);
}

/** Validate the shape of a PublishedProblemWithStatus object from the backend. */
export function validatePublishedProblemWithStatusShape(
  obj: PublishedProblemWithStatus,
  _label = 'PublishedProblemWithStatus'
): void {
  typia.assertEquals<PublishedProblemWithStatus>(obj);
}

/** Validate the shape of a StudentWork object from the backend. */
export function validateStudentWorkShape(obj: StudentWork, _label = 'StudentWork'): void {
  typia.assertEquals<StudentWork>(obj);
}

/** Validate the shape of a StudentWorkWithProblem object from the backend. */
export function validateStudentWorkWithProblemShape(
  obj: StudentWorkWithProblem,
  _label = 'StudentWorkWithProblem'
): void {
  typia.assertEquals<StudentWorkWithProblem>(obj);
}

/** Validate the shape of a StudentProgress object from the backend. */
export function validateStudentProgressShape(obj: StudentProgress, _label = 'StudentProgress'): void {
  typia.assertEquals<StudentProgress>(obj);
}

/** Validate the shape of a StudentWorkSummary object from the backend. */
export function validateStudentWorkSummaryShape(obj: StudentWorkSummary, _label = 'StudentWorkSummary'): void {
  typia.assertEquals<StudentWorkSummary>(obj);
}

// ---------------------------------------------------------------------------
// Realtime event payload shape validators (8)
// ---------------------------------------------------------------------------

/** Validate the shape of a student_joined event payload. */
export function validateStudentJoinedShape(obj: StudentJoinedData): void {
  typia.assertEquals<StudentJoinedData>(obj);
}

/** Validate the shape of a student_code_updated event payload. */
export function validateStudentCodeUpdatedShape(obj: StudentCodeUpdatedData): void {
  typia.assertEquals<StudentCodeUpdatedData>(obj);
}

/** Validate the shape of a session_ended event payload. */
export function validateSessionEndedShape(obj: SessionEndedData): void {
  typia.assertEquals<SessionEndedData>(obj);
}

/** Validate the shape of a session_replaced event payload. */
export function validateSessionReplacedShape(obj: SessionReplacedData): void {
  typia.assertEquals<SessionReplacedData>(obj);
}

/** Validate the shape of a featured_student_changed event payload. */
export function validateFeaturedStudentChangedShape(obj: FeaturedStudentChangedData): void {
  typia.assertEquals<FeaturedStudentChangedData>(obj);
}

/** Validate the shape of a problem_updated event payload. */
export function validateProblemUpdatedShape(obj: ProblemUpdatedData): void {
  typia.assertEquals<ProblemUpdatedData>(obj);
}

/** Validate the shape of a session_started_in_section event payload. */
export function validateSessionStartedInSectionShape(obj: SessionStartedInSectionData): void {
  typia.assertEquals<SessionStartedInSectionData>(obj);
}

/** Validate the shape of a session_ended_in_section event payload. */
export function validateSessionEndedInSectionShape(obj: SessionEndedInSectionData): void {
  typia.assertEquals<SessionEndedInSectionData>(obj);
}
