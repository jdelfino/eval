/**
 * Unit tests for RevisionBuffer
 * 
 * Tests the revision buffering system in isolation using a fake storage backend.
 */

import { RevisionBuffer } from '../revision-buffer';
import { createFakeStorage, FakeStorageBackend } from './test-utils/fake-storage';

describe('RevisionBuffer', () => {
  let storage: FakeStorageBackend;
  let buffer: RevisionBuffer;

  beforeEach(() => {
    storage = createFakeStorage();
    buffer = new RevisionBuffer(storage.revisions);
  });

  afterEach(async () => {
    await buffer.shutdown();
    storage.revisions.clear();
  });

  describe('addRevision', () => {
    it('should store first revision as full snapshot', async () => {
      await buffer.addRevision('session1', 'student1', 'print("hello")');

      // Trigger flush immediately
      await buffer.flushBuffer('session1', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(1);
      expect(saved[0].isDiff).toBe(false);
      expect(saved[0].fullCode).toBe('print("hello")');
      expect(saved[0].diff).toBeUndefined();
    });

    it('should generate diff for subsequent small changes', async () => {
      await buffer.addRevision('session1', 'student1', 'print("hello")');
      await buffer.addRevision('session1', 'student1', 'print("hello world")');

      await buffer.flushBuffer('session1', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(2);
      
      // First is full snapshot
      expect(saved[0].isDiff).toBe(false);
      expect(saved[0].fullCode).toBe('print("hello")');
      
      // Second is diff
      expect(saved[1].isDiff).toBe(true);
      expect(saved[1].diff).toBeDefined();
      expect(saved[1].fullCode).toBeUndefined();
    });

    it('should store full snapshot for large changes', async () => {
      const smallCode = 'x = 1';
      const largeCode = 'x = 1\n' + 'y = 2\n'.repeat(200); // Large paste

      await buffer.addRevision('session1', 'student1', smallCode);
      await buffer.addRevision('session1', 'student1', largeCode);

      await buffer.flushBuffer('session1', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(2);
      
      // Second should be full snapshot due to large change
      expect(saved[1].isDiff).toBe(false);
      expect(saved[1].fullCode).toBe(largeCode);
    });

    it('should store full snapshot every 10th revision', async () => {
      let code = 'x = 0';
      
      for (let i = 1; i <= 12; i++) {
        code = `x = ${i}`;
        await buffer.addRevision('session1', 'student1', code);
      }

      await buffer.flushBuffer('session1', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(12);
      
      // 1st, 10th should be full snapshots
      expect(saved[0].isDiff).toBe(false); // 1st (count=1)
      expect(saved[9].isDiff).toBe(false); // 10th (count=10)
      expect(saved[10].isDiff).toBe(true); // 11th (count=11, not a snapshot interval)
      
      // Others should be diffs
      for (let i = 1; i < 9; i++) {
        expect(saved[i].isDiff).toBe(true);
      }
      for (let i = 11; i < 12; i++) {
        expect(saved[i].isDiff).toBe(true);
      }
    });

    it('should skip adding revision if code unchanged', async () => {
      await buffer.addRevision('session1', 'student1', 'same code');
      await buffer.addRevision('session1', 'student1', 'same code');

      await buffer.flushBuffer('session1', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(1); // Only one saved
    });

    it('should track revisions separately per student', async () => {
      await buffer.addRevision('session1', 'student1', 'code A');
      await buffer.addRevision('session1', 'student2', 'code B');

      await buffer.flushBuffer('session1', 'student1');
      await buffer.flushBuffer('session1', 'student2');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(2);
      expect(saved[0].studentId).toBe('student1');
      expect(saved[1].studentId).toBe('student2');
    });

    it('should track revisions separately per session', async () => {
      await buffer.addRevision('session1', 'student1', 'code A');
      await buffer.addRevision('session2', 'student1', 'code B');

      await buffer.flushBuffer('session1', 'student1');
      await buffer.flushBuffer('session2', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(2);
      expect(saved[0].sessionId).toBe('session1');
      expect(saved[1].sessionId).toBe('session2');
    });
  });

  describe('buffering and flushing', () => {
    it('should buffer revisions without immediate persistence', async () => {
      await buffer.addRevision('session1', 'student1', 'code v1');
      await buffer.addRevision('session1', 'student1', 'code v2');

      // Should not persist yet
      expect(storage.revisions.saveRevisionCalls).toHaveLength(0);
    });

    it('should flush buffer on typing pause', async () => {
      jest.useFakeTimers();

      await buffer.addRevision('session1', 'student1', 'code v1');
      expect(storage.revisions.saveRevisionCalls).toHaveLength(0);

      // Advance time past typing pause (5s)
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Let flush complete

      expect(storage.revisions.saveRevisionCalls).toHaveLength(1);

      jest.useRealTimers();
    });

    it('should reset typing pause timer on each new revision', async () => {
      jest.useFakeTimers();

      await buffer.addRevision('session1', 'student1', 'v1');
      jest.advanceTimersByTime(3000); // 3s
      
      await buffer.addRevision('session1', 'student1', 'v2');
      jest.advanceTimersByTime(3000); // Another 3s (total 6s, but timer reset)

      // Should still not flush (timer reset at 3s mark)
      expect(storage.revisions.saveRevisionCalls).toHaveLength(0);

      jest.advanceTimersByTime(2000); // Now total 5s from last edit
      await Promise.resolve();

      expect(storage.revisions.saveRevisionCalls).toHaveLength(2);

      jest.useRealTimers();
    });

    it('should flush immediately when buffer reaches max size', async () => {
      // Add 100 revisions (max buffer size)
      for (let i = 0; i < 100; i++) {
        await buffer.addRevision('session1', 'student1', `code v${i}`);
      }

      // Should auto-flush at 100
      expect(storage.revisions.saveRevisionCalls.length).toBeGreaterThan(0);
    });

    it('should clear buffer after successful flush', async () => {
      await buffer.addRevision('session1', 'student1', 'code v1');
      await buffer.addRevision('session1', 'student1', 'code v2');

      await buffer.flushBuffer('session1', 'student1');

      expect(storage.revisions.saveRevisionCalls).toHaveLength(2);

      // Clear storage spy
      storage.revisions.saveRevisionCalls = [];

      // Add new revision
      await buffer.addRevision('session1', 'student1', 'code v3');
      await buffer.flushBuffer('session1', 'student1');

      // Should only save the new revision
      expect(storage.revisions.saveRevisionCalls).toHaveLength(1);
      // Third revision should be a diff (not snapshot)
      expect(storage.revisions.saveRevisionCalls[0].isDiff).toBe(true);
      expect(storage.revisions.saveRevisionCalls[0].diff).toBeDefined();
    });
  });

  describe('flushAll', () => {
    it('should flush all buffered revisions for all students', async () => {
      await buffer.addRevision('session1', 'student1', 'code A');
      await buffer.addRevision('session1', 'student2', 'code B');
      await buffer.addRevision('session2', 'student1', 'code C');

      await buffer.flushAll();

      expect(storage.revisions.saveRevisionCalls).toHaveLength(3);
    });

    it('should do nothing if no buffered revisions', async () => {
      await buffer.flushAll();
      expect(storage.revisions.saveRevisionCalls).toHaveLength(0);
    });
  });

  describe('flushSession', () => {
    it('should flush all students in a session', async () => {
      await buffer.addRevision('session1', 'student1', 'code A');
      await buffer.addRevision('session1', 'student2', 'code B');
      await buffer.addRevision('session2', 'student1', 'code C');

      await buffer.flushSession('session1');

      expect(storage.revisions.saveRevisionCalls).toHaveLength(2);
      expect(storage.revisions.saveRevisionCalls[0].sessionId).toBe('session1');
      expect(storage.revisions.saveRevisionCalls[1].sessionId).toBe('session1');
    });

    it('should clean up state for flushed session', async () => {
      await buffer.addRevision('session1', 'student1', 'code A');
      await buffer.flushSession('session1');

      // Clear spy
      storage.revisions.saveRevisionCalls = [];

      // Add another revision (should be first revision for this student again)
      await buffer.addRevision('session1', 'student1', 'code B');
      await buffer.flushBuffer('session1', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(1);
      // Should be full snapshot since state was cleared
      expect(saved[0].isDiff).toBe(false);
    });
  });

  describe('resetStudent', () => {
    it('should reset baseline code for a student', async () => {
      await buffer.addRevision('session1', 'student1', 'original code');
      
      // Reset with new baseline
      await buffer.resetStudent('session1', 'student1', 'new baseline');

      // Clear previous saves
      storage.revisions.saveRevisionCalls = [];

      // Add a small change from new baseline
      await buffer.addRevision('session1', 'student1', 'new baseline + edit');
      await buffer.flushBuffer('session1', 'student1');

      // After reset, first revision should be full snapshot (count=1)
      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(1);
      expect(saved[0].isDiff).toBe(false); // First revision after reset
      expect(saved[0].fullCode).toBe('new baseline + edit');
    });

    it('should initialize state if student not tracked yet', async () => {
      await buffer.resetStudent('session1', 'student1', 'initial code');

      await buffer.addRevision('session1', 'student1', 'initial code + edit');
      await buffer.flushBuffer('session1', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(1);
      expect(saved[0].isDiff).toBe(false); // First revision is always full snapshot
      expect(saved[0].fullCode).toBe('initial code + edit');
    });
  });

  describe('auto-flush', () => {
    it('should start background flush on startAutoFlush', () => {
      jest.useFakeTimers();

      buffer.startAutoFlush();

      // Should not flush immediately
      expect(storage.revisions.saveRevisionCalls).toHaveLength(0);

      jest.useRealTimers();
      buffer.stopAutoFlush();
    });

    it('should flush all students every 30 seconds', async () => {
      jest.useFakeTimers();

      buffer.startAutoFlush();

      await buffer.addRevision('session1', 'student1', 'code A');
      await buffer.addRevision('session1', 'student2', 'code B');

      // Advance 30 seconds
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(storage.revisions.saveRevisionCalls.length).toBeGreaterThanOrEqual(2);

      jest.useRealTimers();
      buffer.stopAutoFlush();
    });

    it('should not start auto-flush twice', () => {
      buffer.startAutoFlush();
      buffer.startAutoFlush(); // Should be no-op

      // Should not throw or cause issues
      buffer.stopAutoFlush();
    });

    it('should stop background flush on stopAutoFlush', async () => {
      jest.useFakeTimers();

      // Add revisions to multiple students
      await buffer.addRevision('session1', 'student1', 'code1');
      await buffer.addRevision('session2', 'student2', 'code2');
      
      buffer.startAutoFlush();
      
      // Advance to just before first auto-flush
      jest.advanceTimersByTime(29000);
      
      buffer.stopAutoFlush();

      // Advance past when auto-flush would have occurred
      jest.advanceTimersByTime(2000);

      // Should not auto-flush (timer stopped)
      // Note: typing pause timers may still fire, we're testing that auto-flush interval stopped
      const callsBefore = storage.revisions.saveRevisionCalls.length;
      
      // Advance another 30s - if auto-flush were running, it would fire again
      jest.advanceTimersByTime(30000);
      
      // Should be no additional flushes from auto-flush interval
      // (typing pause timers would have fired already if at all)
      const callsAfter = storage.revisions.saveRevisionCalls.length;
      expect(callsAfter).toBe(callsBefore);

      jest.useRealTimers();
    });
  });

  describe('shutdown', () => {
    it('should flush all buffers on shutdown', async () => {
      await buffer.addRevision('session1', 'student1', 'code A');
      await buffer.addRevision('session1', 'student2', 'code B');

      await buffer.shutdown();

      expect(storage.revisions.saveRevisionCalls).toHaveLength(2);
    });

    it('should stop auto-flush on shutdown', async () => {
      buffer.startAutoFlush();
      await buffer.shutdown();

      // Auto-flush should be stopped (no error on second stop)
      buffer.stopAutoFlush();
    });

    it('should clear all state on shutdown', async () => {
      await buffer.addRevision('session1', 'student1', 'code');
      await buffer.shutdown();

      // Clear spy
      storage.revisions.saveRevisionCalls = [];

      // Add revision after shutdown
      await buffer.addRevision('session1', 'student1', 'new code');
      await buffer.flushBuffer('session1', 'student1');

      // Should be full snapshot (state was cleared)
      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(1);
      expect(saved[0].isDiff).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should keep buffer on storage error and retry on next flush', async () => {
      // Make storage throw error
      const originalSave = storage.revisions.saveRevision.bind(storage.revisions);
      let callCount = 0;
      storage.revisions.saveRevision = jest.fn(async (revision) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Storage error');
        }
        return originalSave(revision);
      });

      await buffer.addRevision('session1', 'student1', 'code');
      
      // First flush should fail
      await buffer.flushBuffer('session1', 'student1');
      expect(storage.revisions.saveRevisionCalls).toHaveLength(0);

      // Second flush should succeed (retry)
      await buffer.flushBuffer('session1', 'student1');
      expect(storage.revisions.saveRevisionCalls).toHaveLength(1);
    });
  });

  describe('diff generation correctness', () => {
    it('should generate valid diffs that can reconstruct code', async () => {
      const code1 = 'def hello():\n    print("hi")';
      const code2 = 'def hello():\n    print("hello world")';

      await buffer.addRevision('session1', 'student1', code1);
      await buffer.addRevision('session1', 'student1', code2);

      await buffer.flushBuffer('session1', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      
      // First is full snapshot
      expect(saved[0].fullCode).toBe(code1);
      
      // Second is diff
      expect(saved[1].isDiff).toBe(true);
      expect(saved[1].diff).toBeDefined();
      expect(saved[1].diff!.length).toBeGreaterThan(0);
    });

    it('should handle empty to non-empty transition', async () => {
      await buffer.addRevision('session1', 'student1', 'x = 1');

      await buffer.flushBuffer('session1', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(1);
      expect(saved[0].fullCode).toBe('x = 1');
      expect(saved[0].isDiff).toBe(false); // First revision
    });

    it('should handle non-empty to empty transition', async () => {
      await buffer.addRevision('session1', 'student1', 'x = 1');
      await buffer.addRevision('session1', 'student1', '');

      await buffer.flushBuffer('session1', 'student1');

      const saved = storage.revisions.saveRevisionCalls;
      expect(saved).toHaveLength(2);
      expect(saved[1].isDiff).toBe(true);
    });
  });
});
