/**
 * Tests for session-service
 */

import {
  createSession,
  createSessionWithProblem,
  addStudent,
  updateStudentCode,
  getStudentData,
  setFeaturedSubmission,
  clearFeaturedSubmission,
  endSession,
  reopenSession,
  cloneProblem,
  createEmptyProblem,
  endActiveSessionIfExists,
} from '../session-service';
import { Session } from '@/server/types';
import { Problem } from '@/server/types/problem';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

describe('session-service', () => {
  // Mock storage
  const createMockStorage = () => ({
    sessions: {
      createSession: jest.fn().mockResolvedValue('session-id'),
      getSession: jest.fn(),
      updateSession: jest.fn().mockResolvedValue(undefined),
      listAllSessions: jest.fn().mockResolvedValue([]),
      deleteSession: jest.fn(),
      listActiveSessions: jest.fn(),
      countSessions: jest.fn(),
    },
    sections: {
      getSection: jest.fn().mockResolvedValue({
        id: 'section-1',
        name: 'Test Section',
        namespaceId: 'default',
        classId: 'class-1',
        joinCode: 'ABC123',
        active: true,
        createdAt: new Date(),
      }),
      listSections: jest.fn(),
      createSection: jest.fn(),
      updateSection: jest.fn(),
      deleteSection: jest.fn(),
    },
    problems: {
      getById: jest.fn(),
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    users: {} as any,
    classes: {} as any,
    memberships: {} as any,
    revisions: {} as any,
  });

  describe('createSession', () => {
    it('creates a session with empty problem', async () => {
      const storage = createMockStorage();

      const session = await createSession(
        storage as any,
        'instructor-1',
        'section-1',
        'default'
      );

      expect(session.id).toBe('test-uuid');
      expect(session.creatorId).toBe('instructor-1');
      expect(session.sectionId).toBe('section-1');
      expect(session.status).toBe('active');
      expect(session.problem.title).toBe('Untitled Session');
      expect(storage.sessions.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid',
          creatorId: 'instructor-1',
        })
      );
    });

    it('throws if section not found', async () => {
      const storage = createMockStorage();
      storage.sections.getSection.mockResolvedValue(null);

      await expect(
        createSession(storage as any, 'instructor-1', 'bad-section', 'default')
      ).rejects.toThrow('Section bad-section not found');
    });

    it('does not throw when active session exists', async () => {
      const storage = createMockStorage();
      storage.sessions.listAllSessions.mockResolvedValue([{ id: 'existing' }]);

      // Should succeed without throwing
      const session = await createSession(storage as any, 'instructor-1', 'section-1', 'default');
      expect(session.status).toBe('active');
    });
  });

  describe('createSessionWithProblem', () => {
    const mockProblem: Problem = {
      id: 'problem-1',
      namespaceId: 'default',
      title: 'Test Problem',
      description: 'Test',
      starterCode: 'print("hello")',
      testCases: [], // Test cases not relevant for these tests
      authorId: 'author-1',
      classId: 'test-class-id',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('creates session with cloned problem', async () => {
      const storage = createMockStorage();
      storage.problems.getById.mockResolvedValue(mockProblem);

      const session = await createSessionWithProblem(
        storage as any,
        'instructor-1',
        'section-1',
        'default',
        'problem-1'
      );

      expect(session.problem.title).toBe('Test Problem');
      expect(session.problem.starterCode).toBe('print("hello")');
    });

    it('throws if problem not found', async () => {
      const storage = createMockStorage();
      storage.problems.getById.mockResolvedValue(null);

      await expect(
        createSessionWithProblem(
          storage as any,
          'instructor-1',
          'section-1',
          'default',
          'bad-problem'
        )
      ).rejects.toThrow('Problem bad-problem not found');
    });
  });

  describe('addStudent', () => {
    it('adds new student with starter code', async () => {
      const storage = createMockStorage();
      const session: Session = {
        id: 'session-1',
        namespaceId: 'default',
        problem: {
          id: 'prob-1',
          namespaceId: 'default',
          title: 'Test',
          description: '',
          starterCode: 'print("starter")',
          authorId: 'a',
          classId: 'test-class-id',
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        students: new Map(),
        participants: [],
        createdAt: new Date(),
        lastActivity: new Date(),
        creatorId: 'instructor-1',
        status: 'active',
        sectionId: 'section-1',
        sectionName: 'Test',
      };

      const student = await addStudent(storage as any, session, 'user-1', 'Alice');

      expect(student.userId).toBe('user-1');
      expect(student.name).toBe('Alice');
      expect(student.code).toBe('print("starter")');
      expect(session.students.has('user-1')).toBe(true);
      expect(session.participants).toContain('user-1');
    });

    it('preserves existing code on rejoin', async () => {
      const storage = createMockStorage();
      const session: Session = {
        id: 'session-1',
        namespaceId: 'default',
        problem: {
          id: 'prob-1',
          namespaceId: 'default',
          title: 'Test',
          description: '',
          starterCode: 'print("starter")',
          authorId: 'a',
          classId: 'test-class-id',
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        students: new Map([
          [
            'user-1',
            {
              userId: 'user-1',
              name: 'Alice',
              code: 'print("my code")',
              lastUpdate: new Date(),
            },
          ],
        ]),
        participants: ['user-1'],
        createdAt: new Date(),
        lastActivity: new Date(),
        creatorId: 'instructor-1',
        status: 'active',
        sectionId: 'section-1',
        sectionName: 'Test',
      };

      const student = await addStudent(storage as any, session, 'user-1', 'Alice');

      expect(student.code).toBe('print("my code")'); // Preserved, not starter
    });
  });

  describe('updateStudentCode', () => {
    it('only upserts the single student being updated, not all students', async () => {
      const storage = createMockStorage();
      const session: Session = {
        id: 'session-1',
        namespaceId: 'default',
        problem: {
          id: 'prob-1',
          namespaceId: 'default',
          title: 'Test',
          description: '',
          starterCode: '',
          authorId: 'a',
          classId: 'test-class-id',
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        students: new Map([
          ['user-1', { userId: 'user-1', name: 'Alice', code: 'old', lastUpdate: new Date() }],
          ['user-2', { userId: 'user-2', name: 'Bob', code: 'bob-code', lastUpdate: new Date() }],
        ]),
        participants: ['user-1', 'user-2'],
        createdAt: new Date(),
        lastActivity: new Date(),
        creatorId: 'instructor-1',
        status: 'active',
        sectionId: 'section-1',
        sectionName: 'Test',
      };

      await updateStudentCode(storage as any, session, 'user-1', 'new-code');

      const updateCall = storage.sessions.updateSession.mock.calls[0];
      const studentsMap = updateCall[1].students as Map<string, any>;

      // Should only contain the updated student, not all students
      expect(studentsMap.size).toBe(1);
      expect(studentsMap.has('user-1')).toBe(true);
      expect(studentsMap.has('user-2')).toBe(false);
      expect(studentsMap.get('user-1').code).toBe('new-code');
    });
  });

  describe('addStudent - RLS safety', () => {
    it('only upserts the single student being added, not all students', async () => {
      const storage = createMockStorage();
      const session: Session = {
        id: 'session-1',
        namespaceId: 'default',
        problem: {
          id: 'prob-1',
          namespaceId: 'default',
          title: 'Test',
          description: '',
          starterCode: 'print("starter")',
          authorId: 'a',
          classId: 'test-class-id',
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        students: new Map([
          ['user-1', { userId: 'user-1', name: 'Alice', code: 'alice-code', lastUpdate: new Date() }],
        ]),
        participants: ['user-1'],
        createdAt: new Date(),
        lastActivity: new Date(),
        creatorId: 'instructor-1',
        status: 'active',
        sectionId: 'section-1',
        sectionName: 'Test',
      };

      await addStudent(storage as any, session, 'user-2', 'Bob');

      const updateCall = storage.sessions.updateSession.mock.calls[0];
      const studentsMap = updateCall[1].students as Map<string, any>;

      // Should only contain the new student, not all students
      expect(studentsMap.size).toBe(1);
      expect(studentsMap.has('user-2')).toBe(true);
      expect(studentsMap.has('user-1')).toBe(false);
    });
  });

  describe('getStudentData', () => {
    it('merges problem and student execution settings', () => {
      const session: Session = {
        id: 'session-1',
        namespaceId: 'default',
        problem: {
          id: 'prob-1',
          namespaceId: 'default',
          title: 'Test',
          description: '',
          starterCode: '',
          authorId: 'a',
          classId: 'test-class-id',
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          executionSettings: {
            stdin: 'problem stdin',
            randomSeed: 42,
          },
        },
        students: new Map([
          [
            'user-1',
            {
              userId: 'user-1',
              name: 'Alice',
              code: 'code',
              lastUpdate: new Date(),
              executionSettings: {
                randomSeed: 123, // Override
              },
            },
          ],
        ]),
        participants: ['user-1'],
        createdAt: new Date(),
        lastActivity: new Date(),
        creatorId: 'instructor-1',
        status: 'active',
        sectionId: 'section-1',
        sectionName: 'Test',
      };

      const data = getStudentData(session, 'user-1');

      expect(data?.code).toBe('code');
      expect(data?.executionSettings?.stdin).toBe('problem stdin'); // From problem
      expect(data?.executionSettings?.randomSeed).toBe(123); // Student override
    });

    it('returns undefined for unknown student', () => {
      const session: Session = {
        id: 'session-1',
        namespaceId: 'default',
        problem: {} as any,
        students: new Map(),
        participants: [],
        createdAt: new Date(),
        lastActivity: new Date(),
        creatorId: 'instructor-1',
        status: 'active',
        sectionId: 'section-1',
        sectionName: 'Test',
      };

      expect(getStudentData(session, 'unknown')).toBeUndefined();
    });
  });

  describe('cloneProblem', () => {
    it('creates deep copy of problem', () => {
      // Using type assertion since we're testing cloning behavior, not TestCase structure
      const original: Problem = {
        id: 'p1',
        namespaceId: 'default',
        title: 'Test',
        description: 'Desc',
        starterCode: 'code',
        testCases: [{ name: 'test1' }] as Problem['testCases'],
        executionSettings: {
          stdin: 'stdin',
          attachedFiles: [{ name: 'f.txt', content: 'c' }],
        },
        authorId: 'a',
        classId: 'test-class-id',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const cloned = cloneProblem(original);

      // Should be equal but not same reference
      expect(cloned.title).toBe(original.title);
      expect(cloned.testCases).not.toBe(original.testCases);
      expect(cloned.executionSettings).not.toBe(original.executionSettings);
      expect(cloned.executionSettings?.attachedFiles).not.toBe(
        original.executionSettings?.attachedFiles
      );
    });
  });

  describe('endSession', () => {
    it('marks session as completed', async () => {
      const storage = createMockStorage();

      await endSession(storage as any, 'session-1');

      expect(storage.sessions.updateSession).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          status: 'completed',
          endedAt: expect.any(Date),
        })
      );
    });
  });

  describe('endActiveSessionIfExists', () => {
    it('returns old session ID when active session exists', async () => {
      const storage = createMockStorage();
      storage.sessions.listAllSessions.mockResolvedValue([{ id: 'old-session-1' }]);

      const result = await endActiveSessionIfExists(storage as any, 'instructor-1', 'default');

      expect(result).toBe('old-session-1');
      expect(storage.sessions.updateSession).toHaveBeenCalledWith(
        'old-session-1',
        expect.objectContaining({ status: 'completed', endedAt: expect.any(Date) })
      );
    });

    it('returns undefined when no active session', async () => {
      const storage = createMockStorage();
      storage.sessions.listAllSessions.mockResolvedValue([]);

      const result = await endActiveSessionIfExists(storage as any, 'instructor-1', 'default');

      expect(result).toBeUndefined();
      expect(storage.sessions.updateSession).not.toHaveBeenCalled();
    });
  });

  describe('reopenSession', () => {
    const completedSession = {
      id: 'session-1',
      namespaceId: 'default',
      status: 'completed',
      sectionId: 'section-1',
      sectionName: 'Test Section',
      creatorId: 'instructor-1',
      participants: [],
      students: new Map(),
      createdAt: new Date(),
      lastActivity: new Date(),
      endedAt: new Date(),
      problem: {
        id: 'prob-1',
        namespaceId: 'default',
        title: 'Test',
        description: '',
        starterCode: '',
        testCases: [],
        authorId: 'instructor-1',
        classId: 'test-class-id',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    it('reopens a completed session', async () => {
      const storage = createMockStorage();
      storage.sessions.getSession.mockResolvedValue(completedSession);
      storage.sessions.listAllSessions.mockResolvedValue([]);

      await reopenSession(storage as any, 'session-1');

      expect(storage.sessions.updateSession).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          status: 'active',
          endedAt: undefined,
          lastActivity: expect.any(Date),
        })
      );
    });

    it('throws if session not found', async () => {
      const storage = createMockStorage();
      storage.sessions.getSession.mockResolvedValue(null);

      await expect(reopenSession(storage as any, 'session-1'))
        .rejects.toThrow('Session not found');
    });

    it('throws if session is not completed', async () => {
      const storage = createMockStorage();
      storage.sessions.getSession.mockResolvedValue({ ...completedSession, status: 'active' });

      await expect(reopenSession(storage as any, 'session-1'))
        .rejects.toThrow('Only completed sessions can be reopened');
    });

    it('throws if active session exists for same section', async () => {
      const storage = createMockStorage();
      storage.sessions.getSession.mockResolvedValue(completedSession);
      storage.sessions.listAllSessions.mockResolvedValue([
        { ...completedSession, id: 'other-session', status: 'active', sectionId: 'section-1' },
      ]);

      await expect(reopenSession(storage as any, 'session-1'))
        .rejects.toThrow('Cannot reopen session');
    });

    it('allows reopen when active session exists in different section', async () => {
      const storage = createMockStorage();
      storage.sessions.getSession.mockResolvedValue(completedSession);
      storage.sessions.listAllSessions.mockResolvedValue([
        { ...completedSession, id: 'other-session', status: 'active', sectionId: 'section-2' },
      ]);

      await reopenSession(storage as any, 'session-1');

      expect(storage.sessions.updateSession).toHaveBeenCalled();
    });
  });
});
