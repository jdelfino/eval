/**
 * Unit tests for Menu primitive
 * @jest-environment jsdom
 *
 * Verifies the Menu popover opens/closes correctly, fires item callbacks,
 * handles outside-click and Escape key dismissal, and respects disabled items.
 * This primitive is the shared foundation for T3 (chip dropdowns) and T5
 * (split-button caret). Regressions here break both features simultaneously.
 */

import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Menu, MenuItem } from '../Menu';

// Controlled wrapper for tests that need to toggle open state via the anchor
function ControlledMenu({
  items,
  align,
  initialOpen = false,
}: {
  items: MenuItem[];
  align?: 'left' | 'right';
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <Menu
      anchor={<button>Trigger</button>}
      items={items}
      open={open}
      onOpenChange={setOpen}
      align={align}
    />
  );
}

describe('Menu', () => {
  const makeItems = (): { items: MenuItem[]; onSelectA: jest.Mock; onSelectB: jest.Mock } => {
    const onSelectA = jest.fn();
    const onSelectB = jest.fn();
    return {
      items: [
        { label: 'A', onSelect: onSelectA },
        { label: 'B', onSelect: onSelectB },
      ],
      onSelectA,
      onSelectB,
    };
  };

  describe('1. Closed Menu renders trigger but no popover', () => {
    /**
     * When open=false, the Menu must render the anchor trigger but must NOT
     * render the item list. If the popover leaked through while closed, T3
     * chip menus and T5 caret menus would expose their options at all times.
     */
    it('renders the anchor but hides the popover when open=false', () => {
      const { items } = makeItems();
      const onOpenChange = jest.fn();
      render(
        <Menu
          anchor={<button>Trigger</button>}
          items={items}
          open={false}
          onOpenChange={onOpenChange}
        />
      );
      expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument();
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  describe('2. Open Menu renders popover with items', () => {
    /**
     * When open=true, the popover must render all item labels as buttons.
     * If items are missing, consumers (T3, T5) cannot display their options.
     */
    it('renders item buttons A and B when open=true', () => {
      const { items } = makeItems();
      const onOpenChange = jest.fn();
      render(
        <Menu
          anchor={<button>Trigger</button>}
          items={items}
          open={true}
          onOpenChange={onOpenChange}
        />
      );
      expect(screen.getByRole('menuitem', { name: 'A' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'B' })).toBeInTheDocument();
    });
  });

  describe('3. Click item fires onSelect and closes', () => {
    /**
     * Clicking an item must fire that item's onSelect callback and then call
     * onOpenChange(false). If onSelect is not fired, the consumer's action
     * (e.g., selecting a class or kind) is silently dropped.
     */
    it('fires onSelect for clicked item and calls onOpenChange(false)', () => {
      const { items, onSelectB } = makeItems();
      const onOpenChange = jest.fn();
      render(
        <Menu
          anchor={<button>Trigger</button>}
          items={items}
          open={true}
          onOpenChange={onOpenChange}
        />
      );
      fireEvent.click(screen.getByRole('menuitem', { name: 'B' }));
      expect(onSelectB).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('4. Outside-click closes', () => {
    /**
     * A mousedown on document outside the popover must fire onOpenChange(false).
     * Without this, users cannot dismiss the menu by clicking elsewhere —
     * breaking the standard popover UX contract.
     */
    it('calls onOpenChange(false) when mousedown fires outside popover', () => {
      const { items } = makeItems();
      const onOpenChange = jest.fn();
      render(
        <Menu
          anchor={<button>Trigger</button>}
          items={items}
          open={true}
          onOpenChange={onOpenChange}
        />
      );
      fireEvent.mouseDown(document.body);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('5. Esc closes', () => {
    /**
     * Pressing Escape while the menu is open must fire onOpenChange(false).
     * This is a standard keyboard accessibility requirement for popover menus.
     */
    it('calls onOpenChange(false) when Escape key is pressed', () => {
      const { items } = makeItems();
      const onOpenChange = jest.fn();
      render(
        <Menu
          anchor={<button>Trigger</button>}
          items={items}
          open={true}
          onOpenChange={onOpenChange}
        />
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('6. Disabled item does not fire onSelect', () => {
    /**
     * Clicking a disabled item must NOT call its onSelect callback.
     * The menu should remain open (deterministic: disabled click does not close).
     * If disabled is ignored, authors could accidentally trigger read-only options.
     */
    it('does not call onSelect for disabled item and menu stays open', () => {
      const onSelectDisabled = jest.fn();
      const onOpenChange = jest.fn();
      render(
        <Menu
          anchor={<button>Trigger</button>}
          items={[{ label: 'A', onSelect: onSelectDisabled, disabled: true }]}
          open={true}
          onOpenChange={onOpenChange}
        />
      );
      fireEvent.click(screen.getByRole('menuitem', { name: 'A' }));
      expect(onSelectDisabled).not.toHaveBeenCalled();
      // Menu should NOT close on disabled item click
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe('7. align=right positions popover from right edge', () => {
    /**
     * When align='right', the popover must apply right:0 positioning so it
     * aligns to the right edge of the anchor. Without this, right-anchored
     * dropdowns (e.g., T5's caret menu) overflow the viewport on the left.
     */
    it("applies right:0 style when align='right'", () => {
      const { items } = makeItems();
      render(
        <Menu
          anchor={<button>Trigger</button>}
          items={items}
          open={true}
          onOpenChange={jest.fn()}
          align="right"
        />
      );
      const menu = screen.getByRole('menu');
      expect(menu).toHaveStyle({ right: '0' });
    });

    it("applies left:0 style when align='left' (default)", () => {
      const { items } = makeItems();
      render(
        <Menu
          anchor={<button>Trigger</button>}
          items={items}
          open={true}
          onOpenChange={jest.fn()}
          align="left"
        />
      );
      const menu = screen.getByRole('menu');
      expect(menu).toHaveStyle({ left: '0' });
    });
  });

  describe('anchor click toggles open state', () => {
    /**
     * The anchor's onClick should call onOpenChange(!open), allowing the
     * consumer to toggle the menu with the trigger element.
     */
    it('calls onOpenChange(!open) when anchor is clicked', () => {
      const { items } = makeItems();
      const onOpenChange = jest.fn();
      render(
        <Menu
          anchor={<button>Trigger</button>}
          items={items}
          open={false}
          onOpenChange={onOpenChange}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });
});
