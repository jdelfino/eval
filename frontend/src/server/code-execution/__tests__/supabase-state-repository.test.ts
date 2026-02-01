/**
 * Unit tests for SupabaseBackendStateRepository
 *
 * Tests the backend state repository implementation using Supabase's session_backend_state table.
 * Uses Jest mocks for Supabase client isolation.
 */

import { SupabaseBackendStateRepository } from '../supabase-state-repository';

// Mock the Supabase client module
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockUpsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();

jest.mock('../../supabase/client', () => ({
  getSupabaseClient: jest.fn(() => ({
    from: mockFrom,
  })),
  getClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

describe('SupabaseBackendStateRepository', () => {
  let repository: SupabaseBackendStateRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new SupabaseBackendStateRepository();
  });

  describe('assignBackend', () => {
    it('should upsert a row to assign backend to session', async () => {
      mockFrom.mockReturnValue({
        upsert: mockUpsert.mockResolvedValue({ data: null, error: null }),
      });

      await repository.assignBackend('session-123', 'vercel-sandbox');

      expect(mockFrom).toHaveBeenCalledWith('session_backend_state');
      expect(mockUpsert).toHaveBeenCalledWith(
        {
          session_id: 'session-123',
          backend_type: 'vercel-sandbox',
          state_id: 'pending-vercel-sandbox',
        },
        { onConflict: 'session_id' }
      );
    });

    it('should throw error on upsert failure', async () => {
      mockFrom.mockReturnValue({
        upsert: mockUpsert.mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      });

      await expect(
        repository.assignBackend('session-123', 'vercel-sandbox')
      ).rejects.toThrow('Failed to assign backend: Database error');
    });
  });

  describe('getAssignedBackend', () => {
    it('should return backend_type if row exists', async () => {
      const mockSingleResult = jest.fn().mockResolvedValue({
        data: { backend_type: 'vercel-sandbox' },
        error: null,
      });
      const mockEqResult = jest.fn().mockReturnValue({ single: mockSingleResult });
      const mockSelectResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        select: mockSelectResult,
      });

      const result = await repository.getAssignedBackend('session-123');

      expect(mockFrom).toHaveBeenCalledWith('session_backend_state');
      expect(mockSelectResult).toHaveBeenCalledWith('backend_type');
      expect(mockEqResult).toHaveBeenCalledWith('session_id', 'session-123');
      expect(result).toBe('vercel-sandbox');
    });

    it('should return local-python backend type when assigned', async () => {
      const mockSingleResult = jest.fn().mockResolvedValue({
        data: { backend_type: 'local-python' },
        error: null,
      });
      const mockEqResult = jest.fn().mockReturnValue({ single: mockSingleResult });
      const mockSelectResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        select: mockSelectResult,
      });

      const result = await repository.getAssignedBackend('session-456');

      expect(result).toBe('local-python');
    });

    it('should return null if row does not exist', async () => {
      const mockSingleResult = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      const mockEqResult = jest.fn().mockReturnValue({ single: mockSingleResult });
      const mockSelectResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        select: mockSelectResult,
      });

      const result = await repository.getAssignedBackend('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error on query failure', async () => {
      const mockSingleResult = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'OTHER', message: 'Connection failed' },
      });
      const mockEqResult = jest.fn().mockReturnValue({ single: mockSingleResult });
      const mockSelectResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        select: mockSelectResult,
      });

      await expect(repository.getAssignedBackend('session-123')).rejects.toThrow(
        'Failed to get assigned backend: Connection failed'
      );
    });
  });

  describe('saveState', () => {
    it('should update state_id from state.sandboxId', async () => {
      const mockEqResult = jest.fn().mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue({
        update: mockUpdate.mockReturnValue({ eq: mockEqResult }),
      });

      await repository.saveState('session-123', { sandboxId: 'sandbox-abc-123' });

      expect(mockFrom).toHaveBeenCalledWith('session_backend_state');
      expect(mockUpdate).toHaveBeenCalledWith({ state_id: 'sandbox-abc-123' });
      expect(mockEqResult).toHaveBeenCalledWith('session_id', 'session-123');
    });

    it('should update state_id from state.stateId', async () => {
      const mockEqResult = jest.fn().mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue({
        update: mockUpdate.mockReturnValue({ eq: mockEqResult }),
      });

      await repository.saveState('session-123', { stateId: 'container-xyz-789' });

      expect(mockUpdate).toHaveBeenCalledWith({ state_id: 'container-xyz-789' });
    });

    it('should throw error if sandboxId and stateId are missing', async () => {
      await expect(
        repository.saveState('session-123', { foo: 'bar' })
      ).rejects.toThrow('saveState requires state.sandboxId or state.stateId');
    });

    it('should throw error on update failure', async () => {
      const mockEqResult = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      });
      mockFrom.mockReturnValue({
        update: mockUpdate.mockReturnValue({ eq: mockEqResult }),
      });

      await expect(
        repository.saveState('session-123', { sandboxId: 'sandbox-abc' })
      ).rejects.toThrow('Failed to save state: Update failed');
    });
  });

  describe('getState', () => {
    it('should return state with sandboxId and stateId if row exists', async () => {
      const mockSingleResult = jest.fn().mockResolvedValue({
        data: { state_id: 'sandbox-xyz-789', backend_type: 'vercel-sandbox' },
        error: null,
      });
      const mockEqResult = jest.fn().mockReturnValue({ single: mockSingleResult });
      const mockSelectResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        select: mockSelectResult,
      });

      const result = await repository.getState('session-123');

      expect(mockFrom).toHaveBeenCalledWith('session_backend_state');
      expect(mockSelectResult).toHaveBeenCalledWith('state_id, backend_type');
      expect(mockEqResult).toHaveBeenCalledWith('session_id', 'session-123');
      expect(result).toEqual({
        sandboxId: 'sandbox-xyz-789',
        stateId: 'sandbox-xyz-789',
        backendType: 'vercel-sandbox',
      });
    });

    it('should return null if row does not exist', async () => {
      const mockSingleResult = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      const mockEqResult = jest.fn().mockReturnValue({ single: mockSingleResult });
      const mockSelectResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        select: mockSelectResult,
      });

      const result = await repository.getState('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error on query failure', async () => {
      const mockSingleResult = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'OTHER', message: 'Database error' },
      });
      const mockEqResult = jest.fn().mockReturnValue({ single: mockSingleResult });
      const mockSelectResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        select: mockSelectResult,
      });

      await expect(repository.getState('session-123')).rejects.toThrow(
        'Failed to get state: Database error'
      );
    });
  });

  describe('deleteState', () => {
    it('should delete the row for the session', async () => {
      const mockEqResult = jest.fn().mockResolvedValue({ data: null, error: null });
      const mockDeleteResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        delete: mockDeleteResult,
      });

      await repository.deleteState('session-123');

      expect(mockFrom).toHaveBeenCalledWith('session_backend_state');
      expect(mockDeleteResult).toHaveBeenCalled();
      expect(mockEqResult).toHaveBeenCalledWith('session_id', 'session-123');
    });

    it('should throw error on delete failure', async () => {
      const mockEqResult = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Delete failed' },
      });
      const mockDeleteResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        delete: mockDeleteResult,
      });

      await expect(repository.deleteState('session-123')).rejects.toThrow(
        'Failed to delete state: Delete failed'
      );
    });

    it('should succeed even if row does not exist', async () => {
      // Supabase delete does not error on missing rows
      const mockEqResult = jest.fn().mockResolvedValue({ data: null, error: null });
      const mockDeleteResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        delete: mockDeleteResult,
      });

      await expect(repository.deleteState('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('hasState', () => {
    it('should return true if row exists', async () => {
      const mockSingleResult = jest.fn().mockResolvedValue({
        data: { session_id: 'session-123' },
        error: null,
      });
      const mockEqResult = jest.fn().mockReturnValue({ single: mockSingleResult });
      const mockSelectResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        select: mockSelectResult,
      });

      const result = await repository.hasState('session-123');

      expect(mockFrom).toHaveBeenCalledWith('session_backend_state');
      expect(mockSelectResult).toHaveBeenCalledWith('session_id');
      expect(mockEqResult).toHaveBeenCalledWith('session_id', 'session-123');
      expect(result).toBe(true);
    });

    it('should return false if row does not exist', async () => {
      const mockSingleResult = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      const mockEqResult = jest.fn().mockReturnValue({ single: mockSingleResult });
      const mockSelectResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        select: mockSelectResult,
      });

      const result = await repository.hasState('nonexistent');

      expect(result).toBe(false);
    });

    it('should throw error on query failure', async () => {
      const mockSingleResult = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'OTHER', message: 'Connection error' },
      });
      const mockEqResult = jest.fn().mockReturnValue({ single: mockSingleResult });
      const mockSelectResult = jest.fn().mockReturnValue({ eq: mockEqResult });

      mockFrom.mockReturnValue({
        select: mockSelectResult,
      });

      await expect(repository.hasState('session-123')).rejects.toThrow(
        'Failed to check state: Connection error'
      );
    });
  });
});
