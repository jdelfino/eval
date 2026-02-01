/**
 * Fake storage backend for unit testing.
 * Provides in-memory implementations of all storage interfaces.
 */

import {
  IStorageBackend,
  ISessionRepository,
  IRevisionRepository,
  IUserRepository,
} from '../../persistence/interfaces';
import {
  StoredSession,
  StoredRevision,
  StorageMetadata,
} from '../../persistence/types';
import { Session } from '../../types';
import { User } from '../../auth/types';
import { FakeSectionRepository, FakeClassRepository, FakeMembershipRepository } from './fake-classes';

/**
 * Fake revision repository that stores revisions in memory
 */
export class FakeRevisionRepository implements IRevisionRepository {
  private revisions: Map<string, StoredRevision> = new Map();
  private sessionRevisions: Map<string, Map<string, StoredRevision[]>> = new Map();

  // Spy arrays to track method calls
  public saveRevisionCalls: StoredRevision[] = [];
  public getRevisionsCalls: Array<{ sessionId: string; studentId: string }> = [];

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async health(): Promise<boolean> { return true; }

  async transaction<T>(fn: (tx: import('../../persistence/interfaces').TransactionContext) => Promise<T>): Promise<T> {
    throw new Error('Transaction not supported at repository level. Use FakeStorageBackend.transaction()');
  }

  async saveRevision(revision: Omit<StoredRevision, '_metadata'>): Promise<string> {
    const stored: StoredRevision = {
      ...revision,
      _metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      },
    };

    this.saveRevisionCalls.push(stored);
    this.revisions.set(revision.id, stored);

    // Index by session and student
    const sessionKey = `${revision.sessionId}-${revision.studentId}`;
    let sessionMap = this.sessionRevisions.get(revision.sessionId);
    if (!sessionMap) {
      sessionMap = new Map();
      this.sessionRevisions.set(revision.sessionId, sessionMap);
    }

    let studentRevisions = sessionMap.get(revision.studentId);
    if (!studentRevisions) {
      studentRevisions = [];
      sessionMap.set(revision.studentId, studentRevisions);
    }

    studentRevisions.push(stored);
    studentRevisions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return revision.id;
  }

  async getRevisions(sessionId: string, studentId: string): Promise<StoredRevision[]> {
    this.getRevisionsCalls.push({ sessionId, studentId });

    const sessionMap = this.sessionRevisions.get(sessionId);
    if (!sessionMap) return [];

    return sessionMap.get(studentId) || [];
  }

  async getRevision(revisionId: string): Promise<StoredRevision | null> {
    return this.revisions.get(revisionId) || null;
  }

  async getLatestRevision(sessionId: string, studentId: string): Promise<StoredRevision | null> {
    const revisions = await this.getRevisions(sessionId, studentId);
    return revisions.length > 0 ? revisions[revisions.length - 1] : null;
  }

  async deleteRevision(revisionId: string): Promise<boolean> {
    return this.revisions.delete(revisionId);
  }

  async deleteSessionRevisions(sessionId: string): Promise<number> {
    const sessionMap = this.sessionRevisions.get(sessionId);
    if (!sessionMap) return 0;

    let count = 0;
    for (const [studentId, revisions] of sessionMap) {
      count += revisions.length;
      for (const rev of revisions) {
        this.revisions.delete(rev.id);
      }
    }

    this.sessionRevisions.delete(sessionId);
    return count;
  }

  async deleteStudentRevisions(sessionId: string, studentId: string): Promise<number> {
    const sessionMap = this.sessionRevisions.get(sessionId);
    if (!sessionMap) return 0;

    const revisions = sessionMap.get(studentId) || [];
    for (const rev of revisions) {
      this.revisions.delete(rev.id);
    }

    sessionMap.delete(studentId);
    return revisions.length;
  }

  async deleteRevisions(sessionId: string, studentId?: string): Promise<void> {
    if (studentId) {
      await this.deleteStudentRevisions(sessionId, studentId);
    } else {
      await this.deleteSessionRevisions(sessionId);
    }
  }

  async getAllSessionRevisions(sessionId: string): Promise<Map<string, StoredRevision[]>> {
    return this.sessionRevisions.get(sessionId) || new Map();
  }

  async countRevisions(sessionId: string, studentId?: string): Promise<number> {
    if (studentId) {
      const revisions = await this.getRevisions(sessionId, studentId);
      return revisions.length;
    }

    const sessionMap = this.sessionRevisions.get(sessionId);
    if (!sessionMap) return 0;

    let total = 0;
    for (const revisions of sessionMap.values()) {
      total += revisions.length;
    }
    return total;
  }

  // Helper methods for testing
  clear() {
    this.revisions.clear();
    this.sessionRevisions.clear();
    this.saveRevisionCalls = [];
    this.getRevisionsCalls = [];
  }

  getRevisionCount(): number {
    return this.revisions.size;
  }
}

/**
 * Fake session repository (minimal implementation for testing)
 */
export class FakeSessionRepository implements ISessionRepository {
  private sessions: Map<string, StoredSession> = new Map();

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async health(): Promise<boolean> { return true; }

  async transaction<T>(fn: (tx: import('../../persistence/interfaces').TransactionContext) => Promise<T>): Promise<T> {
    throw new Error('Transaction not supported at repository level. Use FakeStorageBackend.transaction()');
  }

  async createSession(session: Session): Promise<string> {
    const stored: StoredSession = {
      ...session,
      _metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      },
    };
    this.sessions.set(session.id, stored);
    return session.id;
  }

  async getSession(sessionId: string): Promise<StoredSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      Object.assign(existing, updates);
      if (existing._metadata) {
        existing._metadata.updatedAt = new Date();
        existing._metadata.version++;
      }
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async listActiveSessions(): Promise<StoredSession[]> {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  async listAllSessions(): Promise<StoredSession[]> {
    return Array.from(this.sessions.values());
  }

  async countSessions(): Promise<number> {
    return this.sessions.size;
  }

  // Helper methods for testing
  clear() {
    this.sessions.clear();
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}

/**
 * Fake user repository (minimal implementation for testing)
 */
export class FakeUserRepository implements IUserRepository {
  private users: Map<string, User> = new Map();
  private emailIndex: Map<string, string> = new Map(); // email -> userId
  private nextId = 1;

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async health(): Promise<boolean> { return true; }

  async transaction<T>(fn: (tx: import('../../persistence/interfaces').TransactionContext) => Promise<T>): Promise<T> {
    throw new Error('Transaction not supported at repository level. Use FakeStorageBackend.transaction()');
  }

  async createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const newUser: User = {
      ...user,
      id: `user-${this.nextId++}`,
      createdAt: new Date(),
    };
    this.users.set(newUser.id, newUser);
    this.emailIndex.set(newUser.email.toLowerCase(), newUser.id);
    return newUser;
  }

  async saveUser(user: User): Promise<void> {
    this.users.set(user.id, user);
    this.emailIndex.set(user.email.toLowerCase(), user.id);
  }

  async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const userId = this.emailIndex.get(email.toLowerCase());
    return userId ? this.users.get(userId) || null : null;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    Object.assign(user, updates);
  }

  async deleteUser(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    this.emailIndex.delete(user.email.toLowerCase());
    this.users.delete(userId);
  }

  async listUsers(role?: any, namespaceId?: string): Promise<User[]> {
    let users = Array.from(this.users.values());

    if (namespaceId !== undefined) {
      users = users.filter(user => user.namespaceId === namespaceId);
    }

    if (role) {
      users = users.filter(user => user.role === role);
    }

    return users;
  }

  async getUsersByNamespace(namespaceId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(
      user => user.namespaceId === namespaceId
    );
  }

  clear() {
    this.users.clear();
    this.emailIndex.clear();
    this.nextId = 1;
  }
}

/**
 * Fake storage backend combining all repositories
 */
export class FakeStorageBackend implements IStorageBackend {
  public readonly sessions: FakeSessionRepository;
  public readonly revisions: FakeRevisionRepository;
  public readonly users: FakeUserRepository;
  public readonly problems: any; // Fake problem repository for tests
  public readonly sections: FakeSectionRepository;
  public readonly classes: FakeClassRepository;
  public memberships: FakeMembershipRepository; // Not readonly to allow test overrides

  constructor() {
    this.sessions = new FakeSessionRepository();
    this.revisions = new FakeRevisionRepository();
    this.users = new FakeUserRepository();
    this.sections = new FakeSectionRepository();
    this.classes = new FakeClassRepository();
    this.memberships = new FakeMembershipRepository();
    this.problems = {
      initialize: async () => {},
      shutdown: async () => {},
      health: async () => true,
      create: async (problem: any) => ({ id: problem.id || 'fake-problem-id', ...problem }),
      getById: async (id: string) => {
        // Return a mock problem that matches the requested ID
        return {
          id,
          namespaceId: 'default',
          title: 'Mock Problem',
          description: 'A mock problem for testing',
          starterCode: 'print("test")',
          authorId: 'test-author',
          classId: 'test-class-id',
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      getAll: async () => [],
      update: async (id: string, updates: any) => ({ id, ...updates }),
      delete: async () => {},
      search: async () => [],
      getByAuthor: async () => [],
      getByClass: async () => [],
      duplicate: async (id: string) => ({ id: `${id}-copy` }),
    };
  }

  async initialize(): Promise<void> {
    await this.sessions.initialize();
    await this.revisions.initialize();
    await this.users.initialize();
  }

  async shutdown(): Promise<void> {
    await this.sessions.shutdown();
    await this.revisions.shutdown();
    await this.users.shutdown();
  }

  async health(): Promise<boolean> {
    const results = await Promise.all([
      this.sessions.health(),
      this.revisions.health(),
      this.users.health(),
    ]);
    return results.every(r => r === true);
  }

  async transaction<T>(fn: (tx: import('../../persistence/interfaces').TransactionContext) => Promise<T>): Promise<T> {
    // Fake storage doesn't support real transactions - execute directly
    const context: import('../../persistence/interfaces').TransactionContext = {
      sessions: this.sessions,
      revisions: this.revisions,
      problems: this.problems,
      users: this.users,
      classes: this.classes,
      sections: this.sections,
      memberships: this.memberships!, // Non-null assertion since it's set in constructor
    };
    return fn(context);
  }
}

/**
 * Create a fake storage backend for testing
 */
export function createFakeStorage(): FakeStorageBackend {
  return new FakeStorageBackend();
}
