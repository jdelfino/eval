/**
 * Student registration service for handling section join code registration
 *
 * Handles student self-registration via section join codes. Unlike invitations
 * (which are for instructors/admins), students register themselves by providing
 * a join code for their section.
 *
 * Flow:
 * 1. Student gets join code from instructor
 * 2. Student provides: join code, email, password (and optional displayName)
 * 3. Service validates join code and capacity
 * 4. Creates user with role='student' and namespaceId from section
 * 5. Adds user to section membership
 */

import { ISectionRepository, IMembershipRepository } from '../classes/interfaces';
import { INamespaceRepository, IAuthProvider } from '../auth/interfaces';
import { Section } from '../classes/types';
import { Namespace } from '../auth/types';
import { CapacityService } from './capacity-service';
import { InvitationError } from './types';

/**
 * Error codes for student registration operations
 */
export type StudentRegistrationErrorCode =
  | 'INVALID_CODE'
  | 'SECTION_INACTIVE'
  | 'NAMESPACE_NOT_FOUND'
  | 'NAMESPACE_AT_CAPACITY'
  | 'INVALID_EMAIL'
  | 'INVALID_PASSWORD'
  | 'USER_CREATION_FAILED'
  | 'MEMBERSHIP_FAILED';

/**
 * Error thrown when student registration operations fail
 */
export class StudentRegistrationError extends Error {
  constructor(
    message: string,
    public readonly code: StudentRegistrationErrorCode
  ) {
    super(message);
    this.name = 'StudentRegistrationError';
  }
}

/**
 * Result of validating a section join code
 */
export interface ValidateSectionCodeResult {
  /** Whether the code is valid and section is active */
  valid: boolean;
  /** The section if found and active */
  section?: Section;
  /** The namespace the section belongs to */
  namespace?: Namespace;
  /** Whether the namespace has capacity for another student */
  capacityAvailable?: boolean;
  /** Error code if validation failed */
  error?: StudentRegistrationErrorCode;
}

/**
 * Result of successful student registration
 */
export interface RegisterStudentResult {
  /** The created user */
  user: {
    id: string;
    email: string;
    role: 'student';
    namespaceId: string;
    displayName?: string;
    createdAt: Date;
  };
  /** The section the student was enrolled in */
  section: Section;
}

/**
 * Validates an email address format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Service for student self-registration via section join codes
 */
export class StudentRegistrationService {
  constructor(
    private sectionRepository: ISectionRepository,
    private namespaceRepository: INamespaceRepository,
    private capacityService: CapacityService,
    private authProvider: IAuthProvider,
    private membershipRepository: IMembershipRepository
  ) {}

  /**
   * Validate a section join code
   *
   * Checks if the code is valid, the section is active, and if there's
   * capacity for another student in the namespace.
   *
   * @param code - The section join code to validate
   * @returns Validation result with section and namespace info
   */
  async validateSectionCode(code: string): Promise<ValidateSectionCodeResult> {
    // Normalize the code: trim whitespace, uppercase, remove non-alphanumeric
    const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Check for empty code
    if (!cleaned) {
      return { valid: false, error: 'INVALID_CODE' };
    }

    // Use the cleaned code directly (database stores codes without dashes as 6-char strings)
    const normalizedCode = cleaned;

    // Look up the section by join code
    const section = await this.sectionRepository.getSectionByJoinCode(normalizedCode);

    if (!section) {
      return { valid: false, error: 'INVALID_CODE' };
    }

    // Check if section is active
    if (!section.active) {
      return { valid: false, error: 'SECTION_INACTIVE' };
    }

    // Look up the namespace
    const namespace = await this.namespaceRepository.getNamespace(section.namespaceId);

    if (!namespace) {
      return { valid: false, error: 'NAMESPACE_NOT_FOUND' };
    }

    // Check capacity
    const capacityAvailable = await this.capacityService.canAddUser(section.namespaceId, 'student');

    return {
      valid: true,
      section,
      namespace,
      capacityAvailable,
    };
  }

  /**
   * Register a new student via section join code
   *
   * Creates a new user account with role='student' and enrolls them
   * in the section.
   *
   * @param sectionJoinCode - The section join code
   * @param email - Student's email address
   * @param password - Student's password
   * @param displayName - Optional display name for the student
   * @returns The created user and section
   * @throws StudentRegistrationError for validation or creation failures
   */
  async registerStudent(
    sectionJoinCode: string,
    email: string,
    password: string,
    displayName?: string
  ): Promise<RegisterStudentResult> {
    // Validate and normalize inputs
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    if (!isValidEmail(normalizedEmail)) {
      throw new StudentRegistrationError('Invalid email format', 'INVALID_EMAIL');
    }

    // Validate password
    if (!password) {
      throw new StudentRegistrationError('Password is required', 'INVALID_PASSWORD');
    }

    // Validate the section code
    const validation = await this.validateSectionCode(sectionJoinCode);

    if (!validation.valid) {
      throw new StudentRegistrationError(
        this.getErrorMessage(validation.error!),
        validation.error!
      );
    }

    const section = validation.section!;
    const namespaceId = section.namespaceId;

    // Enforce capacity limits
    try {
      await this.capacityService.enforceCapacity(namespaceId, 'student');
    } catch (error) {
      if (error instanceof InvitationError && error.code === 'NAMESPACE_AT_CAPACITY') {
        throw new StudentRegistrationError(
          'Namespace is at capacity for students',
          'NAMESPACE_AT_CAPACITY'
        );
      }
      throw error;
    }

    // Create the user account
    let user;
    try {
      user = await this.authProvider.signUp(
        normalizedEmail,
        password,
        'student',
        namespaceId
      );

      // Update display name if provided
      if (displayName?.trim()) {
        await this.authProvider.updateUser(user.id, { displayName: displayName.trim() });
        user.displayName = displayName.trim();
      }
    } catch (error) {
      throw new StudentRegistrationError(
        `Failed to create user account: ${(error as Error).message}`,
        'USER_CREATION_FAILED'
      );
    }

    // Add user to section membership
    try {
      await this.membershipRepository.addMembership({
        userId: user.id,
        sectionId: section.id,
        role: 'student',
      });
    } catch (error) {
      // Note: User was already created, so we have a partial state here.
      // In a production system, we might want to use a transaction or
      // clean up the user if membership fails.
      throw new StudentRegistrationError(
        `Failed to add user to section: ${(error as Error).message}`,
        'MEMBERSHIP_FAILED'
      );
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        role: 'student',
        namespaceId: user.namespaceId!,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      section,
    };
  }

  /**
   * Get a human-readable error message for an error code
   */
  private getErrorMessage(code: StudentRegistrationErrorCode): string {
    switch (code) {
      case 'INVALID_CODE':
        return 'Invalid section join code';
      case 'SECTION_INACTIVE':
        return 'Section is no longer active';
      case 'NAMESPACE_NOT_FOUND':
        return 'Organization not found';
      case 'NAMESPACE_AT_CAPACITY':
        return 'Organization is at capacity for students';
      case 'INVALID_EMAIL':
        return 'Invalid email format';
      case 'INVALID_PASSWORD':
        return 'Password is required';
      case 'USER_CREATION_FAILED':
        return 'Failed to create user account';
      case 'MEMBERSHIP_FAILED':
        return 'Failed to enroll in section';
      default:
        return 'An error occurred during registration';
    }
  }
}
