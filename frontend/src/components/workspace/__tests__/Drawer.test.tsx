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
import { Drawer, drawerHeight, drawerLabel, drawerStatusColor, drawerAutoSummary } from '../Drawer';
import type { DrawerEdit } from '../Drawer';

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

      // Scrubber fill bar should be at 30% (data-testid="scrubber-fill" is on the fill div)
      const fillBar = screen.getByTestId('scrubber-fill') as HTMLElement;
      expect(fillBar).toHaveStyle({ width: '30%' });
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

  describe('mode=edit-test', () => {
    const ioEdit: DrawerEdit = {
      kind: 'io',
      name: 't1',
      input: '5\n3',
      expected_output: '8',
      match_type: 'exact',
      random_seed: 42,
      lastResult: { stdout: '8\n', passed: true },
    };

    const pytestEdit: DrawerEdit = {
      kind: 'pytest',
      name: 'pytest_test',
      target_path: 'tests/test_foo.py::test_bar',
      test_code: 'def test_bar():\n    assert 1 == 1',
    };

    it('mode=edit-test kind=io renders IO editor with all fields', () => {
      /**
       * Contract: edit-test mode with kind='io' renders stdin, expected_output, match_type select,
       * last-run-got readonly, seed input, and kind pill. Field bindings must be correct.
       * Catches: kind dispatch wrong, field bindings inverted.
       */
      render(
        <Drawer mode="edit-test" edit={ioEdit} />
      );

      // stdin textarea contains the input
      const stdinArea = screen.getByRole('textbox', { name: /stdin/i });
      expect(stdinArea).toHaveValue('5\n3');

      // expected_output textarea
      const expectedArea = screen.getByRole('textbox', { name: /expected stdout/i });
      expect(expectedArea).toHaveValue('8');

      // match_type select shows 'exact'
      const matchSelect = screen.getByRole('combobox', { name: /match type/i });
      expect(matchSelect).toHaveValue('exact');

      // last-run-got readonly textarea shows stdout
      const lastRunArea = screen.getByRole('textbox', { name: /last run/i });
      expect(lastRunArea).toHaveValue('8\n');
      expect(lastRunArea).toHaveAttribute('readOnly');

      // seed input shows "42"
      const seedInput = screen.getByRole('spinbutton', { name: /seed/i });
      expect(seedInput).toHaveValue(42);

      // kind pill shows 'io'
      expect(screen.getByText('io')).toBeInTheDocument();
    });

    it('match_type select offers exactly exact/contains/regex', () => {
      /**
       * Contract: match_type select has exactly three options: exact, contains, regex.
       * Catches: extra/missing values; design's "trim trailing whitespace" / "case-insensitive"
       * checkboxes accidentally landing.
       */
      render(<Drawer mode="edit-test" edit={ioEdit} />);

      const matchSelect = screen.getByRole('combobox', { name: /match type/i });
      const options = Array.from((matchSelect as HTMLSelectElement).options);
      expect(options).toHaveLength(3);
      expect(options.map(o => o.value)).toEqual(['exact', 'contains', 'regex']);
    });

    it('mode=edit-test kind=pytest renders pytest editor; NO imports panel', () => {
      /**
       * Contract: pytest edit renders test_code textarea and target_path input.
       * The imports/fixtures info panel must NOT be rendered (speculative design content).
       * Catches: imports panel slipping in.
       */
      render(<Drawer mode="edit-test" edit={pytestEdit} />);

      const codeArea = screen.getByRole('textbox', { name: /test body/i });
      expect(codeArea).toHaveValue('def test_bar():\n    assert 1 == 1');

      const targetInput = screen.getByRole('textbox', { name: /target/i });
      expect(targetInput).toHaveValue('tests/test_foo.py::test_bar');

      // No imports/fixtures panel
      expect(screen.queryByText(/imports|fixtures available/i)).not.toBeInTheDocument();
    });

    it('seed input present for kind=io, absent for kind=pytest', () => {
      /**
       * Contract: seed input is rendered only for kind='io'. kind='pytest' has no random_seed field.
       * Catches: seed leaking to pytest form.
       */
      // variant-a: kind='io' → seed input present
      const { rerender } = render(<Drawer mode="edit-test" edit={ioEdit} />);
      expect(screen.getByRole('spinbutton', { name: /seed/i })).toBeInTheDocument();

      // variant-b: kind='pytest' → no seed input
      rerender(<Drawer mode="edit-test" edit={pytestEdit} />);
      expect(screen.queryByRole('spinbutton', { name: /seed/i })).not.toBeInTheDocument();
    });

    it('field edits propagate via onEditChange', () => {
      /**
       * Contract: changing a field in the IO editor calls onEditChange with the full updated shape.
       * input field changing from 'a' to 'b' must produce shape with input='b' and other fields unchanged.
       * Catches: onEditChange not wired.
       */
      const onEditChange = jest.fn();
      const simpleEdit: DrawerEdit = {
        kind: 'io',
        name: 'test1',
        input: 'a',
        expected_output: 'out',
        match_type: 'exact',
      };
      render(<Drawer mode="edit-test" edit={simpleEdit} onEditChange={onEditChange} />);

      const stdinArea = screen.getByRole('textbox', { name: /stdin/i });
      fireEvent.change(stdinArea, { target: { value: 'b' } });

      expect(onEditChange).toHaveBeenCalledTimes(1);
      const called = onEditChange.mock.calls[0][0] as DrawerEdit;
      expect(called.kind).toBe('io');
      if (called.kind === 'io') {
        expect(called.input).toBe('b');
        expect(called.expected_output).toBe('out');
        expect(called.name).toBe('test1');
        expect(called.match_type).toBe('exact');
      }
    });

    it('mode switch resets edit state from prop', () => {
      /**
       * Contract: when the edit prop changes (different test), local state must reset from new prop.
       * Switching mode away and back with a new edit should show the new test's values.
       * Catches: stale local state retained when parent passes different test.
       */
      const editA: DrawerEdit = {
        kind: 'io',
        name: 'testA',
        input: 'input-A',
        expected_output: 'output-A',
        match_type: 'exact',
      };
      const editB: DrawerEdit = {
        kind: 'io',
        name: 'testB',
        input: 'input-B',
        expected_output: 'output-B',
        match_type: 'contains',
      };

      const { rerender } = render(<Drawer mode="edit-test" edit={editA} />);
      // Confirm editA is shown
      expect(screen.getByRole('textbox', { name: /stdin/i })).toHaveValue('input-A');

      // Switch to output mode (no edit prop)
      rerender(<Drawer mode="output" />);
      expect(screen.queryByRole('textbox', { name: /stdin/i })).not.toBeInTheDocument();

      // Switch back to edit-test with editB
      rerender(<Drawer mode="edit-test" edit={editB} />);
      expect(screen.getByRole('textbox', { name: /stdin/i })).toHaveValue('input-B');
      expect(screen.getByRole('textbox', { name: /expected stdout/i })).toHaveValue('output-B');
      expect(screen.getByRole('combobox', { name: /match type/i })).toHaveValue('contains');
    });

    it('Drawer utility functions return edit-test-specific values', () => {
      /**
       * Contract: drawerHeight, drawerLabel, drawerStatusColor, drawerAutoSummary must handle
       * 'edit-test' mode. Without this, the mode falls through to idle defaults (30px bar, 'Console' label).
       * Catches: any utility-fn fall-through to idle defaults.
       */
      expect(drawerHeight('edit-test')).toBe(260);
      expect(drawerLabel('edit-test')).toBe('Test body');
      expect(drawerStatusColor('edit-test', undefined, undefined)).toBe('var(--accent)');
      expect(drawerAutoSummary('edit-test', undefined, undefined, undefined)).toBe('editing test body');
    });

    it('mode=edit-test rendered drawer is full-height (not 30px collapsed bar)', () => {
      /**
       * Contract: edit-test mode must render at height 260, not the idle 30px bar.
       * Catches: visual regression from utility-fn miss (edit-test falls through to idle height).
       */
      const { container } = render(<Drawer mode="edit-test" edit={ioEdit} />);
      const outer = container.firstChild as HTMLElement;
      expect(outer).toHaveStyle({ height: '260px' });
    });
  });
});
