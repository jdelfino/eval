/**
 * Navigation configuration for the application.
 * Defines navigation items, groups, breadcrumb hierarchy, and role-based filtering.
 */

/** User roles in the system */
export type UserRole = 'system-admin' | 'namespace-admin' | 'instructor' | 'student';

/** Navigation groups for sidebar sections */
export enum NavGroup {
  Main = 'main',
  Teaching = 'teaching',
  Admin = 'admin',
  System = 'system',
}

/** Navigation item configuration */
export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string; // Lucide icon name
  roles: UserRole[];
  group: NavGroup;
}

/** Role hierarchy for permission checking */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  'student': 0,
  'instructor': 1,
  'namespace-admin': 2,
  'system-admin': 3,
};

/**
 * All navigation items in the application.
 * Roles array specifies which roles can access each item.
 */
export const NAV_ITEMS: NavItem[] = [
  // Main group - student only
  {
    id: 'my-sections',
    label: 'My Sections',
    href: '/sections',
    icon: 'BookOpen',
    roles: ['student'],
    group: NavGroup.Main,
  },

  // Teaching group - instructor and above
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/instructor',
    icon: 'LayoutDashboard',
    roles: ['instructor', 'namespace-admin', 'system-admin'],
    group: NavGroup.Teaching,
  },
  {
    id: 'classes',
    label: 'Classes',
    href: '/classes',
    icon: 'School',
    roles: ['instructor', 'namespace-admin', 'system-admin'],
    group: NavGroup.Teaching,
  },
  {
    id: 'problems',
    label: 'Problems',
    href: '/instructor/problems',
    icon: 'FileCode',
    roles: ['instructor', 'namespace-admin', 'system-admin'],
    group: NavGroup.Teaching,
  },

  // Admin group - namespace-admin and above
  {
    id: 'user-management',
    label: 'User Management',
    href: '/admin',
    icon: 'Users',
    roles: ['namespace-admin', 'system-admin'],
    group: NavGroup.Admin,
  },

  // System group - system-admin only
  {
    id: 'namespaces',
    label: 'Namespaces',
    href: '/system',
    icon: 'Building',
    roles: ['system-admin'],
    group: NavGroup.System,
  },
];

/**
 * Breadcrumb hierarchy mapping.
 * Maps routes to their parent routes for building breadcrumb navigation.
 * null indicates a top-level route.
 */
export const BREADCRUMB_HIERARCHY: Record<string, string | null> = {
  '/classes': null,
  '/classes/[id]': '/classes',
  '/sections': null,
  '/sections/[sectionId]': '/sections',
  '/sections/[sectionId]/session/[sessionId]': '/sections/[sectionId]',
  '/instructor': null,
  '/instructor/session/[id]': '/instructor',
  '/instructor/problems': '/instructor',
  '/admin': null,
  '/system': null,
  '/system/namespaces/[id]': '/system',
};

/**
 * Get navigation items accessible by a given role.
 * @param role - The user role to filter by
 * @returns Array of navigation items the role can access
 */
export function getNavItemsForRole(role: string): NavItem[] {
  if (!isValidRole(role)) {
    return [];
  }

  return NAV_ITEMS.filter(item => item.roles.includes(role as UserRole));
}

/**
 * Get navigation groups that have items accessible by a given role.
 * @param role - The user role to filter by
 * @returns Array of navigation groups the role has access to
 */
export function getNavGroupsForRole(role: string): NavGroup[] {
  if (!isValidRole(role)) {
    return [];
  }

  const items = getNavItemsForRole(role);
  const groups = new Set<NavGroup>();

  for (const item of items) {
    groups.add(item.group);
  }

  // Return groups in order: Main, Teaching, Admin, System
  const orderedGroups = [NavGroup.Main, NavGroup.Teaching, NavGroup.Admin, NavGroup.System];
  return orderedGroups.filter(group => groups.has(group));
}

/**
 * Check if a string is a valid user role.
 * @param role - The role to check
 * @returns true if the role is valid
 */
function isValidRole(role: string): role is UserRole {
  return role in ROLE_HIERARCHY;
}
