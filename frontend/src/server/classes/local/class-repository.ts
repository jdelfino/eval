/**
 * Class repository implementation with local file-based storage
 *
 * Manages CRUD operations for course classes with persistence to data/classes.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IClassRepository } from '../interfaces';
import { Class, Section } from '../types';

/**
 * Local file-based implementation of class repository
 */
export class ClassRepository implements IClassRepository {
  private dataDir: string;
  private filePath: string;
  private classes: Map<string, Class> = new Map();
  private initialized = false;
  private sectionRepository: any; // Will be injected after construction

  constructor(dataDir: string = path.join(process.cwd(), 'data')) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'classes.json');
  }

  /**
   * Set the section repository for querying sections
   */
  setSectionRepository(sectionRepository: any): void {
    this.sectionRepository = sectionRepository;
  }

  /**
   * Initialize the repository by loading data from disk
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Ensure data directory exists
    await fs.mkdir(this.dataDir, { recursive: true });

    // Load initial data
    await this.reloadFromDisk();

    this.initialized = true;
  }

  /**
   * Reload classes from disk (for cross-process consistency)
   * This ensures that changes made in other processes (e.g., API routes) are visible
   */
  private async reloadFromDisk(): Promise<void> {
    // Load existing data if file exists
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data, (key, value) => {
        // Revive Date objects
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
          return new Date(value);
        }
        return value;
      });

      // Convert object to Map
      this.classes = new Map(Object.entries(parsed));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, start with empty map
        this.classes = new Map();
      } else {
        throw new Error(`Failed to load classes: ${error.message}`);
      }
    }
  }

  /**
   * Save classes to disk atomically
   */
  private async save(): Promise<void> {
    // Convert Map to object for JSON serialization
    const obj = Object.fromEntries(this.classes);
    const json = JSON.stringify(obj, null, 2);

    // Atomic write: write to temp file, then rename
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, json, 'utf-8');
    await fs.rename(tempPath, this.filePath);
  }

  /**
   * Create a new class
   */
  async createClass(classData: Omit<Class, 'id' | 'createdAt' | 'updatedAt'>): Promise<Class> {
    await this.initialize();

    const now = new Date();
    const newClass: Class = {
      id: `class-${uuidv4()}`,
      ...classData,
      createdAt: now,
      updatedAt: now,
    };

    this.classes.set(newClass.id, newClass);
    await this.save();

    return newClass;
  }

  /**
   * Get a class by ID
   */
  async getClass(classId: string, namespaceId?: string): Promise<Class | null> {
    await this.initialize();
    // Reload from disk to get latest data from other processes
    await this.reloadFromDisk();
    const cls = this.classes.get(classId);

    // If namespaceId is provided, filter by it
    if (cls && namespaceId && cls.namespaceId !== namespaceId) {
      return null;
    }

    return cls || null;
  }

  /**
   * Update a class
   */
  async updateClass(classId: string, updates: Partial<Omit<Class, 'id' | 'createdAt'>>): Promise<void> {
    await this.initialize();

    const existingClass = this.classes.get(classId);
    if (!existingClass) {
      throw new Error(`Class not found: ${classId}`);
    }

    const updatedClass: Class = {
      ...existingClass,
      ...updates,
      id: existingClass.id, // Preserve ID
      createdAt: existingClass.createdAt, // Preserve creation date
      updatedAt: new Date(),
    };

    this.classes.set(classId, updatedClass);
    await this.save();
  }

  /**
   * Delete a class
   *
   * Note: Callers should check for existing sections before deleting
   */
  async deleteClass(classId: string): Promise<void> {
    await this.initialize();

    if (!this.classes.has(classId)) {
      throw new Error(`Class not found: ${classId}`);
    }

    this.classes.delete(classId);
    await this.save();
  }

  /**
   * List classes, optionally filtered by creator
   */
  async listClasses(createdBy?: string, namespaceId?: string): Promise<Class[]> {
    await this.initialize();
    // Reload from disk to get latest data from other processes
    await this.reloadFromDisk();

    let classes = Array.from(this.classes.values());

    // Apply namespace filter
    if (namespaceId) {
      classes = classes.filter(c => c.namespaceId === namespaceId);
    }

    if (createdBy) {
      classes = classes.filter(c => c.createdBy === createdBy);
    }

    // Sort by creation date (newest first)
    classes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return classes;
  }

  /**
   * Get all sections for a class
   */
  async getClassSections(classId: string, namespaceId?: string): Promise<Section[]> {
    await this.initialize();

    // Verify class exists
    if (!this.classes.has(classId)) {
      throw new Error(`Class not found: ${classId}`);
    }

    // Query section repository
    if (!this.sectionRepository) {
      throw new Error('Section repository not configured');
    }

    const filters: any = { classId };
    if (namespaceId) {
      filters.namespaceId = namespaceId;
    }

    return await this.sectionRepository.listSections(filters);
  }

  /**
   * Clear all classes (for testing/admin purposes)
   */
  async clear(): Promise<void> {
    await this.initialize();
    this.classes.clear();
    await this.save();
  }
}
