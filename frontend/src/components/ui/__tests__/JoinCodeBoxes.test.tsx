/**
 * Unit tests for JoinCodeBoxes component.
 *
 * Verifies the 6-character boxed code input used across the landing and
 * registration pages. Key contracts:
 * - A real <input> element is present (enables paste, autofill, Playwright fill)
 * - The onChange handler emits formatted values via formatJoinCodeInput
 * - Ghost placeholder characters shown when empty
 * - Error variant: all boxes get the danger border
 * - The id prop is forwarded to the real input element (e2e selector contract)
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JoinCodeBoxes } from '../JoinCodeBoxes';

function ControlledBoxes(props: Partial<React.ComponentProps<typeof JoinCodeBoxes>>) {
  const [value, setValue] = React.useState(props.value ?? '');
  return (
    <JoinCodeBoxes
      value={value}
      onChange={(v) => {
        setValue(v);
        props.onChange?.(v);
      }}
      {...props}
    />
  );
}

describe('JoinCodeBoxes', () => {
  describe('input plumbing', () => {
    it('renders a real input with default id "join-code"', () => {
      const { container } = render(<JoinCodeBoxes value="" onChange={jest.fn()} />);
      expect(container.querySelector('#join-code')).not.toBeNull();
    });

    it('forwards custom id to the real input', () => {
      const { container } = render(<JoinCodeBoxes id="join_code" value="" onChange={jest.fn()} />);
      expect(container.querySelector('#join_code')).not.toBeNull();
    });

    it('forwards aria-label to the input', () => {
      render(<JoinCodeBoxes value="" onChange={jest.fn()} aria-label="Join code" />);
      expect(screen.getByRole('textbox', { name: 'Join code' })).toBeInTheDocument();
    });

    it('uses default aria-label "Join code"', () => {
      render(<JoinCodeBoxes value="" onChange={jest.fn()} />);
      expect(screen.getByRole('textbox', { name: 'Join code' })).toBeInTheDocument();
    });
  });

  describe('typing behavior', () => {
    it('typing calls onChange with formatted value', () => {
      const onChange = jest.fn();
      render(<ControlledBoxes onChange={onChange} />);

      const input = screen.getByRole('textbox', { name: 'Join code' });
      // Fire a change event with multi-char value (simulating paste or autofill)
      fireEvent.change(input, { target: { value: 'ab1c' } });

      // formatJoinCodeInput('ab1c') === 'AB1-C'
      expect(onChange).toHaveBeenCalledWith('AB1-C');
    });

    it('paste of "abc-123" yields "ABC-123"', async () => {
      const onChange = jest.fn();
      render(<ControlledBoxes onChange={onChange} />);

      const input = screen.getByRole('textbox', { name: 'Join code' });
      await userEvent.click(input);
      await userEvent.paste('abc-123');

      expect(onChange).toHaveBeenLastCalledWith('ABC-123');
    });
  });

  describe('visual boxes', () => {
    it('shows ghost placeholder characters A, B, C, 1, 2, 3 when empty', () => {
      render(<JoinCodeBoxes value="" onChange={jest.fn()} />);
      // Ghost chars are aria-hidden but should be in the DOM
      // They appear as text content in box divs
      const boxes = document.querySelectorAll('[aria-hidden="true"] [data-box]');
      // Check via text content in the container
      const container = document.querySelector('[aria-hidden="true"]');
      expect(container).not.toBeNull();
      if (container) {
        expect(container.textContent).toContain('A');
        expect(container.textContent).toContain('B');
        expect(container.textContent).toContain('C');
        expect(container.textContent).toContain('1');
        expect(container.textContent).toContain('2');
        expect(container.textContent).toContain('3');
      }
    });

    it('error prop makes all boxes use danger border style', () => {
      render(<JoinCodeBoxes value="ABC-123" onChange={jest.fn()} error />);
      const container = document.querySelector('[aria-hidden="true"]');
      expect(container).not.toBeNull();
      // All box elements should have danger border
      const boxDivs = container?.querySelectorAll('[data-box]');
      expect(boxDivs?.length).toBe(6);
      boxDivs?.forEach((box) => {
        expect((box as HTMLElement).style.border).toContain('var(--danger)');
      });
    });
  });
});
