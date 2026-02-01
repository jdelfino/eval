/**
 * Section repository implementation with local file-based storage
 *
 * Manages CRUD operations for sections with persistence to data/sections.json
 * Handles join code generation and collision detection
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ISectionRepository } from '../interfaces';
import { Section, SectionFilters, SectionStats } from '../types';
import { generateJoinCode, normalizeJoinCode } from '../join-code-service';

/**
 * Local file-based implementation of section repository
 */
export class SectionRepository implements ISectionRepository {
  private dataDir: string;
  private filePath: string;
  private sections: Map<string, Section> = new Map();
  private joinCodeIndex: Map<string, string> = new Map(); // joinCode -> sectionId
  private initialized = false;
  private membershipRepository: any; // Will be injected

  constructor(dataDir: string = path.join(process.cwd(), 'data')) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'sections.json');
  }

  /**
   * Set the membership repository for stats queries
   */
  setMembershipRepository(membershipRepository: any): void {
    this.membershipRepository = membershipRepository;
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
   * Reload sections from disk (for cross-process consistency)
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

      // Convert object to Map and build join code index
      this.sections = new Map(Object.entries(parsed));
      this.joinCodeIndex.clear();
      for (const [id, section] of Array.from(this.sections.entries())) {
        this.joinCodeIndex.set(section.joinCode, id);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, start with empty map
        this.sections = new Map();
        this.joinCodeIndex = new Map();
      } else {
        throw new Error(`Failed to load sections: ${error.message}`);
      }
    }
  }

  /**
   * Save sections to disk atomically
   */
  private async save(): Promise<void> {
    // Convert Map to object for JSON serialization
    const obj = Object.fromEntries(this.sections);
    const json = JSON.stringify(obj, null, 2);

    // Atomic write: write to temp file, then rename
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, json, 'utf-8');
    await fs.rename(tempPath, this.filePath);
  }

  /**
   * Generate a unique join code (check for collisions)
   */
  private async generateUniqueJoinCode(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const code = generateJoinCode();

      // Check if code is already in use
      if (!this.joinCodeIndex.has(code)) {
        return code;
      }

      attempts++;
    }

    throw new Error('Failed to generate unique join code after multiple attempts');
  }

  /**
   * Create a new section with auto-generated join code
   */
  async createSection(sectionData: Omit<Section, 'id' | 'joinCode' | 'createdAt' | 'updatedAt'>): Promise<Section> {
    await this.initialize();

    const now = new Date();
    const joinCode = await this.generateUniqueJoinCode();

    const newSection: Section = {
      id: `section-${uuidv4()}`,
      ...sectionData,
      joinCode,
      createdAt: now,
      updatedAt: now,
    };

    this.sections.set(newSection.id, newSection);
    this.joinCodeIndex.set(joinCode, newSection.id);
    await this.save();

    return newSection;
  }

  /**
   * Get a section by ID
   */
  async getSection(sectionId: string, namespaceId?: string): Promise<Section | null> {
    await this.initialize();
    // Reload from disk to get latest data from other processes (e.g., API routes)
    await this.reloadFromDisk();
    const section = this.sections.get(sectionId);

    // If namespaceId is provided, filter by it
    if (section && namespaceId && section.namespaceId !== namespaceId) {
      return null;
    }

    return section || null;
  }

  /**
   * Get a section by join code
   * Normalizes the input code to handle codes with or without dashes
   */
  async getSectionByJoinCode(joinCode: string): Promise<Section | null> {
    await this.initialize();
    // Reload from disk to get latest data from other processes
    await this.reloadFromDisk();

    // Normalize the input code to match stored format
    const normalizedCode = normalizeJoinCode(joinCode);
    if (!normalizedCode) {
      return null;
    }

    const sectionId = this.joinCodeIndex.get(normalizedCode);
    if (!sectionId) {
      return null;
    }

    return this.sections.get(sectionId) || null;
  }

  /**
   * Update a section
   */
  async updateSection(sectionId: string, updates: Partial<Omit<Section, 'id' | 'createdAt'>>): Promise<void> {
    await this.initialize();

    const existingSection = this.sections.get(sectionId);
    if (!existingSection) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    // If join code is being updated, update the index
    if (updates.joinCode && updates.joinCode !== existingSection.joinCode) {
      // Check if new code is already in use
      if (this.joinCodeIndex.has(updates.joinCode)) {
        throw new Error(`Join code already in use: ${updates.joinCode}`);
      }

      // Remove old code from index
      this.joinCodeIndex.delete(existingSection.joinCode);
      // Add new code to index
      this.joinCodeIndex.set(updates.joinCode, sectionId);
    }

    const updatedSection: Section = {
      ...existingSection,
      ...updates,
      id: existingSection.id, // Preserve ID
      createdAt: existingSection.createdAt, // Preserve creation date
      updatedAt: new Date(),
    };

    this.sections.set(sectionId, updatedSection);
    await this.save();
  }

  /**
   * Delete a section
   */
  async deleteSection(sectionId: string): Promise<void> {
    await this.initialize();

    const section = this.sections.get(sectionId);
    if (!section) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    // Remove from join code index
    this.joinCodeIndex.delete(section.joinCode);

    // Remove section
    this.sections.delete(sectionId);
    await this.save();
  }

  /**
   * List sections with optional filtering
   */
  async listSections(filters?: SectionFilters, namespaceId?: string): Promise<Section[]> {
    await this.initialize();
    // Reload from disk to get latest data from other processes
    await this.reloadFromDisk();

    let sections = Array.from(this.sections.values());

    // Apply namespace filter first
    if (namespaceId) {
      sections = sections.filter(s => s.namespaceId === namespaceId);
    }

    if (filters) {
      if (filters.classId) {
        sections = sections.filter(s => s.classId === filters.classId);
      }

      if (filters.instructorId) {
        // Filter by instructor via memberships
        if (!this.membershipRepository) {
          throw new Error('Membership repository not configured for instructor filter');
        }
        const instructorSections = await this.membershipRepository.getUserSections(
          filters.instructorId,
          undefined,
          'instructor'
        );
        const instructorSectionIds = new Set(instructorSections.map((s: Section) => s.id));
        sections = sections.filter(s => instructorSectionIds.has(s.id));
      }

      if (filters.active !== undefined) {
        sections = sections.filter(s => s.active === filters.active);
      }
    }

    // Sort by creation date (newest first)
    sections.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return sections;
  }

  /**
   * Regenerate the join code for a section
   */
  async regenerateJoinCode(sectionId: string): Promise<string> {
    await this.initialize();

    const section = this.sections.get(sectionId);
    if (!section) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    // Generate new unique code
    const newJoinCode = await this.generateUniqueJoinCode();

    // Remove old code from index
    this.joinCodeIndex.delete(section.joinCode);

    // Update section with new code
    section.joinCode = newJoinCode;
    section.updatedAt = new Date();

    // Add new code to index
    this.joinCodeIndex.set(newJoinCode, sectionId);

    await this.save();

    return newJoinCode;
  }

  /**
   * Get statistics for a section
   */
  async getSectionStats(sectionId: string): Promise<SectionStats> {
    await this.initialize();

    const section = this.sections.get(sectionId);
    if (!section) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    if (!this.membershipRepository) {
      throw new Error('Membership repository not configured');
    }

    // Count students in section
    const students = await this.membershipRepository.getSectionMembers(sectionId, 'student');

    // TODO: Query session counts when session repository is available
    // For now, return placeholder values
    return {
      studentCount: students.length,
      sessionCount: 0,
      activeSessionCount: 0,
    };
  }

  /**
   * Clear all sections (for testing/admin purposes)
   */
  async clear(): Promise<void> {
    await this.initialize();
    this.sections.clear();
    this.joinCodeIndex.clear();
    await this.save();
  }
}
