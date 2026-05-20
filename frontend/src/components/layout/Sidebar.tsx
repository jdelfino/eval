'use client';

/**
 * Left sidebar navigation component (v4 redesign).
 * Brand mark + namespace area + role-aware sectioned nav + user row with sign-out.
 * Supports expanded (232px) and collapsed (56px) states.
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePreview } from '@/contexts/PreviewContext';
import { getNavItemsForRole, getNavGroupsForRole, NavGroup, NavItem, NAV_ITEMS } from '@/config/navigation';
import { Icon, IconBtn } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { getSystemNamespace, listSystemNamespaces, NamespaceInfo } from '@/lib/api/system';

interface SidebarProps {
  /** Whether sidebar is collapsed to icon-only mode */
  collapsed?: boolean;
  /** Callback when collapse toggle is clicked */
  onToggleCollapse?: () => void;
}

/** Group label for display. */
const GROUP_LABELS: Record<NavGroup, string> = {
  [NavGroup.Main]: 'Main',
  [NavGroup.Teaching]: 'Teaching',
  [NavGroup.Admin]: 'Admin',
  [NavGroup.System]: 'System',
};

/**
 * Check if a nav item's href matches the current pathname.
 * Matches exact path or child paths, but NOT if the path matches a more specific nav item.
 */
function isPathActive(href: string, pathname: string): boolean {
  if (pathname === href) {
    return true;
  }

  if (href !== '/' && pathname.startsWith(href + '/')) {
    const moreSpecificMatch = NAV_ITEMS.some(item =>
      item.href !== href &&
      item.href.startsWith(href + '/') &&
      (pathname === item.href || pathname.startsWith(item.href + '/'))
    );
    return !moreSpecificMatch;
  }

  return false;
}

/** Get initials from display name or email for avatar. */
function getInitials(displayName: string | null | undefined, email: string): string {
  const name = displayName || email;
  const parts = name.split(/[\s@]/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface NavItemLinkProps {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}

function NavItemLink({ item, isActive, collapsed }: NavItemLinkProps) {
  return (
    <Link
      href={item.href}
      prefetch={false}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 8,
        padding: collapsed ? '7px 0' : '7px 10px',
        justifyContent: collapsed ? 'center' : undefined,
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: 'none',
        color: isActive ? 'var(--fg)' : 'var(--fg-muted)',
        background: isActive ? 'var(--bg-sunken)' : 'transparent',
        position: 'relative',
        transition: 'background 0.1s',
      }}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
    >
      {/* Active accent bar */}
      {isActive && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: '20%',
            height: '60%',
            width: 2,
            borderRadius: 1,
            background: 'var(--accent)',
          }}
        />
      )}
      <Icon name={item.icon as IconName} size={14} />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

interface NavGroupSectionProps {
  group: NavGroup;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  isFirst: boolean;
}

function NavGroupSection({ group, items, pathname, collapsed, isFirst }: NavGroupSectionProps) {
  const groupItems = items.filter(item => item.group === group);

  if (groupItems.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: isFirst ? 0 : 16 }}>
      {!collapsed && (
        <h3
          style={{
            padding: '0 10px',
            marginBottom: 4,
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--fg-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {GROUP_LABELS[group]}
        </h3>
      )}
      <nav role="navigation" aria-label={collapsed ? undefined : GROUP_LABELS[group]}>
        {groupItems.map(item => (
          <NavItemLink
            key={item.id}
            item={item}
            isActive={isPathActive(item.href, pathname)}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </div>
  );
}

/**
 * Namespace area rendered in the sidebar header below the brand wordmark.
 * - Non-system-admin: display-only label showing the current namespace name.
 * - System-admin: clickable button that opens a dropdown to switch namespaces.
 *   Selection persists to localStorage('selectedNamespaceId') and reloads the page.
 */
function SidebarNamespaceArea() {
  const { user } = useAuth();
  const [namespaces, setNamespaces] = useState<NamespaceInfo[]>([]);
  const [currentNamespace, setCurrentNamespace] = useState<NamespaceInfo | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isSystemAdmin = user?.role === 'system-admin';

  // Load current namespace for non-admin users
  useEffect(() => {
    if (!user?.namespace_id || isSystemAdmin) return;

    getSystemNamespace(user.namespace_id).then(ns => {
      setCurrentNamespace(ns);
    }).catch(err => {
      console.error('Failed to load namespace:', err);
    });
  }, [user, isSystemAdmin]);

  // Load all namespaces for system-admin
  useEffect(() => {
    if (!isSystemAdmin || !user) return;

    listSystemNamespaces().then(nsList => {
      setNamespaces(nsList);

      const savedId = localStorage.getItem('selectedNamespaceId');
      const activeId = savedId || user.namespace_id || 'default';
      const selected = nsList.find(ns => ns.id === activeId) || nsList[0] || null;
      setCurrentNamespace(selected);
    }).catch(err => {
      console.error('Failed to load namespaces:', err);
    });
  }, [user, isSystemAdmin]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const handleSelectNamespace = (ns: NamespaceInfo) => {
    localStorage.setItem('selectedNamespaceId', ns.id);
    window.location.reload();
  };

  const displayName = currentNamespace?.displayName || user?.namespace_id || '';

  if (!user || !displayName) return null;

  if (!isSystemAdmin) {
    // Display-only label
    return (
      <span
        style={{
          fontSize: 11,
          color: 'var(--fg-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
        }}
      >
        {displayName}
      </span>
    );
  }

  // System-admin: clickable dropdown trigger
  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Switch namespace"
        onClick={() => setDropdownOpen(prev => !prev)}
        style={{
          all: 'unset',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 11,
          color: 'var(--fg-muted)',
          cursor: 'pointer',
          maxWidth: '100%',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </span>
        <Icon name="chevD" size={10} />
      </button>

      {dropdownOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            minWidth: 160,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          {namespaces.map(ns => (
            <button
              key={ns.id}
              type="button"
              aria-label={ns.displayName}
              onClick={() => handleSelectNamespace(ns)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                fontSize: 12,
                color: ns.id === currentNamespace?.id ? 'var(--accent)' : 'var(--fg)',
                fontWeight: ns.id === currentNamespace?.id ? 600 : 400,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {ns.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const { user, signOut } = useAuth();
  const { isPreview } = usePreview();
  const pathname = usePathname();
  const router = useRouter();

  // During preview mode, show student navigation so instructor sees what students see
  const role = isPreview ? 'student' : (user?.role || 'student');
  const navItems = getNavItemsForRole(role);
  const navGroups = getNavGroupsForRole(role);

  const displayName = user?.display_name || user?.email || '';
  const initials = user ? getInitials(user.display_name, user.email) : '??';
  const roleLabel = user?.role?.replace('-', ' ') ?? '';

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/signin');
  };

  return (
    <aside
      aria-label="Main navigation"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        borderRight: '1px solid var(--border)',
        height: '100%',
        width: collapsed ? 56 : 232,
        transition: 'width 0.2s',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header: brand mark + wordmark + namespace area */}
      <div
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0 15px' : '0 12px',
          gap: 8,
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Brand logomark */}
        <div
          style={{
            width: 26,
            height: 26,
            background: 'var(--accent)',
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 14,
            color: 'var(--accent-ink, #fff)',
          }}
        >
          e
        </div>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--fg)',
                letterSpacing: -0.2,
              }}
            >
              Eval
            </div>
            <SidebarNamespaceArea />
          </div>
        )}
      </div>

      {/* Navigation items */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 6,
        }}
      >
        {navGroups.map((group, index) => (
          <NavGroupSection
            key={group}
            group={group}
            items={navItems}
            pathname={pathname}
            collapsed={collapsed}
            isFirst={index === 0}
          />
        ))}

        {/* Help link (part of nav section, always visible) */}
        <div style={{ marginTop: 8 }}>
          <Link
            href="/help"
            prefetch={false}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: collapsed ? 0 : 8,
              padding: collapsed ? '7px 0' : '7px 10px',
              justifyContent: collapsed ? 'center' : undefined,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
              color: isPathActive('/help', pathname) ? 'var(--fg)' : 'var(--fg-muted)',
              background: isPathActive('/help', pathname) ? 'var(--bg-sunken)' : 'transparent',
              transition: 'background 0.1s',
            }}
            aria-current={isPathActive('/help', pathname) ? 'page' : undefined}
            title={collapsed ? 'Help' : undefined}
            aria-label={collapsed ? 'Help' : undefined}
          >
            <Icon name="info" size={14} />
            {!collapsed && <span>Help</span>}
          </Link>
        </div>
      </div>

      {/* Footer / user row */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--fg)',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>

        {/* User name + role (expanded only) */}
        {!collapsed && (
          <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayName}
            </div>
            {roleLabel && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--fg-muted)',
                  textTransform: 'capitalize',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {roleLabel}
              </div>
            )}
          </div>
        )}

        {/* Collapse toggle */}
        {onToggleCollapse && (
          <IconBtn
            icon={collapsed ? 'chevR' : 'chevL'}
            title="Collapse"
            onClick={onToggleCollapse}
            size={24}
          />
        )}

        {/* Sign Out — visible text required for Playwright :has-text("Sign Out") */}
        <button
          type="button"
          onClick={handleSignOut}
          title="Sign Out"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: collapsed ? 0 : 12,
            color: 'var(--fg-muted)',
            padding: collapsed ? '4px 0' : '4px 6px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            width: collapsed ? 0 : undefined,
            display: collapsed ? 'none' : 'block',
          }}
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
