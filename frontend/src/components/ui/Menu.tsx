'use client';

import React, { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

type AnchorProps = { onClick?: React.MouseEventHandler };

interface MenuPropsBase {
  /** Trigger element. The Menu clones this and attaches an onClick handler. */
  anchor: React.ReactElement<AnchorProps>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Horizontal alignment of the popover relative to the anchor. Defaults to 'left'. */
  align?: 'left' | 'right';
}

/**
 * Items-mode: the popover renders a `<ul>` of `<MenuItem>` buttons. This is the
 * default mode used by chip dropdowns and split-button caret menus.
 */
export interface MenuItemsProps extends MenuPropsBase {
  items: MenuItem[];
  children?: never;
}

/**
 * Content-mode: the popover renders arbitrary `children` instead of an item
 * list. Use this for menus whose contents are not a simple static list — e.g.
 * async loading/empty/error states plus a dynamically-fetched section list.
 * The popover shell (positioning, outside-click, Escape, anchor toggle,
 * `role="menu"`) is identical to items-mode; only the body differs.
 */
export interface MenuContentProps extends MenuPropsBase {
  items?: never;
  children: React.ReactNode;
}

export type MenuProps = MenuItemsProps | MenuContentProps;

/**
 * Menu — a lightweight positioned popover primitive for chip dropdowns and
 * split-button caret menus (T3 and T5).
 *
 * Renders the anchor element as-is (via cloneElement) with an added onClick
 * that toggles open state. When open, renders an absolutely-positioned <ul>
 * below the anchor. Outside-click and Escape key close the menu.
 */
export function Menu({ anchor, open, onOpenChange, align = 'left', ...rest }: MenuProps) {
  const popoverRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Outside-click close
  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, onOpenChange]);

  // Escape key close
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const clonedAnchor = React.cloneElement<AnchorProps>(anchor, {
    onClick: (e) => {
      anchor.props.onClick?.(e);
      onOpenChange(!open);
    },
  });

  const popoverPositionStyle: React.CSSProperties =
    align === 'right'
      ? { top: 'calc(100% + 4px)', right: 0 }
      : { top: 'calc(100% + 4px)', left: 0 };

  const popoverStyle: React.CSSProperties = {
    position: 'absolute',
    ...popoverPositionStyle,
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: 4,
    minWidth: 140,
    boxShadow: '0 4px 12px rgba(0,0,0,.08)',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    zIndex: 50,
    margin: 0,
    listStyle: 'none',
  };

  // Content-mode: render arbitrary children inside the same popover shell.
  if ('children' in rest) {
    return (
      <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
        {clonedAnchor}
        {open && (
          <div
            ref={popoverRef as React.RefObject<HTMLDivElement>}
            role="menu"
            style={popoverStyle}
          >
            {rest.children}
          </div>
        )}
      </div>
    );
  }

  // Items-mode (default): render a list of selectable item buttons.
  const items = rest.items;
  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      {clonedAnchor}
      {open && (
        <ul
          ref={popoverRef as React.RefObject<HTMLUListElement>}
          role="menu"
          style={popoverStyle}
        >
          {items.map((item) => (
            <li key={item.label}>
              <button
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect();
                  onOpenChange(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  borderRadius: 4,
                  color: 'var(--fg)',
                  background: 'transparent',
                  border: 'none',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.45 : 1,
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Menu;
