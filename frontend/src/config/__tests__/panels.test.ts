/**
 * Tests for panel configuration
 *
 * @jest-environment node
 */

import { SESSION_PANELS, getPanelsForPage } from '../panels';

describe('Panel Configuration', () => {
  describe('SESSION_PANELS', () => {
    it('contains problem-setup panel', () => {
      const panel = SESSION_PANELS.find(p => p.id === 'problem-setup');
      expect(panel).toBeDefined();
      expect(panel?.label).toBe('Problem Setup');
      expect(panel?.defaultState).toBe('expanded');
    });

    it('contains ai-walkthrough panel', () => {
      const panel = SESSION_PANELS.find(p => p.id === 'ai-walkthrough');
      expect(panel).toBeDefined();
      expect(panel?.label).toBe('AI Walkthrough');
      expect(panel?.defaultState).toBe('expanded');
    });

    it('has unique IDs for all panels', () => {
      const ids = SESSION_PANELS.map(p => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('has icon defined for all panels', () => {
      SESSION_PANELS.forEach(panel => {
        expect(panel.icon).toBeDefined();
        expect(panel.icon.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getPanelsForPage', () => {
    it('returns SESSION_PANELS for session page', () => {
      const panels = getPanelsForPage('session');
      expect(panels).toBe(SESSION_PANELS);
      expect(panels.length).toBe(2);
    });

    it('returns empty array for unknown page', () => {
      const panels = getPanelsForPage('unknown-page');
      expect(panels).toEqual([]);
    });

    it('returns empty array for empty page id', () => {
      const panels = getPanelsForPage('');
      expect(panels).toEqual([]);
    });

    it('returns empty array for instructor page', () => {
      const panels = getPanelsForPage('instructor');
      expect(panels).toEqual([]);
    });

    it('returns empty array for classes page', () => {
      const panels = getPanelsForPage('classes');
      expect(panels).toEqual([]);
    });
  });
});
