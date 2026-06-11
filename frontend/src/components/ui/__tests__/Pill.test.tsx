/**
 * Unit tests for Pill component
 * @jest-environment jsdom
 *
 * Verifies that Pill renders with the correct background token per tone,
 * and that the mono prop applies the monospace font family.
 * Regressions here mean token misapplication or mono prop being ignored.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Pill } from '../Pill';

describe('Pill', () => {
  describe('tone prop', () => {
    it('renders with ok tone and mono prop applies monospace font', () => {
      render(<Pill tone="ok" mono>io</Pill>);
      const pill = screen.getByText('io');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveStyle({ fontFamily: 'var(--font-mono)' });
      expect(pill).toHaveStyle({ background: 'var(--run-soft)' });
    });

    it('renders with warn tone and applies warn-soft background', () => {
      render(<Pill tone="warn">!</Pill>);
      const pill = screen.getByText('!');
      expect(pill).toHaveStyle({ background: 'var(--warn-soft)' });
    });

    it('renders with ok tone and applies run-soft background', () => {
      render(<Pill tone="ok">ok</Pill>);
      const pill = screen.getByText('ok');
      expect(pill).toHaveStyle({ background: 'var(--run-soft)' });
    });

    it('renders with info tone and applies info-soft background', () => {
      render(<Pill tone="info">info</Pill>);
      const pill = screen.getByText('info');
      expect(pill).toHaveStyle({ background: 'var(--info-soft)' });
    });

    it('renders with danger tone and applies danger-soft background', () => {
      render(<Pill tone="danger">danger</Pill>);
      const pill = screen.getByText('danger');
      expect(pill).toHaveStyle({ background: 'var(--danger-soft)' });
    });

    it('renders with neutral tone (default) and applies bg-sunken background', () => {
      render(<Pill tone="neutral">neutral</Pill>);
      const pill = screen.getByText('neutral');
      expect(pill).toHaveStyle({ background: 'var(--bg-sunken)' });
    });

    it('defaults to neutral tone when no tone is provided', () => {
      render(<Pill>default</Pill>);
      const pill = screen.getByText('default');
      expect(pill).toHaveStyle({ background: 'var(--bg-sunken)' });
    });
  });

  describe('mono prop', () => {
    it('applies font-mono when mono=true', () => {
      render(<Pill mono>mono</Pill>);
      expect(screen.getByText('mono')).toHaveStyle({ fontFamily: 'var(--font-mono)' });
    });

    it('does not apply font-mono when mono is omitted', () => {
      render(<Pill>no-mono</Pill>);
      const pill = screen.getByText('no-mono');
      // fontFamily should be undefined (not var(--font-mono))
      expect(pill.style.fontFamily).not.toBe('var(--font-mono)');
    });
  });

  describe('foreground color', () => {
    it('applies run fg color for ok tone', () => {
      render(<Pill tone="ok">ok</Pill>);
      expect(screen.getByText('ok')).toHaveStyle({ color: 'var(--run)' });
    });

    it('applies warn fg color for warn tone', () => {
      render(<Pill tone="warn">w</Pill>);
      expect(screen.getByText('w')).toHaveStyle({ color: 'var(--warn)' });
    });

    it('applies danger fg color for danger tone', () => {
      render(<Pill tone="danger">d</Pill>);
      expect(screen.getByText('d')).toHaveStyle({ color: 'var(--danger)' });
    });

    it('applies info fg color for info tone', () => {
      render(<Pill tone="info">i</Pill>);
      expect(screen.getByText('i')).toHaveStyle({ color: 'var(--info)' });
    });

    it('applies fg-muted fg color for neutral tone', () => {
      render(<Pill tone="neutral">n</Pill>);
      expect(screen.getByText('n')).toHaveStyle({ color: 'var(--fg-muted)' });
    });
  });

  describe('dot prop', () => {
    it('renders a dot element when dot=true', () => {
      const { container } = render(<Pill tone="ok" dot>Live</Pill>);
      // The dot is an aria-hidden span sibling to the text
      const dotSpan = container.querySelector('[aria-hidden="true"]');
      expect(dotSpan).toBeInTheDocument();
      expect(dotSpan).toHaveStyle({ borderRadius: '50%' });
    });

    it('does not render a dot element when dot is omitted', () => {
      const { container } = render(<Pill tone="ok">No dot</Pill>);
      const dotSpan = container.querySelector('[aria-hidden="true"]');
      expect(dotSpan).not.toBeInTheDocument();
    });

    it('does not render a dot element when dot=false', () => {
      const { container } = render(<Pill tone="ok" dot={false}>No dot</Pill>);
      const dotSpan = container.querySelector('[aria-hidden="true"]');
      expect(dotSpan).not.toBeInTheDocument();
    });

    it('dot is static — no pulse animation', () => {
      const { container } = render(<Pill tone="ok" dot>Live</Pill>);
      const dotSpan = container.querySelector('[aria-hidden="true"]') as HTMLElement | null;
      expect(dotSpan).toBeInTheDocument();
      // v4 dot is static: no animation property
      expect(dotSpan?.style.animation ?? '').toBe('');
    });
  });

  describe('HTML attribute passthrough', () => {
    it('forwards data-testid to the root span', () => {
      render(<Pill data-testid="my-pill">Label</Pill>);
      expect(screen.getByTestId('my-pill')).toBeInTheDocument();
    });

    it('forwards aria-label to the root span', () => {
      render(<Pill aria-label="status: live">Live</Pill>);
      expect(screen.getByLabelText('status: live')).toBeInTheDocument();
    });

    it('merges custom className with existing styles', () => {
      render(<Pill className="extra-class">Label</Pill>);
      expect(screen.getByText('Label')).toHaveClass('extra-class');
    });
  });
});
