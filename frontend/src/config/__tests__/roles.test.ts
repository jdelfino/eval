/**
 * Tests for shared role utilities
 *
 * @jest-environment node
 */

import { ROLE_HIERARCHY, isValidRole } from '../roles';

describe('Role Utilities', () => {
  describe('ROLE_HIERARCHY', () => {
    it('defines all four roles', () => {
      expect(ROLE_HIERARCHY).toHaveProperty('student');
      expect(ROLE_HIERARCHY).toHaveProperty('instructor');
      expect(ROLE_HIERARCHY).toHaveProperty('namespace-admin');
      expect(ROLE_HIERARCHY).toHaveProperty('system-admin');
    });

    it('has ascending numeric values from student to system-admin', () => {
      expect(ROLE_HIERARCHY['student']).toBeLessThan(ROLE_HIERARCHY['instructor']);
      expect(ROLE_HIERARCHY['instructor']).toBeLessThan(ROLE_HIERARCHY['namespace-admin']);
      expect(ROLE_HIERARCHY['namespace-admin']).toBeLessThan(ROLE_HIERARCHY['system-admin']);
    });
  });

  describe('isValidRole', () => {
    it('returns true for valid roles', () => {
      expect(isValidRole('student')).toBe(true);
      expect(isValidRole('instructor')).toBe(true);
      expect(isValidRole('namespace-admin')).toBe(true);
      expect(isValidRole('system-admin')).toBe(true);
    });

    it('returns false for invalid roles', () => {
      expect(isValidRole('unknown')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole('admin')).toBe(false);
    });
  });
});
