/**
 * Contract tests for the Registration API functions.
 * Validates that the typed API functions work correctly against the real backend.
 *
 * Covers all 4 functions from registration.ts:
 *   - getInvitationDetails()
 *   - acceptInvite()
 *   - getStudentRegistrationInfo()
 *   - registerStudent()
 *
 * These endpoints require valid invitation tokens or join codes to succeed,
 * which cannot be created without admin/instructor access. We test error
 * handling shape: the typed clients should throw errors with .status and
 * optionally .code properties when the backend returns an error.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import {
  getInvitationDetails,
  acceptInvite,
  getStudentRegistrationInfo,
  registerStudent,
} from '@/lib/api/registration';

describe('Registration API', () => {
  describe('getInvitationDetails()', () => {
    it('throws with status for invalid token', async () => {
      try {
        await getInvitationDetails('invalid-token');
        fail('Expected getInvitationDetails to throw');
      } catch (error) {
        // Typed client should throw an Error with .status
        expect(error).toBeInstanceOf(Error);
        expect((error as any).status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe('acceptInvite()', () => {
    beforeAll(() => {
      configureTestAuth(INSTRUCTOR_TOKEN);
    });

    afterAll(() => {
      resetAuthProvider();
    });

    it('throws with status for invalid token', async () => {
      try {
        await acceptInvite('invalid-token');
        fail('Expected acceptInvite to throw');
      } catch (error) {
        // Typed client should throw an Error with .status
        expect(error).toBeInstanceOf(Error);
        expect((error as any).status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe('getStudentRegistrationInfo()', () => {
    it('throws with status and code for invalid join code', async () => {
      try {
        await getStudentRegistrationInfo('ZZZZZZ');
        fail('Expected getStudentRegistrationInfo to throw');
      } catch (error) {
        // Typed client should throw an Error with .status
        expect(error).toBeInstanceOf(Error);
        expect((error as any).status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe('registerStudent()', () => {
    beforeAll(() => {
      configureTestAuth(INSTRUCTOR_TOKEN);
    });

    afterAll(() => {
      resetAuthProvider();
    });

    it('throws with status for invalid join code', async () => {
      try {
        await registerStudent('ZZZZZZ');
        fail('Expected registerStudent to throw');
      } catch (error) {
        // Typed client should throw an Error with .status
        expect(error).toBeInstanceOf(Error);
        expect((error as any).status).toBeGreaterThanOrEqual(400);
      }
    });
  });
});
