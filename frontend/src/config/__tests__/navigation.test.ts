/**
 * Tests for navigation configuration
 *
 * @jest-environment node
 */

import {
  NavGroup,
  NAV_ITEMS,
  BREADCRUMB_HIERARCHY,
  getNavItemsForRole,
  getNavGroupsForRole,
} from '../navigation';

describe('Navigation Configuration', () => {
  describe('NAV_ITEMS', () => {
    it('contains all expected navigation items', () => {
      const itemIds = NAV_ITEMS.map(item => item.id);
      expect(itemIds).toContain('my-sections');
      expect(itemIds).toContain('dashboard');
      expect(itemIds).toContain('classes');
      expect(itemIds).toContain('problems');
      expect(itemIds).toContain('user-management');
      expect(itemIds).toContain('namespaces');
      // Note: 'sessions' removed - sessions are now managed from the dashboard
    });

    it('has unique IDs for all items', () => {
      const ids = NAV_ITEMS.map(item => item.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('has valid groups for all items', () => {
      const validGroups = Object.values(NavGroup);
      NAV_ITEMS.forEach(item => {
        expect(validGroups).toContain(item.group);
      });
    });

    it('has non-empty roles array for all items', () => {
      NAV_ITEMS.forEach(item => {
        expect(item.roles.length).toBeGreaterThan(0);
      });
    });
  });

  describe('BREADCRUMB_HIERARCHY', () => {
    it('contains expected routes', () => {
      const routes = Object.keys(BREADCRUMB_HIERARCHY);
      expect(routes).toContain('/classes');
      expect(routes).toContain('/classes/[id]');
      expect(routes).toContain('/sections');
      expect(routes).toContain('/sections/[sectionId]');
      expect(routes).toContain('/instructor');
    });

    it('has correct parent references', () => {
      expect(BREADCRUMB_HIERARCHY['/classes']).toBeNull();
      expect(BREADCRUMB_HIERARCHY['/classes/[id]']).toBe('/classes');
      expect(BREADCRUMB_HIERARCHY['/sections']).toBeNull();
      expect(BREADCRUMB_HIERARCHY['/sections/[sectionId]']).toBe('/sections');
    });
  });

  describe('getNavItemsForRole', () => {
    describe('student role', () => {
      it('returns only student-accessible items', () => {
        const items = getNavItemsForRole('student');
        expect(items).toHaveLength(1);
        expect(items[0].id).toBe('my-sections');
      });

      it('does not include instructor items', () => {
        const items = getNavItemsForRole('student');
        const ids = items.map(i => i.id);
        expect(ids).not.toContain('dashboard');
        expect(ids).not.toContain('classes');
      });
    });

    describe('instructor role', () => {
      it('returns teaching items', () => {
        const items = getNavItemsForRole('instructor');
        const ids = items.map(i => i.id);
        expect(ids).toContain('dashboard');
        expect(ids).toContain('classes');
        expect(ids).toContain('problems');
        // Note: 'sessions' removed - sessions are now managed from the dashboard
      });

      it('does not include admin or system items', () => {
        const items = getNavItemsForRole('instructor');
        const ids = items.map(i => i.id);
        expect(ids).not.toContain('user-management');
        expect(ids).not.toContain('namespaces');
      });

      it('does not include student-only items', () => {
        const items = getNavItemsForRole('instructor');
        const ids = items.map(i => i.id);
        expect(ids).not.toContain('my-sections');
      });
    });

    describe('namespace-admin role', () => {
      it('returns teaching and admin items', () => {
        const items = getNavItemsForRole('namespace-admin');
        const ids = items.map(i => i.id);
        expect(ids).toContain('dashboard');
        expect(ids).toContain('classes');
        expect(ids).toContain('user-management');
      });

      it('does not include system items', () => {
        const items = getNavItemsForRole('namespace-admin');
        const ids = items.map(i => i.id);
        expect(ids).not.toContain('namespaces');
      });
    });

    describe('system-admin role', () => {
      it('returns teaching, admin, and system items', () => {
        const items = getNavItemsForRole('system-admin');
        const ids = items.map(i => i.id);
        expect(ids).toContain('dashboard');
        expect(ids).toContain('classes');
        expect(ids).toContain('user-management');
        expect(ids).toContain('namespaces');
      });
    });

    describe('invalid role', () => {
      it('returns empty array for unknown role', () => {
        const items = getNavItemsForRole('unknown-role');
        expect(items).toEqual([]);
      });

      it('returns empty array for empty string', () => {
        const items = getNavItemsForRole('');
        expect(items).toEqual([]);
      });
    });
  });

  describe('getNavGroupsForRole', () => {
    describe('student role', () => {
      it('returns only Main group', () => {
        const groups = getNavGroupsForRole('student');
        expect(groups).toEqual([NavGroup.Main]);
      });
    });

    describe('instructor role', () => {
      it('returns only Teaching group', () => {
        const groups = getNavGroupsForRole('instructor');
        expect(groups).toEqual([NavGroup.Teaching]);
      });
    });

    describe('namespace-admin role', () => {
      it('returns Teaching and Admin groups', () => {
        const groups = getNavGroupsForRole('namespace-admin');
        expect(groups).toEqual([NavGroup.Teaching, NavGroup.Admin]);
      });
    });

    describe('system-admin role', () => {
      it('returns Teaching, Admin, and System groups', () => {
        const groups = getNavGroupsForRole('system-admin');
        expect(groups).toEqual([NavGroup.Teaching, NavGroup.Admin, NavGroup.System]);
      });
    });

    describe('invalid role', () => {
      it('returns empty array for unknown role', () => {
        const groups = getNavGroupsForRole('unknown-role');
        expect(groups).toEqual([]);
      });
    });

    it('returns groups in correct order', () => {
      // system-admin has access to all groups
      const groups = getNavGroupsForRole('system-admin');
      const expectedOrder = [NavGroup.Teaching, NavGroup.Admin, NavGroup.System];
      expect(groups).toEqual(expectedOrder);
    });
  });
});
