/**
 * Shared state across contract test files.
 * Reads from global setup state file.
 */
import { getSetupState } from './helpers';

const setupState = getSetupState();

export const state: {
  namespaceId: string;
  invitationId: string;
  instructorUserId: string;
  classId: string;
  sectionId: string;
  sessionId: string;
  joinCode: string;
} = {
  namespaceId: setupState?.namespaceId || '',
  invitationId: setupState?.invitationId || '',
  instructorUserId: setupState?.instructorUserId || '',
  classId: setupState?.classId || '',
  sectionId: setupState?.sectionId || '',
  sessionId: setupState?.sessionId || '',
  joinCode: setupState?.joinCode || '',
};
