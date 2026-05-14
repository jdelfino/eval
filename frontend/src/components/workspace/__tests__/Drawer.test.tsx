/**
 * Unit tests for Drawer component (workspace bottom panel).
 * @jest-environment jsdom
 *
 * Verifies that Drawer renders correctly for each mode (idle/output/failure/debug/runtime-error),
 * the collapsed state (30px bar), theme inversion logic, and structural elements.
 * Regressions here mean users see wrong content (wrong mode, missing failure details,
 * broken scrubber controls) or wrong visual signals (wrong theme, broken collapsing).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Drawer } from '../Drawer';

describe('Drawer', () => {
  describe('collapsed state', () => {
    it('renders 30px summary bar when collapsed=true', () => {
      /**
       * Contract: collapsed=true renders a 30px high summary bar showing the summary text.
       * Clicking fires onToggleCollapsed. Critical for the drawer's expand/collapse UX.
       */
      const onToggleCollapsed = jest.fn();
      const { container } = render(
        <Drawer
          mode="output"
          collapsed={true}
          onToggleCollapsed={onToggleCollapsed}
          summary="5 of 7 passing"
        />
      );
      const outer = container.firstChild as HTMLElement;
      expect(outer).toHaveStyle({ height: '30px' });
      expect(screen.getByText('5 of 7 passing')).toBeInTheDocument();
    });

    it('fires onToggleCollapsed when collapsed bar is clicked', () => {
      const onToggleCollapsed = jest.fn();
      const { container } = render(
        <Drawer
          mode="output"
          collapsed={true}
          onToggleCollapsed={onToggleCollapsed}
          summary="5 of 7 passing"
        />
      );
      const outer = container.firstChild as HTMLElement;
      fireEvent.click(outer);
      expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    });
  });

  describe('mode=idle', () => {
    it('renders placeholder text', () => {
      /**
       * Contract: idle mode shows a placeholder prompting the user to run a test.
       * If missing, the drawer body is blank and users don't know what to do.
       * Note: the idle auto-summary also appears in the header, so we assert at least
       * one element with the body placeholder text exists in the view body (flex-centered).
       */
      render(<Drawer mode="idle" />);
      // Use getAllByText since the summary text also appears in the header for idle mode
      const matches = screen.getAllByText(/run a test to see output here/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
      // The body placeholder is the div with centered layout
      const bodyPlaceholder = matches.find(el => el.tagName === 'DIV');
      expect(bodyPlaceholder).toBeTruthy();
    });
  });

  describe('mode=output', () => {
    it('renders stdout and stderr lines with distinct styling', () => {
      /**
       * Contract: output mode renders each line; stderr lines use --danger color.
       * Catching: stream type ignored, stderr not visually distinguished.
       */
      render(
        <Drawer
          mode="output"
          output={{
            lines: [
              { stream: 'out', text: 'hello' },
              { stream: 'err', text: 'oops' },
            ],
          }}
        />
      );

      const helloEl = screen.getByText('hello');
      const oopsEl = screen.getByText('oops');
      expect(helloEl).toBeInTheDocument();
      expect(oopsEl).toBeInTheDocument();
      expect(oopsEl).toHaveStyle({ color: 'var(--danger)' });
      // stdout should NOT have danger color
      expect(helloEl).not.toHaveStyle({ color: 'var(--danger)' });
    });
  });

  describe('mode=failure kind=io', () => {
    it('renders stdin / expected / got labeled blocks, got block has danger styling', () => {
      /**
       * Contract: io failure renders three labeled blocks (stdin, expected stdout, got stdout).
       * The "got" block uses danger color. Missing blocks or labels means users can't diagnose failures.
       */
      render(
        <Drawer
          mode="failure"
          failure={{
            kind: 'io',
            io: { stdin: '1\n2', expected: '3', got: '5' },
          }}
        />
      );

      // Labels are rendered as exact text nodes
      expect(screen.getByText('stdin')).toBeInTheDocument();
      // The stdin block renders "1\n2" — find the block by following the label's sibling
      const stdinLabel = screen.getByText('stdin');
      const stdinBlock = stdinLabel.nextElementSibling as HTMLElement;
      expect(stdinBlock?.textContent).toContain('1');
      expect(stdinBlock?.textContent).toContain('2');
      expect(screen.getByText('Expected stdout')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      // "Got stdout" label has danger color
      const gotLabel = screen.getByText('Got stdout');
      expect(gotLabel).toHaveStyle({ color: 'var(--danger)' });
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('mode=failure kind=pytest', () => {
    it('renders target and traceback pre block', () => {
      /**
       * Contract: pytest failure renders target identifier and full traceback in a <pre>.
       * Truncated or missing trace means users can't see the full assertion error.
       */
      render(
        <Drawer
          mode="failure"
          failure={{
            kind: 'pytest',
            pytest: {
              target: 'tests/x.py::t',
              trace: '…AssertionError: assert 1 == 2',
            },
          }}
        />
      );

      expect(screen.getByText('tests/x.py::t')).toBeInTheDocument();
      const pre = screen.getByText('…AssertionError: assert 1 == 2');
      expect(pre.tagName).toBe('PRE');
    });
  });

  describe('mode=debug', () => {
    it('renders scrubber with correct fill percentage', () => {
      /**
       * Contract: debug mode renders a scrubber filled to step/total percentage.
       * step=3 of total=10 means 30% fill. Controls must fire correct callbacks.
       */
      const onStep = jest.fn();
      const onPlay = jest.fn();
      render(
        <Drawer
          mode="debug"
          debug={{
            step: 3,
            total: 10,
            locals: [{ name: 'x', value: '42', changed: true }],
            stack: [{ frame: 'main', line: 7 }],
            onStep,
            onPlay,
          }}
        />
      );

      // Scrubber fill bar should be at 30%
      const fillBar = document.querySelector('[data-testid="scrubber-fill"]') as HTMLElement;
      if (fillBar) {
        expect(fillBar).toHaveStyle({ width: '30%' });
      } else {
        // Find by inline style if no test id
        const allDivs = document.querySelectorAll('div');
        const fill = Array.from(allDivs).find(d => d.style.width === '30%');
        expect(fill).toBeTruthy();
      }
    });

    it('renders local variable with changed accent color', () => {
      render(
        <Drawer
          mode="debug"
          debug={{
            step: 3,
            total: 10,
            locals: [{ name: 'x', value: '42', changed: true }],
            stack: [{ frame: 'main', line: 7 }],
          }}
        />
      );

      // The changed local name should use accent color
      const nameEl = screen.getByText('x');
      expect(nameEl).toHaveStyle({ color: 'var(--accent)' });
    });

    it('renders stack frame', () => {
      render(
        <Drawer
          mode="debug"
          debug={{
            step: 3,
            total: 10,
            locals: [],
            stack: [{ frame: 'main', line: 7 }],
          }}
        />
      );

      expect(screen.getByText('main')).toBeInTheDocument();
      expect(screen.getByText(/line 7/)).toBeInTheDocument();
    });

    it('fires onStep(-1) when back button clicked', () => {
      const onStep = jest.fn();
      const onPlay = jest.fn();
      render(
        <Drawer
          mode="debug"
          debug={{
            step: 3,
            total: 10,
            locals: [],
            stack: [],
            onStep,
            onPlay,
          }}
        />
      );

      const backBtn = screen.getByTitle('Previous step');
      fireEvent.click(backBtn);
      expect(onStep).toHaveBeenCalledWith(-1);
    });

    it('fires onPlay() when play button clicked', () => {
      const onStep = jest.fn();
      const onPlay = jest.fn();
      render(
        <Drawer
          mode="debug"
          debug={{
            step: 3,
            total: 10,
            locals: [],
            stack: [],
            onStep,
            onPlay,
          }}
        />
      );

      const playBtn = screen.getByTitle('Play');
      fireEvent.click(playBtn);
      expect(onPlay).toHaveBeenCalledTimes(1);
    });

    it('fires onStep(1) when next step button clicked', () => {
      const onStep = jest.fn();
      const onPlay = jest.fn();
      render(
        <Drawer
          mode="debug"
          debug={{
            step: 3,
            total: 10,
            locals: [],
            stack: [],
            onStep,
            onPlay,
          }}
        />
      );

      const nextBtn = screen.getByTitle('Next step');
      fireEvent.click(nextBtn);
      expect(onStep).toHaveBeenCalledWith(1);
    });
  });

  describe('mode=runtime-error', () => {
    it('renders type, message, and trace', () => {
      /**
       * Contract: runtime-error mode shows the error type (with danger color), message, and trace.
       * Missing any of these leaves users unable to diagnose unhandled exceptions.
       */
      render(
        <Drawer
          mode="runtime-error"
          runtimeError={{
            type: 'NameError',
            message: "name 'x' is undefined",
            trace: '  File "main.py", line 3\nNameError: ...',
          }}
        />
      );

      // The type+message appear in a single div — find the div with danger color
      const allNameError = screen.getAllByText(/NameError/);
      // The danger-styled element should be the type+message div (not the trace pre)
      const typeEl = allNameError.find(el => el.style?.color === 'var(--danger)');
      expect(typeEl).toBeTruthy();
      expect(screen.getByText(/name 'x' is undefined/)).toBeInTheDocument();
      expect(screen.getByText(/File "main.py"/)).toBeInTheDocument();
    });
  });

  describe('theme inversion', () => {
    it('applies bg-inverse for output mode', () => {
      /**
       * Contract: output/failure/debug/runtime-error modes use var(--bg-inverse) background.
       * idle uses var(--bg-raised). Theme inversion creates the "dark terminal" aesthetic.
       * Regression: all modes look the same visually.
       */
      const { container } = render(<Drawer mode="output" output={{ lines: [] }} />);
      const outer = container.firstChild as HTMLElement;
      expect(outer).toHaveStyle({ background: 'var(--bg-inverse)' });
    });

    it('applies bg-inverse for failure mode', () => {
      const { container } = render(
        <Drawer mode="failure" failure={{ kind: 'io', io: { stdin: '', expected: '', got: '' } }} />
      );
      const outer = container.firstChild as HTMLElement;
      expect(outer).toHaveStyle({ background: 'var(--bg-inverse)' });
    });

    it('applies bg-inverse for debug mode', () => {
      const { container } = render(
        <Drawer
          mode="debug"
          debug={{ step: 0, total: 1, locals: [], stack: [] }}
        />
      );
      const outer = container.firstChild as HTMLElement;
      expect(outer).toHaveStyle({ background: 'var(--bg-inverse)' });
    });

    it('applies bg-inverse for runtime-error mode', () => {
      const { container } = render(
        <Drawer
          mode="runtime-error"
          runtimeError={{ type: 'E', message: 'm' }}
        />
      );
      const outer = container.firstChild as HTMLElement;
      expect(outer).toHaveStyle({ background: 'var(--bg-inverse)' });
    });

    it('applies bg-raised for idle mode', () => {
      const { container } = render(<Drawer mode="idle" />);
      const outer = container.firstChild as HTMLElement;
      expect(outer).toHaveStyle({ background: 'var(--bg-raised)' });
    });
  });

  describe('closeAction prop', () => {
    it('renders closeAction in header when provided', () => {
      /**
       * Contract: closeAction ReactNode is rendered inside the header row.
       * Used for parent-provided close buttons (e.g., X button to dismiss drawer entirely).
       */
      render(
        <Drawer
          mode="output"
          output={{ lines: [] }}
          closeAction={<button>x</button>}
        />
      );
      expect(screen.getByRole('button', { name: 'x' })).toBeInTheDocument();
    });
  });

  describe('toggle collapsed button', () => {
    it('renders collapse toggle in header and fires onToggleCollapsed', () => {
      const onToggleCollapsed = jest.fn();
      render(
        <Drawer
          mode="output"
          output={{ lines: [] }}
          collapsed={false}
          onToggleCollapsed={onToggleCollapsed}
        />
      );
      const toggleBtn = screen.getByTitle(/collapse/i);
      fireEvent.click(toggleBtn);
      expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    });
  });
});
