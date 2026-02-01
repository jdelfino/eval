/**
 * Fake repository implementations for classes/sections testing
 *
 * Provides in-memory implementations that don't rely on file I/O
 */

import { IClassRepository, ISectionRepository, IMembershipRepository } from '../../classes/interfaces';
import { Class, Section, SectionMembership, SectionWithClass, SectionFilters, SectionStats } from '../../classes/types';
import { User } from '../../auth/types';
import { v4 as uuidv4 } from 'uuid';
import { generateJoinCode } from '../../classes/join-code-service';

/**
 * Fake class repository - in-memory storage
 */
export class FakeClassRepository implements IClassRepository {
  private classes: Map<string, Class> = new Map();
  private sectionRepository?: ISectionRepository;

  setSectionRepository(sectionRepository: ISectionRepository): void {
    this.sectionRepository = sectionRepository;
  }

  async createClass(classData: Omit<Class, 'id' | 'createdAt' | 'updatedAt'>): Promise<Class> {
    const now = new Date();
    const newClass: Class = {
      id: `class-${uuidv4()}`,
      ...classData,
      createdAt: now,
      updatedAt: now,
    };

    this.classes.set(newClass.id, newClass);
    return newClass;
  }

  async getClass(classId: string): Promise<Class | null> {
    return this.classes.get(classId) || null;
  }

  async updateClass(classId: string, updates: Partial<Omit<Class, 'id' | 'createdAt'>>): Promise<void> {
    const existingClass = this.classes.get(classId);
    if (!existingClass) {
      throw new Error(`Class not found: ${classId}`);
    }

    const updatedClass: Class = {
      ...existingClass,
      ...updates,
      id: existingClass.id,
      createdAt: existingClass.createdAt,
      updatedAt: new Date(),
    };

    this.classes.set(classId, updatedClass);
  }

  async deleteClass(classId: string): Promise<void> {
    if (!this.classes.has(classId)) {
      throw new Error(`Class not found: ${classId}`);
    }
    this.classes.delete(classId);
  }

  async listClasses(createdBy?: string, namespaceId?: string): Promise<Class[]> {
    let classes = Array.from(this.classes.values());

    // Apply namespace filter first
    if (namespaceId) {
      classes = classes.filter(c => c.namespaceId === namespaceId);
    }

    if (createdBy) {
      classes = classes.filter(c => c.createdBy === createdBy);
    }

    classes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return classes;
  }

  async getClassSections(classId: string): Promise<Section[]> {
    if (!this.classes.has(classId)) {
      throw new Error(`Class not found: ${classId}`);
    }

    if (!this.sectionRepository) {
      throw new Error('Section repository not configured');
    }

    return await this.sectionRepository.listSections({ classId });
  }

  // Helper for testing
  clear() {
    this.classes.clear();
  }
}

/**
 * Fake section repository - in-memory storage
 */
export class FakeSectionRepository implements ISectionRepository {
  private sections: Map<string, Section> = new Map();
  private joinCodeIndex: Map<string, string> = new Map();
  private membershipRepository?: IMembershipRepository;

  setMembershipRepository(membershipRepository: IMembershipRepository): void {
    this.membershipRepository = membershipRepository;
  }

  private async generateUniqueJoinCode(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const code = generateJoinCode();
      if (!this.joinCodeIndex.has(code)) {
        return code;
      }
      attempts++;
    }

    throw new Error('Failed to generate unique join code after multiple attempts');
  }

  async createSection(sectionData: Omit<Section, 'id' | 'joinCode' | 'createdAt' | 'updatedAt'>): Promise<Section> {
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
    return newSection;
  }

  async getSection(sectionId: string, namespaceId?: string): Promise<Section | null> {
    const section = this.sections.get(sectionId);
    if (!section) return null;

    // If namespaceId is provided, verify it matches
    if (namespaceId && section.namespaceId !== namespaceId) {
      return null;
    }

    return section;
  }

  async getSectionByJoinCode(joinCode: string): Promise<Section | null> {
    const sectionId = this.joinCodeIndex.get(joinCode);
    if (!sectionId) return null;
    return this.sections.get(sectionId) || null;
  }

  async updateSection(sectionId: string, updates: Partial<Omit<Section, 'id' | 'createdAt'>>): Promise<void> {
    const existingSection = this.sections.get(sectionId);
    if (!existingSection) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    if (updates.joinCode && updates.joinCode !== existingSection.joinCode) {
      if (this.joinCodeIndex.has(updates.joinCode)) {
        throw new Error(`Join code already in use: ${updates.joinCode}`);
      }
      this.joinCodeIndex.delete(existingSection.joinCode);
      this.joinCodeIndex.set(updates.joinCode, sectionId);
    }

    const updatedSection: Section = {
      ...existingSection,
      ...updates,
      id: existingSection.id,
      createdAt: existingSection.createdAt,
      updatedAt: new Date(),
    };

    this.sections.set(sectionId, updatedSection);
  }

  async deleteSection(sectionId: string): Promise<void> {
    const section = this.sections.get(sectionId);
    if (!section) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    this.joinCodeIndex.delete(section.joinCode);
    this.sections.delete(sectionId);
  }

  async listSections(filters?: SectionFilters, namespaceId?: string): Promise<Section[]> {
    let sections = Array.from(this.sections.values());

    // Apply namespace filter first
    if (namespaceId) {
      sections = sections.filter(s => s.namespaceId === namespaceId);
    }

    if (filters?.classId) {
      sections = sections.filter(s => s.classId === filters.classId);
    }

    if (filters?.instructorId) {
      // Filter by instructor via memberships (requires membership repository to be set up)
      // For now, skip this filter in the fake implementation - tests should use memberships directly
      console.warn('FakeSectionRepository: instructorId filter requires membership lookup');
    }

    if (filters?.active !== undefined) {
      sections = sections.filter(s => s.active === filters.active);
    }

    return sections;
  }

  async regenerateJoinCode(sectionId: string): Promise<string> {
    const section = this.sections.get(sectionId);
    if (!section) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    const newJoinCode = await this.generateUniqueJoinCode();
    this.joinCodeIndex.delete(section.joinCode);
    this.joinCodeIndex.set(newJoinCode, sectionId);

    section.joinCode = newJoinCode;
    section.updatedAt = new Date();

    return newJoinCode;
  }

  // NOTE: addInstructor and removeInstructor methods have been removed
  // Instructor management is now done through section_memberships
  // Tests should use FakeMembershipRepository.addMembership/removeMembership instead

  async getSectionStats(sectionId: string): Promise<SectionStats> {
    const section = this.sections.get(sectionId);
    if (!section) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    if (!this.membershipRepository) {
      return {
        studentCount: 0,
        sessionCount: 0,
        activeSessionCount: 0,
      };
    }

    const students = await this.membershipRepository.getSectionMembers(sectionId, 'student');

    return {
      studentCount: students.length,
      sessionCount: 0,
      activeSessionCount: 0,
    };
  }

  // Helper for testing
  clear() {
    this.sections.clear();
    this.joinCodeIndex.clear();
  }
}

/**
 * Fake membership repository - in-memory storage
 */
export class FakeMembershipRepository implements IMembershipRepository {
  private memberships: Map<string, SectionMembership> = new Map();
  private userSectionIndex: Map<string, Set<string>> = new Map();
  private sectionUserIndex: Map<string, Set<string>> = new Map();
  private userRepository?: any;
  private sectionRepository?: ISectionRepository;
  private classRepository?: IClassRepository;

  setRepositories(userRepository: any, sectionRepository: ISectionRepository, classRepository: IClassRepository): void {
    this.userRepository = userRepository;
    this.sectionRepository = sectionRepository;
    this.classRepository = classRepository;
  }

  async addMembership(membershipData: Omit<SectionMembership, 'id' | 'joinedAt'>): Promise<SectionMembership> {
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

    if (!this.userSectionIndex.has(newMembership.userId)) {
      this.userSectionIndex.set(newMembership.userId, new Set());
    }
    this.userSectionIndex.get(newMembership.userId)!.add(newMembership.id);

    if (!this.sectionUserIndex.has(newMembership.sectionId)) {
      this.sectionUserIndex.set(newMembership.sectionId, new Set());
    }
    this.sectionUserIndex.get(newMembership.sectionId)!.add(newMembership.id);

    return newMembership;
  }

  async removeMembership(userId: string, sectionId: string): Promise<void> {
    const membership = await this.getMembership(userId, sectionId);
    if (!membership) {
      throw new Error('Membership not found');
    }

    this.memberships.delete(membership.id);
    this.userSectionIndex.get(userId)?.delete(membership.id);
    this.sectionUserIndex.get(sectionId)?.delete(membership.id);
  }

  async getUserSections(userId: string, role?: 'instructor' | 'student'): Promise<SectionWithClass[]> {
    if (!this.sectionRepository || !this.classRepository) {
      throw new Error('Repositories not configured');
    }

    const membershipIds = this.userSectionIndex.get(userId) || new Set();
    let memberships = Array.from(membershipIds)
      .map(id => this.memberships.get(id))
      .filter((m): m is SectionMembership => m !== undefined);

    if (role) {
      memberships = memberships.filter(m => m.role === role);
    }

    const sectionsWithClass: SectionWithClass[] = [];

    for (const membership of memberships) {
      const section = await this.sectionRepository.getSection(membership.sectionId);
      if (!section) continue;

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

    sectionsWithClass.sort((a, b) => {
      const membershipA = memberships.find(m => m.sectionId === a.id);
      const membershipB = memberships.find(m => m.sectionId === b.id);
      return (membershipB?.joinedAt.getTime() || 0) - (membershipA?.joinedAt.getTime() || 0);
    });

    return sectionsWithClass;
  }

  async getSectionMembers(sectionId: string, role?: 'instructor' | 'student'): Promise<User[]> {
    if (!this.userRepository) {
      throw new Error('User repository not configured');
    }

    const membershipIds = this.sectionUserIndex.get(sectionId) || new Set();
    let memberships = Array.from(membershipIds)
      .map(id => this.memberships.get(id))
      .filter((m): m is SectionMembership => m !== undefined);

    if (role) {
      memberships = memberships.filter(m => m.role === role);
    }

    const users: User[] = [];

    for (const membership of memberships) {
      const user = await this.userRepository.getUserById(membership.userId);
      if (user) {
        users.push(user);
      }
    }

    users.sort((a, b) => a.email.localeCompare(b.email));
    return users;
  }

  async isMember(userId: string, sectionId: string): Promise<boolean> {
    const membership = await this.getMembership(userId, sectionId);
    return membership !== null;
  }

  async getMembership(userId: string, sectionId: string): Promise<SectionMembership | null> {
    const membershipIds = this.userSectionIndex.get(userId) || new Set();

    for (const id of Array.from(membershipIds)) {
      const membership = this.memberships.get(id);
      if (membership && membership.sectionId === sectionId) {
        return membership;
      }
    }

    return null;
  }

  async validateJoinCode(code: string): Promise<Section | null> {
    const { isValidJoinCodeFormat } = require('../../classes/join-code-service');

    if (!isValidJoinCodeFormat(code)) {
      return null;
    }

    const normalizedCode = code.trim().toUpperCase();

    if (!this.sectionRepository) {
      throw new Error('Section repository not set');
    }

    const section = await this.sectionRepository.getSectionByJoinCode(normalizedCode);

    if (section && section.active) {
      return section;
    }

    return null;
  }

  async joinSection(userId: string, joinCode: string): Promise<SectionMembership> {
    const section = await this.validateJoinCode(joinCode);

    if (!section) {
      throw new Error('Invalid or inactive join code');
    }

    const existingMembership = await this.getMembership(userId, section.id);

    if (existingMembership) {
      return existingMembership;
    }

    const membership = await this.addMembership({
      userId,
      sectionId: section.id,
      role: 'student',
    });

    return membership;
  }

  // Helper for testing
  clear() {
    this.memberships.clear();
    this.userSectionIndex.clear();
    this.sectionUserIndex.clear();
  }
}
