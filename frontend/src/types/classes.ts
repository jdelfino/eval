/**
 * Client-side class/section types.
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */

export interface Class {
  id: string;
  namespace_id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface Section {
  id: string;
  namespace_id: string;
  class_id: string;
  name: string;
  semester?: string;
  join_code: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SectionMembership {
  id: string;
  user_id: string;
  section_id: string;
  role: 'instructor' | 'student';
  joined_at: Date;
}

export interface SectionWithClass extends Section {
  class: {
    id: string;
    name: string;
    description?: string;
  };
}
