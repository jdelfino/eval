/**
 * Shared error message maps for invitation and student registration flows.
 *
 * Canonical copy lives here. Pages import these maps so that the same API
 * error code always produces the same user-visible message regardless of
 * which surface surfaces it.
 */

// ---------------------------------------------------------------------------
// Invitation error messages (from invite/accept/page.tsx)
// ---------------------------------------------------------------------------

export interface InvitationErrorInfo {
  title: string;
  message: string;
}

export type InvitationErrorCode =
  | 'otp_expired'
  | 'otp_invalid'
  | 'invitation_consumed'
  | 'invitation_revoked'
  | 'invitation_not_found'
  | 'invitation_expired'
  | 'network_error'
  | 'unknown';

export const INVITATION_ERROR_MESSAGES: Record<InvitationErrorCode, InvitationErrorInfo> = {
  otp_expired: {
    title: 'Invitation Expired',
    message:
      'This invitation link has expired. Please contact your administrator to send a new invitation.',
  },
  otp_invalid: {
    title: 'Invalid Link',
    message: 'This invitation link is invalid. Please check your email for the correct link.',
  },
  invitation_consumed: {
    title: 'Already Used',
    message: 'This invitation has already been used.',
  },
  invitation_revoked: {
    title: 'Invitation Revoked',
    message: 'This invitation has been revoked. Please contact your administrator.',
  },
  invitation_not_found: {
    title: 'Invitation Not Found',
    message: "We couldn't find your invitation. Please contact your administrator.",
  },
  invitation_expired: {
    title: 'This invitation has expired',
    message:
      "Invitations are only valid for a limited time. Ask the person who invited you to send a new one and we'll get you in.",
  },
  network_error: {
    title: 'Connection Error',
    message: 'Unable to connect. Please check your internet connection and try again.',
  },
  unknown: {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again or contact your administrator.',
  },
};

// ---------------------------------------------------------------------------
// Student registration error messages (from register/student/page.tsx)
// ---------------------------------------------------------------------------

export type RegistrationErrorCode =
  | 'invalid_code'
  | 'section_inactive'
  | 'namespace_at_capacity';

export const REGISTRATION_ERROR_MESSAGES: Record<RegistrationErrorCode, string> = {
  invalid_code:
    "That code doesn't exist. Double-check with your teacher — codes are 3 letters and 3 digits, like ABC-123.",
  section_inactive: 'This section is no longer accepting new students.',
  namespace_at_capacity: 'This class has reached its student limit. Contact your instructor.',
};
