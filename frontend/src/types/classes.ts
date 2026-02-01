/**
 * Client-side class/section types.
 *
 * Migrated from @/server/classes/types — pure type definitions.
 */

export interface Class {
  id: string;
  namespaceId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Section {
  id: string;
  namespaceId: string;
  classId: string;
  name: string;
  semester?: string;
  joinCode: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SectionMembership {
  id: string;
  userId: string;
  sectionId: string;
  role: 'instructor' | 'student';
  joinedAt: Date;
}

export interface SectionWithClass extends Section {
  class: {
    id: string;
    name: string;
    description?: string;
  };
}
