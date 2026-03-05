/**
 * Icon map for dynamic icon lookup.
 * Maps icon names (as used in navigation config) to Lucide icon components.
 */

import {
  BookOpen,
  LayoutDashboard,
  School,
  Monitor,
  FileCode,
  Users,
  Building,
  Bot,
  LucideIcon,
} from 'lucide-react';

/**
 * Map of icon names to Lucide icon components.
 * Add new icons here as needed.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen,
  LayoutDashboard,
  School,
  Monitor,
  FileCode,
  Users,
  Building,
  Bot,
};

/**
 * Get a Lucide icon component by name.
 * @param iconName - The name of the icon (must match a key in ICON_MAP)
 * @returns The icon component or null if not found
 */
export function getIconComponent(iconName: string): LucideIcon | null {
  return ICON_MAP[iconName] || null;
}
