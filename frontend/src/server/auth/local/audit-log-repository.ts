/**
 * Local file-based audit log repository
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  IAuditLogRepository,
  AuditLogEntry,
  AuditLogFilters,
} from '../audit';

/**
 * Local file-based implementation of audit log repository
 */
export class LocalAuditLogRepository implements IAuditLogRepository {
  private auditLogPath: string;
  private entries: AuditLogEntry[] = [];
  private initialized = false;

  constructor(dataDir: string = './data') {
    this.auditLogPath = path.join(dataDir, 'audit-log.json');
  }

  /**
   * Initialize the repository by loading existing audit logs
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const data = await fs.readFile(this.auditLogPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.entries = parsed.map((entry: any) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      }));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, start with empty array
        this.entries = [];
        await this.save();
      } else {
        throw error;
      }
    }

    this.initialized = true;
  }

  /**
   * Save audit logs to file
   */
  private async save(): Promise<void> {
    const dir = path.dirname(this.auditLogPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.auditLogPath,
      JSON.stringify(this.entries, null, 2),
      'utf-8'
    );
  }

  /**
   * Create a new audit log entry
   */
  async createEntry(
    entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
  ): Promise<AuditLogEntry> {
    await this.initialize();

    const newEntry: AuditLogEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: new Date(),
    };

    this.entries.push(newEntry);
    await this.save();

    return newEntry;
  }

  /**
   * Get audit log entries with optional filters
   */
  async getEntries(filters?: AuditLogFilters): Promise<AuditLogEntry[]> {
    await this.initialize();

    let filtered = [...this.entries];

    if (filters) {
      if (filters.action) {
        filtered = filtered.filter((e) => e.action === filters.action);
      }

      if (filters.actorId) {
        filtered = filtered.filter((e) => e.actorId === filters.actorId);
      }

      if (filters.targetId) {
        filtered = filtered.filter((e) => e.targetId === filters.targetId);
      }

      if (filters.startDate) {
        filtered = filtered.filter((e) => e.timestamp >= filters.startDate!);
      }

      if (filters.endDate) {
        filtered = filtered.filter((e) => e.timestamp <= filters.endDate!);
      }
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    if (filters?.offset !== undefined) {
      filtered = filtered.slice(filters.offset);
    }

    if (filters?.limit !== undefined) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  /**
   * Get a specific audit log entry by ID
   */
  async getEntry(id: string): Promise<AuditLogEntry | null> {
    await this.initialize();
    return this.entries.find((e) => e.id === id) || null;
  }

  /**
   * Get total count of entries (for pagination)
   */
  async getCount(filters?: AuditLogFilters): Promise<number> {
    const entries = await this.getEntries(filters);
    return entries.length;
  }
}
