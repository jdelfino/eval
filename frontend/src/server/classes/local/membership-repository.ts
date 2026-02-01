/**
 * Membership repository implementation with local file-based storage
 *
 * Manages user enrollments in sections with persistence to data/memberships.json
 * Handles duplicate detection and aggregate queries
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { IMembershipRepository } from '../interfaces';
import { SectionMembership, SectionWithClass, Section } from '../types';
import { User } from '../../auth/types';
import { isValidJoinCodeFormat } from '../join-code-service';

/**
 * Local file-based implementation of membership repository
 */
export class MembershipRepository implements IMembershipRepository {
  private dataDir: string;
  private filePath: string;
  private memberships: Map<string, SectionMembership> = new Map();
  private userSectionIndex: Map<string, Set<string>> = new Map(); // userId -> Set<membershipId>
  private sectionUserIndex: Map<string, Set<string>> = new Map(); // sectionId -> Set<membershipId>
  private initialized = false;
  private userRepository: any; // Will be injected
  private sectionRepository: any; // Will be injected
  private classRepository: any; // Will be injected

  constructor(dataDir: string = path.join(process.cwd(), 'data')) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'memberships.json');
  }

  /**
   * Set repositories for joined queries
   */
  setRepositories(userRepository: any, sectionRepository: any, classRepository: any): void {
    this.userRepository = userRepository;
    this.sectionRepository = sectionRepository;
    this.classRepository = classRepository;
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
   * Reload memberships from disk (for cross-process consistency)
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

      // Convert object to Map and build indexes
      this.memberships = new Map(Object.entries(parsed));
      this.rebuildIndexes();
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, start with empty map
        this.memberships = new Map();
        this.userSectionIndex = new Map();
        this.sectionUserIndex = new Map();
      } else {
        throw new Error(`Failed to load memberships: ${error.message}`);
      }
    }
  }

  /**
   * Rebuild indexes for fast lookups
   */
  private rebuildIndexes(): void {
    this.userSectionIndex.clear();
    this.sectionUserIndex.clear();

    for (const [id, membership] of Array.from(this.memberships.entries())) {
      // User -> memberships index
      if (!this.userSectionIndex.has(membership.userId)) {
        this.userSectionIndex.set(membership.userId, new Set());
      }
      this.userSectionIndex.get(membership.userId)!.add(id);

      // Section -> memberships index
      if (!this.sectionUserIndex.has(membership.sectionId)) {
        this.sectionUserIndex.set(membership.sectionId, new Set());
      }
      this.sectionUserIndex.get(membership.sectionId)!.add(id);
    }
  }

  /**
   * Save memberships to disk atomically with guaranteed flush
   */
  private async save(): Promise<void> {
    // Convert Map to object for JSON serialization
    const obj = Object.fromEntries(this.memberships);
    const json = JSON.stringify(obj, null, 2);

    // Atomic write: write to temp file, then rename
    const tempPath = `${this.filePath}.tmp`;

    // Open file, write, and fsync to ensure data reaches disk
    const fileHandle = await fs.open(tempPath, 'w');
    try {
      await fileHandle.writeFile(json, 'utf-8');
      await fileHandle.sync(); // Force flush to disk
    } finally {
      await fileHandle.close();
    }

    await fs.rename(tempPath, this.filePath);
  }

  /**
   * Add a membership (enroll a user in a section)
   */
  async addMembership(membershipData: Omit<SectionMembership, 'id' | 'joinedAt'>): Promise<SectionMembership> {
    await this.initialize();

    // Check for duplicate membership
    const existing = await this.getMembership(membershipData.userId, membershipData.sectionId);
    if (existing) {
      throw new Error('User is already a member of this section');
    }

    const now = new Date();
    const newMembership: SectionMembership = {
      id: `membership-${uuidv4()}`,
      ...membershipData,
      joinedAt: now,
    };

    this.memberships.set(newMembership.id, newMembership);

    // Update indexes
    if (!this.userSectionIndex.has(newMembership.userId)) {
      this.userSectionIndex.set(newMembership.userId, new Set());
    }
    this.userSectionIndex.get(newMembership.userId)!.add(newMembership.id);

    if (!this.sectionUserIndex.has(newMembership.sectionId)) {
      this.sectionUserIndex.set(newMembership.sectionId, new Set());
    }
    this.sectionUserIndex.get(newMembership.sectionId)!.add(newMembership.id);

    await this.save();

    return newMembership;
  }

  /**
   * Remove a membership (unenroll a user from a section)
   */
  async removeMembership(userId: string, sectionId: string): Promise<void> {
    await this.initialize();

    const membership = await this.getMembership(userId, sectionId);
    if (!membership) {
      throw new Error('Membership not found');
    }

    // Remove from maps
    this.memberships.delete(membership.id);

    // Update indexes
    this.userSectionIndex.get(userId)?.delete(membership.id);
    this.sectionUserIndex.get(sectionId)?.delete(membership.id);

    await this.save();
  }

  /**
   * Get all sections for a user, optionally filtered by role and namespace
   */
  async getUserSections(userId: string, namespaceId?: string, role?: 'instructor' | 'student'): Promise<SectionWithClass[]> {
    await this.initialize();
    // Reload from disk to get latest data from other processes
    await this.reloadFromDisk();

    if (!this.sectionRepository || !this.classRepository) {
      throw new Error('Repositories not configured');
    }

    // Get membership IDs for this user
    const membershipIds = this.userSectionIndex.get(userId) || new Set();

    // Get memberships and filter by role if specified
    let memberships = Array.from(membershipIds)
      .map(id => this.memberships.get(id))
      .filter((m): m is SectionMembership => m !== undefined);

    if (role) {
      memberships = memberships.filter(m => m.role === role);
    }

    // Get section and class details
    const sectionsWithClass: SectionWithClass[] = [];

    for (const membership of memberships) {
      const section = await this.sectionRepository.getSection(membership.sectionId);
      if (!section) continue;

      // Filter by namespace if provided
      if (namespaceId && section.namespaceId !== namespaceId) {
        continue;
      }

      const classInfo = await this.classRepository.getClass(section.classId);
      if (!classInfo) continue;

      sectionsWithClass.push({
        ...section,
        class: {
          id: classInfo.id,
          name: classInfo.name,
          description: classInfo.description,
        },
      });
    }

    // Sort by joined date (most recent first)
    sectionsWithClass.sort((a, b) => {
      const membershipA = memberships.find(m => m.sectionId === a.id);
      const membershipB = memberships.find(m => m.sectionId === b.id);
      return (membershipB?.joinedAt.getTime() || 0) - (membershipA?.joinedAt.getTime() || 0);
    });

    return sectionsWithClass;
  }

  /**
   * Get all members (users) in a section, optionally filtered by role
   */
  async getSectionMembers(sectionId: string, role?: 'instructor' | 'student'): Promise<User[]> {
    await this.initialize();
    // Reload from disk to get latest data from other processes
    await this.reloadFromDisk();

    if (!this.userRepository) {
      throw new Error('User repository not configured');
    }

    // Get membership IDs for this section
    const membershipIds = this.sectionUserIndex.get(sectionId) || new Set();

    // Get memberships and filter by role if specified
    let memberships = Array.from(membershipIds)
      .map(id => this.memberships.get(id))
      .filter((m): m is SectionMembership => m !== undefined);

    if (role) {
      memberships = memberships.filter(m => m.role === role);
    }

    // Get user details
    const users: User[] = [];

    for (const membership of memberships) {
      const user = await this.userRepository.getUser(membership.userId);
      if (user) {
        users.push(user);
      }
    }

    // Sort by email
    users.sort((a, b) => a.email.localeCompare(b.email));

    return users;
  }

  /**
   * Check if a user is a member of a section
   */
  async isMember(userId: string, sectionId: string): Promise<boolean> {
    await this.initialize();

    const membership = await this.getMembership(userId, sectionId);
    return membership !== null;
  }

  /**
   * Get a specific membership
   */
  async getMembership(userId: string, sectionId: string): Promise<SectionMembership | null> {
    await this.initialize();
    // Reload from disk to get latest data from other processes
    await this.reloadFromDisk();

    // Use index to find membership IDs for this user
    const membershipIds = this.userSectionIndex.get(userId) || new Set();

    // Find membership for this specific section
    for (const id of Array.from(membershipIds)) {
      const membership = this.memberships.get(id);
      if (membership && membership.sectionId === sectionId) {
        return membership;
      }
    }

    return null;
  }

  /**
   * Clear all memberships (for testing/admin purposes)
   */
  async clear(): Promise<void> {
    await this.initialize();
    this.memberships.clear();
    this.userSectionIndex.clear();
    this.sectionUserIndex.clear();
    await this.save();
  }

  /**
   * Validate a join code and return the section
   *
   * @param code - The join code to validate
   * @returns The section if code is valid and active, null otherwise
   */
  async validateJoinCode(code: string): Promise<Section | null> {
    if (!isValidJoinCodeFormat(code)) {
      return null;
    }

    // Normalize the code (uppercase, trim whitespace)
    const normalizedCode = code.trim().toUpperCase();

    if (!this.sectionRepository) {
      throw new Error('Section repository not set');
    }

    const section = await this.sectionRepository.getSectionByJoinCode(normalizedCode);

    // Return section only if it exists and is active
    if (section && section.active) {
      return section;
    }

    return null;
  }

  /**
   * Join a section using a join code
   *
   * Creates a membership with role 'student'. If the user is already
   * a member, returns the existing membership (idempotent).
   *
   * @param userId - The user ID attempting to join
   * @param joinCode - The join code for the section
   * @returns The created or existing membership
   * @throws Error if join code is invalid
   */
  async joinSection(userId: string, joinCode: string): Promise<SectionMembership> {
    // Validate the join code
    const section = await this.validateJoinCode(joinCode);

    if (!section) {
      throw new Error('Invalid or inactive join code');
    }

    // Check if user is already a member
    const existingMembership = await this.getMembership(userId, section.id);

    if (existingMembership) {
      // Idempotent - return existing membership
      return existingMembership;
    }

    // Create new membership with student role
    const membership = await this.addMembership({
      userId,
      sectionId: section.id,
      role: 'student',
    });

    return membership;
  }
}
