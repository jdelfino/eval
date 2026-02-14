/**
 * Unit tests for registration API client functions.
 * @jest-environment jsdom
 */

const mockPublicGet = jest.fn();
const mockApiPost = jest.fn();

jest.mock('@/lib/public-api-client', () => ({
  publicGet: (...args: unknown[]) => mockPublicGet(...args),
}));

jest.mock('@/lib/api-client', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

import {
  getInvitationDetails,
  acceptInvite,
  getStudentRegistrationInfo,
  registerStudent,
} from '../registration';
import type { InvitationDetails, RegisterStudentInfo, User } from '@/types/api';

const fakeInvitation: InvitationDetails = {
  id: 'inv-1',
  email: 'test@example.com',
  target_role: 'instructor',
  namespace_id: 'ns-1',
  status: 'pending',
  created_by: 'admin-1',
  created_at: '2024-01-01T00:00:00Z',
  expires_at: '2024-02-01T00:00:00Z',
  consumed_at: null,
  consumed_by: null,
  revoked_at: null,
};

const fakeUser: User = {
  id: 'user-1',
  external_id: 'ext-1',
  email: 'test@example.com',
  role: 'instructor',
  namespace_id: 'ns-1',
  display_name: 'Test User',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const fakeRegistrationInfo: RegisterStudentInfo = {
  section: {
    id: 'sec-1',
    namespace_id: 'ns-1',
    class_id: 'cls-1',
    name: 'Monday 2pm',
    semester: 'Fall 2024',
    join_code: 'ABC123',
    active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  class: {
    id: 'cls-1',
    namespace_id: 'ns-1',
    name: 'CS 101',
    description: 'Intro to CS',
    created_by: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
};

describe('registration API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInvitationDetails', () => {
    it('calls publicGet with correct path and returns InvitationDetails', async () => {
      mockPublicGet.mockResolvedValue(fakeInvitation);

      const result = await getInvitationDetails('my-token-uuid');

      expect(mockPublicGet).toHaveBeenCalledWith(
        '/auth/accept-invite?token=my-token-uuid'
      );
      expect(result).toEqual(fakeInvitation);
    });

    it('encodes the token in the URL', async () => {
      mockPublicGet.mockResolvedValue(fakeInvitation);

      await getInvitationDetails('token with spaces');

      expect(mockPublicGet).toHaveBeenCalledWith(
        '/auth/accept-invite?token=token%20with%20spaces'
      );
    });

    it('propagates errors from publicGet', async () => {
      const error = new Error('Not found');
      (error as any).status = 404;
      (error as any).code = 'INVITATION_NOT_FOUND';
      mockPublicGet.mockRejectedValue(error);

      await expect(getInvitationDetails('bad-token')).rejects.toThrow('Not found');
    });
  });

  describe('acceptInvite', () => {
    it('calls apiPost with token and display name', async () => {
      mockApiPost.mockResolvedValue(fakeUser);

      const result = await acceptInvite('inv-1', 'John Doe');

      expect(mockApiPost).toHaveBeenCalledWith('/auth/accept-invite', {
        token: 'inv-1',
        display_name: 'John Doe',
      });
      expect(result).toEqual(fakeUser);
    });

    it('omits display_name when not provided', async () => {
      mockApiPost.mockResolvedValue(fakeUser);

      await acceptInvite('inv-1');

      expect(mockApiPost).toHaveBeenCalledWith('/auth/accept-invite', {
        token: 'inv-1',
        display_name: undefined,
      });
    });

    it('propagates errors from apiPost', async () => {
      const error = new Error('Invitation consumed');
      (error as any).status = 409;
      (error as any).code = 'INVITATION_CONSUMED';
      mockApiPost.mockRejectedValue(error);

      await expect(acceptInvite('inv-1')).rejects.toThrow('Invitation consumed');
    });
  });

  describe('getStudentRegistrationInfo', () => {
    it('calls publicGet with correct path and returns RegisterStudentInfo', async () => {
      mockPublicGet.mockResolvedValue(fakeRegistrationInfo);

      const result = await getStudentRegistrationInfo('ABC123');

      expect(mockPublicGet).toHaveBeenCalledWith(
        '/auth/register-student?code=ABC123'
      );
      expect(result).toEqual(fakeRegistrationInfo);
    });

    it('encodes the code in the URL', async () => {
      mockPublicGet.mockResolvedValue(fakeRegistrationInfo);

      await getStudentRegistrationInfo('AB&CD');

      expect(mockPublicGet).toHaveBeenCalledWith(
        '/auth/register-student?code=AB%26CD'
      );
    });

    it('propagates errors from publicGet', async () => {
      const error = new Error('Invalid code');
      (error as any).status = 400;
      (error as any).code = 'INVALID_CODE';
      mockPublicGet.mockRejectedValue(error);

      await expect(getStudentRegistrationInfo('BAD')).rejects.toThrow('Invalid code');
    });
  });

  describe('registerStudent', () => {
    it('calls apiPost with join code and display name', async () => {
      mockApiPost.mockResolvedValue(fakeUser);

      const result = await registerStudent('ABC123', 'Jane Doe');

      expect(mockApiPost).toHaveBeenCalledWith('/auth/register-student', {
        join_code: 'ABC123',
        display_name: 'Jane Doe',
      });
      expect(result).toEqual(fakeUser);
    });

    it('omits display_name when not provided', async () => {
      mockApiPost.mockResolvedValue(fakeUser);

      await registerStudent('ABC123');

      expect(mockApiPost).toHaveBeenCalledWith('/auth/register-student', {
        join_code: 'ABC123',
        display_name: undefined,
      });
    });

    it('propagates errors from apiPost', async () => {
      const error = new Error('At capacity');
      (error as any).status = 422;
      (error as any).code = 'NAMESPACE_AT_CAPACITY';
      mockApiPost.mockRejectedValue(error);

      await expect(registerStudent('ABC123')).rejects.toThrow('At capacity');
    });
  });
});
