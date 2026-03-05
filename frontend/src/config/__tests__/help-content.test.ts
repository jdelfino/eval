/**
 * Tests for help content configuration
 *
 * @jest-environment node
 */

import { getHelpTopicsForRole, HELP_TOPICS, HELP_INTRO } from '../help-content';

describe('Help Content Configuration', () => {
  describe('HELP_INTRO', () => {
    it('is a non-empty string', () => {
      expect(typeof HELP_INTRO).toBe('string');
      expect(HELP_INTRO.length).toBeGreaterThan(0);
    });
  });

  describe('HELP_TOPICS', () => {
    it('contains student guide', () => {
      const ids = HELP_TOPICS.map(t => t.id);
      expect(ids).toContain('student');
    });

    it('contains instructor guide', () => {
      const ids = HELP_TOPICS.map(t => t.id);
      expect(ids).toContain('instructor');
    });

    it('contains admin guide', () => {
      const ids = HELP_TOPICS.map(t => t.id);
      expect(ids).toContain('admin');
    });

    it('each topic has required fields', () => {
      HELP_TOPICS.forEach(topic => {
        expect(topic.id).toBeTruthy();
        expect(topic.title).toBeTruthy();
        expect(topic.content).toBeTruthy();
        expect(Array.isArray(topic.roles)).toBe(true);
        expect(topic.roles.length).toBeGreaterThan(0);
      });
    });

    it('has unique IDs', () => {
      const ids = HELP_TOPICS.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getHelpTopicsForRole', () => {
    describe('student role', () => {
      it('returns only the student guide', () => {
        const topics = getHelpTopicsForRole('student');
        expect(topics).toHaveLength(1);
        expect(topics[0].id).toBe('student');
      });

      it('does not include instructor or admin guides', () => {
        const topics = getHelpTopicsForRole('student');
        const ids = topics.map(t => t.id);
        expect(ids).not.toContain('instructor');
        expect(ids).not.toContain('admin');
      });
    });

    describe('instructor role', () => {
      it('returns student and instructor guides', () => {
        const topics = getHelpTopicsForRole('instructor');
        const ids = topics.map(t => t.id);
        expect(ids).toContain('student');
        expect(ids).toContain('instructor');
      });

      it('does not include admin guide', () => {
        const topics = getHelpTopicsForRole('instructor');
        const ids = topics.map(t => t.id);
        expect(ids).not.toContain('admin');
      });

      it('returns 2 topics', () => {
        const topics = getHelpTopicsForRole('instructor');
        expect(topics).toHaveLength(2);
      });
    });

    describe('namespace-admin role', () => {
      it('returns all guides', () => {
        const topics = getHelpTopicsForRole('namespace-admin');
        const ids = topics.map(t => t.id);
        expect(ids).toContain('student');
        expect(ids).toContain('instructor');
        expect(ids).toContain('admin');
      });

      it('returns 3 topics', () => {
        const topics = getHelpTopicsForRole('namespace-admin');
        expect(topics).toHaveLength(3);
      });
    });

    describe('system-admin role', () => {
      it('returns all guides', () => {
        const topics = getHelpTopicsForRole('system-admin');
        const ids = topics.map(t => t.id);
        expect(ids).toContain('student');
        expect(ids).toContain('instructor');
        expect(ids).toContain('admin');
      });

      it('returns 3 topics', () => {
        const topics = getHelpTopicsForRole('system-admin');
        expect(topics).toHaveLength(3);
      });
    });

    describe('invalid role', () => {
      it('returns empty array for unknown role', () => {
        const topics = getHelpTopicsForRole('unknown');
        expect(topics).toEqual([]);
      });

      it('returns empty array for empty string', () => {
        const topics = getHelpTopicsForRole('');
        expect(topics).toEqual([]);
      });
    });
  });
});
