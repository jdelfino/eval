/**
 * Data models for classes, sections, and memberships
 *
 * Establishes the organizational hierarchy for multi-tenancy:
 * - Class (e.g., CS 101, Data Structures)
 *   - Section (e.g., Fall 2025 - Section A)
 *     - Instructors (1 or more)
 *     - Students (enrolled via join code)
 *     - Sessions (coding sessions for this section)
 */

/**
 * Class represents a course offering (e.g., CS 101, Data Structures)
 *
 * A class can have multiple sections across different semesters or time slots.
 * The instructor who creates the class is tracked in createdBy.
 */
export interface Class {
  /** Unique identifier for the class */
  id: string;

  /** Namespace this class belongs to */
  namespaceId: string;

  /** Class name (e.g., "CS 101 - Introduction to Programming") */
  name: string;

  /** Optional description of the class */
  description?: string;

  /** User ID of the instructor who created this class */
  createdBy: string;

  /** Timestamp when the class was created */
  createdAt: Date;

  /** Timestamp when the class was last updated */
  updatedAt: Date;
}

/**
 * Section represents a specific offering of a class
 *
 * Sections allow instructors to organize students into groups (e.g., by semester,
 * time slot, or cohort). Each section has its own join code and can have multiple
 * instructors for co-teaching scenarios.
 */
export interface Section {
  /** Unique identifier for the section */
  id: string;

  /** Namespace this section belongs to */
  namespaceId: string;

  /** ID of the class this section belongs to */
  classId: string;

  /** Section name (e.g., "Section A", "MWF 10am") */
  name: string;

  /** Optional semester or term (e.g., "Fall 2025", "Spring 2026") */
  semester?: string;

  /** Unique join code for students to enroll (format: ABC-123-XYZ) */
  joinCode: string;

  /** Whether the section is currently active (soft delete support) */
  active: boolean;

  /** Timestamp when the section was created */
  createdAt: Date;

  /** Timestamp when the section was last updated */
  updatedAt: Date;
}

/**
 * SectionMembership represents a user's enrollment in a section
 *
 * Tracks both instructors and students, with the role field distinguishing
 * between them. Multiple memberships allow students to be in multiple sections
 * and instructors to teach multiple sections.
 */
export interface SectionMembership {
  /** Unique identifier for the membership */
  id: string;

  /** ID of the user (student or instructor) */
  userId: string;

  /** ID of the section they're enrolled in */
  sectionId: string;

  /** Role of the user in this section */
  role: 'instructor' | 'student';

  /** Timestamp when the user joined this section */
  joinedAt: Date;
}

/**
 * SectionWithClass combines section and class information for display
 *
 * Used in UI contexts where both section and class details are needed
 * together (e.g., student dashboard showing enrolled sections).
 */
export interface SectionWithClass extends Section {
  /** Class information for this section */
  class: {
    id: string;
    name: string;
    description?: string;
  };
}

/**
 * SectionStats provides aggregated statistics about a section
 *
 * Used for instructor dashboards and section management views.
 */
export interface SectionStats {
  /** Number of students enrolled in this section */
  studentCount: number;

  /** Total number of sessions created for this section */
  sessionCount: number;

  /** Number of currently active sessions */
  activeSessionCount: number;
}

/**
 * Filters for querying sections
 */
export interface SectionFilters {
  /** Filter by class ID */
  classId?: string;

  /** Filter by instructor ID (sections where this user is an instructor) */
  instructorId?: string;

  /** Filter by active status */
  active?: boolean;

  /** Filter by namespace ID */
  namespaceId?: string;
}
