import * as DiffMatchPatch from 'diff-match-patch';
import { v4 as uuidv4 } from 'uuid';
import { CodeRevision } from './persistence/types';
import { IRevisionRepository } from './persistence/interfaces';

interface BufferedRevision {
  sessionId: string;
  studentId: string;
  namespaceId: string;
  code: string;
  timestamp: Date;
  isDiff: boolean;
  diff?: string;
  revisionCount: number; // Track how many revisions for this student
}

interface StudentRevisionState {
  previousCode: string;
  revisionCount: number;
  buffer: BufferedRevision[];
  flushTimer?: NodeJS.Timeout;
}

/**
 * RevisionBuffer manages server-side code revision tracking with batched persistence.
 *
 * - Receives full code snapshots from clients
 * - Generates diffs server-side
 * - Buffers revisions in memory
 * - Flushes to persistence on:
 *   - Typing pause (5s of inactivity)
 *   - Periodic interval (30s)
 *   - Session end
 */
export class RevisionBuffer {
  private dmp = new DiffMatchPatch.diff_match_patch();
  private revisionRepository: IRevisionRepository;

  // Map: sessionId-studentId -> StudentRevisionState
  private stateMap = new Map<string, StudentRevisionState>();

  // Background flush interval
  private backgroundFlushInterval?: NodeJS.Timeout;

  private readonly TYPING_PAUSE_MS = 5000; // 5 seconds
  private readonly BACKGROUND_FLUSH_MS = 30000; // 30 seconds
  private readonly LARGE_CHANGE_THRESHOLD = 1000; // chars changed
  private readonly SNAPSHOT_INTERVAL = 10; // Store full snapshot every 10 revisions
  private readonly MAX_BUFFER_SIZE = 100; // Max revisions to buffer per student

  constructor(revisionRepository: IRevisionRepository) {
    this.revisionRepository = revisionRepository;
  }

  /**
   * Start the background flush timer
   */
  startAutoFlush(): void {
    if (this.backgroundFlushInterval) {
      return; // Already started
    }

    this.backgroundFlushInterval = setInterval(async () => {
      await this.flushAll();
    }, this.BACKGROUND_FLUSH_MS);
  }

  /**
   * Stop the background flush timer
   */
  stopAutoFlush(): void {
    if (this.backgroundFlushInterval) {
      clearInterval(this.backgroundFlushInterval);
      this.backgroundFlushInterval = undefined;
    }
  }

  /**
   * Add a code revision. Generates diffs server-side from full code snapshots.
   */
  async addRevision(sessionId: string, studentId: string, newCode: string, namespaceId: string = 'default'): Promise<void> {
    const key = this.getKey(sessionId, studentId);
    let state = this.stateMap.get(key);

    // Initialize state if this is the first revision
    if (!state) {
      state = {
        previousCode: '',
        revisionCount: 0,
        buffer: [],
      };
      this.stateMap.set(key, state);
    }

    // Skip if code hasn't changed
    if (state.previousCode === newCode) {
      return;
    }

    const oldCode = state.previousCode;
    state.revisionCount++;

    // Determine if we should store full snapshot or diff
    let isDiff = false;
    let diffText: string | undefined;

    if (state.revisionCount === 1) {
      // First revision: always full snapshot
      isDiff = false;
    } else if (state.revisionCount % this.SNAPSHOT_INTERVAL === 0) {
      // Every Nth revision: full snapshot for recovery
      isDiff = false;
    } else {
      // Calculate diff
      const diffs = this.dmp.diff_main(oldCode, newCode);
      this.dmp.diff_cleanupSemantic(diffs);

      const totalChanges = diffs.reduce((sum, [op, text]) => {
        return op !== DiffMatchPatch.DIFF_EQUAL ? sum + text.length : sum;
      }, 0);

      if (totalChanges > this.LARGE_CHANGE_THRESHOLD) {
        // Large change: store as full snapshot
        isDiff = false;
      } else {
        // Normal change: store as diff
        const patches = this.dmp.patch_make(oldCode, diffs);
        diffText = this.dmp.patch_toText(patches);
        isDiff = true;
      }
    }

    // Create buffered revision
    const bufferedRevision: BufferedRevision = {
      sessionId,
      studentId,
      namespaceId,
      code: newCode,
      timestamp: new Date(),
      isDiff,
      diff: diffText,
      revisionCount: state.revisionCount,
    };

    // Add to buffer
    state.buffer.push(bufferedRevision);

    // Update previous code for next diff
    state.previousCode = newCode;

    // Check buffer size limit
    if (state.buffer.length >= this.MAX_BUFFER_SIZE) {
      await this.flushBuffer(sessionId, studentId);
      return;
    }

    // Reset typing pause timer
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
    }

    state.flushTimer = setTimeout(async () => {
      await this.flushBuffer(sessionId, studentId);
    }, this.TYPING_PAUSE_MS);
  }

  /**
   * Flush buffered revisions for a specific student to persistence
   */
  async flushBuffer(sessionId: string, studentId: string): Promise<void> {
    const key = this.getKey(sessionId, studentId);
    const state = this.stateMap.get(key);

    if (!state || state.buffer.length === 0) {
      return; // Nothing to flush
    }

    try {
      // Clear the flush timer
      if (state.flushTimer) {
        clearTimeout(state.flushTimer);
        state.flushTimer = undefined;
      }

      // Save all buffered revisions to persistence
      for (const buffered of state.buffer) {
        const revision: CodeRevision = {
          id: uuidv4(),
          namespaceId: buffered.namespaceId,
          sessionId: buffered.sessionId,
          studentId: buffered.studentId,
          timestamp: buffered.timestamp,
          isDiff: buffered.isDiff,
          diff: buffered.diff,
          fullCode: buffered.isDiff ? undefined : buffered.code,
        };

        await this.revisionRepository.saveRevision(revision);
      }

      // Clear buffer
      state.buffer = [];
    } catch (error) {
      console.error(`[RevisionBuffer] Error flushing buffer for ${key}:`, error);
      // Keep buffer on error - will retry on next flush
    }
  }

  /**
   * Flush all buffered revisions for all students
   */
  async flushAll(): Promise<void> {
    const keys = Array.from(this.stateMap.keys());

    if (keys.length === 0) {
      return;
    }

    for (const key of keys) {
      const [sessionId, studentId] = key.split('-');
      await this.flushBuffer(sessionId, studentId);
    }
  }

  /**
   * Flush and cleanup state for a specific session (e.g., when session ends)
   */
  async flushSession(sessionId: string): Promise<void> {
    const keys = Array.from(this.stateMap.keys()).filter(k => k.startsWith(sessionId + '-'));

    for (const key of keys) {
      const [, studentId] = key.split('-');
      await this.flushBuffer(sessionId, studentId);
      this.stateMap.delete(key);
    }
  }

  /**
   * Reset state for a student (e.g., when they rejoin with existing code)
   */
  async resetStudent(sessionId: string, studentId: string, currentCode: string): Promise<void> {
    const key = this.getKey(sessionId, studentId);
    const state = this.stateMap.get(key);

    if (state) {
      // Flush any pending revisions before resetting
      await this.flushBuffer(sessionId, studentId);

      // Clear flush timer
      if (state.flushTimer) {
        clearTimeout(state.flushTimer);
        state.flushTimer = undefined;
      }

      // Update baseline code and reset revision count
      state.previousCode = currentCode;
      state.revisionCount = 0;
    } else {
      // Initialize with current code as baseline
      this.stateMap.set(key, {
        previousCode: currentCode,
        revisionCount: 0,
        buffer: [],
      });
    }
  }

  /**
   * Shutdown: flush all and stop timers
   */
  async shutdown(): Promise<void> {
    this.stopAutoFlush();
    await this.flushAll();
    this.stateMap.clear();
  }

  private getKey(sessionId: string, studentId: string): string {
    return `${sessionId}-${studentId}`;
  }
}

// Singleton instance holder (initialized with revision repository)
export const revisionBufferHolder: { instance: RevisionBuffer | null } = {
  instance: null,
};

/**
 * Get or create the RevisionBuffer singleton.
 * Uses service_role for internal system operations (bypasses RLS).
 */
export async function getRevisionBuffer(): Promise<RevisionBuffer> {
  if (!revisionBufferHolder.instance) {
    // Import dynamically to avoid circular dependencies
    const { ServiceRoleRevisionRepository } = await import('./persistence/service-role-revision-repository');
    const revisionRepository = new ServiceRoleRevisionRepository();
    revisionBufferHolder.instance = new RevisionBuffer(revisionRepository);
    revisionBufferHolder.instance.startAutoFlush();
  }
  return revisionBufferHolder.instance;
}
