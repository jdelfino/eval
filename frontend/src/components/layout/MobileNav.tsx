'use client';

/**
 * Mobile navigation drawer component.
 * Slide-out drawer overlay for mobile navigation.
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getNavItemsForRole, getNavGroupsForRole, NavGroup, NavItem } from '@/config/navigation';
import { getIconComponent } from './iconMap';

interface MobileNavProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Callback when drawer should close */
  onClose: () => void;
}

/**
 * Group label for display.
 */
const GROUP_LABELS: Record<NavGroup, string> = {
  [NavGroup.Main]: 'Main',
  [NavGroup.Teaching]: 'Teaching',
  [NavGroup.Admin]: 'Admin',
  [NavGroup.System]: 'System',
};

/**
 * Check if a nav item's href matches the current pathname.
 * Matches exact path or any child paths (e.g., /classes matches /classes/123).
 */
function isPathActive(href: string, pathname: string): boolean {
  // Exact match
  if (pathname === href) {
    return true;
  }

  // Child path match (e.g., /classes matches /classes/123)
  if (href !== '/' && pathname.startsWith(href + '/')) {
    return true;
  }

  return false;
}

interface MobileNavItemProps {
  item: NavItem;
  isActive: boolean;
  onClose: () => void;
}

function MobileNavItem({ item, isActive, onClose }: MobileNavItemProps) {
  const IconComponent = getIconComponent(item.icon);

  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={`flex items-center gap-3 px-4 py-3 text-base font-medium transition-colors ${
        isActive
          ? 'bg-blue-100 text-blue-700 border-l-4 border-blue-600'
          : 'text-gray-700 hover:bg-gray-100 border-l-4 border-transparent'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      {IconComponent && (
        <IconComponent
          className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-500'}`}
          aria-hidden="true"
        />
      )}
      <span>{item.label}</span>
    </Link>
  );
}

interface MobileNavGroupProps {
  group: NavGroup;
  items: NavItem[];
  pathname: string;
  onClose: () => void;
  isFirst: boolean;
}

function MobileNavGroup({ group, items, pathname, onClose, isFirst }: MobileNavGroupProps) {
  const groupItems = items.filter(item => item.group === group);

  if (groupItems.length === 0) {
    return null;
  }

  return (
    <div className={isFirst ? '' : 'mt-4'}>
      <h3 className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
        {GROUP_LABELS[group]}
      </h3>
      <nav role="navigation" aria-label={GROUP_LABELS[group]}>
        {groupItems.map(item => (
          <MobileNavItem
            key={item.id}
            item={item}
            isActive={isPathActive(item.href, pathname)}
            onClose={onClose}
          />
        ))}
      </nav>
    </div>
  );
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const { user } = useAuth();
  const pathname = usePathname();

  const role = user?.role || 'student';
  const navItems = getNavItemsForRole(role);
  const navGroups = getNavGroupsForRole(role);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 left-0 w-72 bg-white z-50 lg:hidden transform transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Drawer header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">CT</span>
            </div>
            <span className="font-semibold text-gray-900">Coding Tool</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation content */}
        <div className="overflow-y-auto h-[calc(100%-3.5rem)]">
          {navGroups.map((group, index) => (
            <MobileNavGroup
              key={group}
              group={group}
              items={navItems}
              pathname={pathname}
              onClose={onClose}
              isFirst={index === 0}
            />
          ))}
        </div>
      </div>
    </>
  );
}
