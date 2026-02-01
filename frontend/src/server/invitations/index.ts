/**
 * Invitation system module
 *
 * Provides controlled onboarding for namespace-admins and instructors
 * via email invitations. Uses Supabase Auth for token management.
 */

export * from './types';
export * from './interfaces';

// Services
export { InvitationService } from './invitation-service';
export { CapacityService } from './capacity-service';
export {
  StudentRegistrationService,
  StudentRegistrationError,
  type ValidateSectionCodeResult,
  type RegisterStudentResult,
} from './student-registration-service';

// Instance factories
export {
  getInvitationRepository,
  getCapacityService,
  getInvitationService,
  getStudentRegistrationService,
} from './instance';
