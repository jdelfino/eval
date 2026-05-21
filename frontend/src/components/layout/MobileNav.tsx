'use client';

/**
 * Mobile navigation drawer — slide-out overlay used on narrow viewports.
 */

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  getNavItemsForRole,
  getNavGroupsForRole,
  NavGroup,
  NavItem,
  GROUP_LABELS,
  isPathActive,
} from '@/config/navigation';
import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';

interface MobileNavProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Callback when drawer should close */
  onClose: () => void;
}

interface MobileNavItemProps {
  item: NavItem;
  isActive: boolean;
  onClose: () => void;
}

function MobileNavItem({ item, isActive, onClose }: MobileNavItemProps) {
  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={onClose}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        fontSize: 15,
        fontWeight: 500,
        textDecoration: 'none',
        color: isActive ? 'var(--accent-ink, var(--fg))' : 'var(--fg-muted)',
        background: isActive ? 'var(--accent-soft, var(--bg-sunken))' : 'transparent',
        borderLeft: `4px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
        transition: 'background 0.1s',
      }}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon name={item.icon as IconName} size={16} />
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
    <div style={{ marginTop: isFirst ? 0 : 16 }}>
      <h3
        style={{
          padding: '8px 16px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--fg-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          background: 'var(--bg-sunken)',
        }}
      >
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

  // Lock body scroll while open; restore on unmount (close)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!isOpen) return null;

  const helpActive = isPathActive('/help', pathname);

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 40,
        }}
        className="lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          width: 288,
          background: 'var(--bg)',
          zIndex: 50,
        }}
        className="lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 26,
                height: 26,
                background: 'var(--accent)',
                borderRadius: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: 14,
                color: 'var(--accent-ink, #fff)',
              }}
            >
              e
            </div>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>Eval</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: 8,
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--fg-muted)',
            }}
            aria-label="Close navigation menu"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', height: 'calc(100% - 56px)' }}>
          <div style={{ flex: 1 }}>
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

          <div style={{ borderTop: '1px solid var(--border)' }}>
            <Link
              href="/help"
              prefetch={false}
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                fontSize: 15,
                fontWeight: 500,
                textDecoration: 'none',
                color: helpActive ? 'var(--accent-ink, var(--fg))' : 'var(--fg-muted)',
                background: helpActive ? 'var(--accent-soft, var(--bg-sunken))' : 'transparent',
                borderLeft: `4px solid ${helpActive ? 'var(--accent)' : 'transparent'}`,
                transition: 'background 0.1s',
              }}
              aria-current={helpActive ? 'page' : undefined}
            >
              <Icon name="info" size={16} />
              <span>Help</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
