/**
 * Tests for transaction support on StorageBackend
 */

import { StorageBackend } from '../index';
import { FakeStorageBackend } from '../../__tests__/test-utils/fake-storage';

describe('StorageBackend transaction', () => {
  it('should provide transaction context with all repositories', async () => {
    const storage = new FakeStorageBackend();
    await storage.initialize();

    let contextReceived = false;
    const result = await storage.transaction(async (tx) => {
      // Verify transaction context has all required repositories
      expect(tx.sessions).toBeDefined();
      expect(tx.revisions).toBeDefined();
      expect(tx.problems).toBeDefined();
      expect(tx.users).toBeDefined();
      contextReceived = true;
      return 'success';
    });

    expect(contextReceived).toBe(true);
    expect(result).toBe('success');
  });

  it('should propagate errors from transaction function', async () => {
    const storage = new FakeStorageBackend();
    await storage.initialize();

    await expect(
      storage.transaction(async () => {
        throw new Error('Transaction failed');
      })
    ).rejects.toThrow('Transaction failed');
  });

  it('should return result from transaction function', async () => {
    const storage = new FakeStorageBackend();
    await storage.initialize();

    const result = await storage.transaction(async (tx) => {
      // Use repositories within transaction
      await tx.sessions.createSession({
        id: 'test-session',
        problem: {
          id: 'test-problem',
          title: 'Test Problem',
          description: 'Test description',
          starterCode: 'console.log("test");',
          namespaceId: 'test-namespace',
          authorId: 'test-author',
          classId: 'test-class-id',
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        students: new Map(),
        createdAt: new Date(),
        lastActivity: new Date(),
        creatorId: 'test-instructor',
        participants: [],
        status: 'active' as const,
        namespaceId: 'test-namespace',
        sectionId: 'test-section',
        sectionName: 'Test Section',
      });
      return { sessionId: 'test-session' };
    });

    expect(result).toEqual({ sessionId: 'test-session' });

    // Verify session was created
    const session = await storage.sessions.getSession('test-session');
    expect(session).toBeDefined();
    expect(session?.id).toBe('test-session');
  });
});

describe('Repository-level transaction', () => {
  it('should throw error when calling transaction on individual repositories', async () => {
    const storage = new FakeStorageBackend();
    await storage.initialize();

    // Transaction should not be supported at repository level
    await expect(
      storage.sessions.transaction(async () => 'test')
    ).rejects.toThrow('Transaction not supported at repository level');

    await expect(
      storage.revisions.transaction(async () => 'test')
    ).rejects.toThrow('Transaction not supported at repository level');
  });
});
