/**
 * Tests for IOCaseForm component
 *
 * Tests I/O case list editing:
 * - Render empty list with add button
 * - Render existing cases
 * - Add a new case
 * - Remove a case
 * - Reorder cases (move up/down)
 * - Edit case fields: name, input, expected_output, random_seed, attached_files
 * - Visual distinction: cases with expected_output labeled as "Test Case",
 *   cases without labeled as "Example Input"
 * - onChange callback called with updated cases
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import IOCaseForm from '../IOCaseForm';
import type { IOTestCase } from '@/types/problem';

const makeCase = (overrides: Partial<IOTestCase> = {}): IOTestCase => ({
  name: 'Case 1',
  input: '',
  match_type: 'exact',
  order: 0,
  ...overrides,
});

describe('IOCaseForm', () => {
  describe('Empty state', () => {
    it('should render an add button when no cases exist', () => {
      render(<IOCaseForm cases={[]} onChange={jest.fn()} />);
      expect(screen.getByRole('button', { name: /add case/i })).toBeInTheDocument();
    });

    it('should render an empty cases section heading', () => {
      render(<IOCaseForm cases={[]} onChange={jest.fn()} />);
      expect(screen.getByText(/test cases/i)).toBeInTheDocument();
    });

    it('should show empty state message when no cases', () => {
      render(<IOCaseForm cases={[]} onChange={jest.fn()} />);
      expect(screen.getByText(/no cases defined/i)).toBeInTheDocument();
    });
  });

  describe('Rendering cases', () => {
    it('should render a case with its name', () => {
      const cases = [makeCase({ name: 'Hello World', order: 0 })];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);
      expect(screen.getByDisplayValue('Hello World')).toBeInTheDocument();
    });

    it('should render multiple cases', () => {
      const cases = [
        makeCase({ name: 'Case A', order: 0 }),
        makeCase({ name: 'Case B', order: 1 }),
      ];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);
      expect(screen.getByDisplayValue('Case A')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Case B')).toBeInTheDocument();
    });

    it('should display case input (stdin)', () => {
      const cases = [makeCase({ input: 'hello world', order: 0 })];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);
      expect(screen.getByDisplayValue('hello world')).toBeInTheDocument();
    });

    it('should display expected_output when set', () => {
      const cases = [makeCase({ expected_output: 'Hello, World!', order: 0 })];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);
      expect(screen.getByDisplayValue('Hello, World!')).toBeInTheDocument();
    });
  });

  describe('Visual distinction: Test Case vs Example Input', () => {
    it('should label a case with expected_output as "Test Case"', () => {
      const cases = [makeCase({ expected_output: 'expected', order: 0 })];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);
      expect(screen.getByText('Test Case')).toBeInTheDocument();
    });

    it('should label a case without expected_output as "Example Input"', () => {
      const cases = [makeCase({ order: 0 })]; // no expected_output
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);
      expect(screen.getByText('Example Input')).toBeInTheDocument();
    });

    it('should label a case with empty expected_output as "Example Input"', () => {
      const cases = [makeCase({ expected_output: '', order: 0 })];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);
      expect(screen.getByText('Example Input')).toBeInTheDocument();
    });

    it('should show both labels when mixed cases exist', () => {
      const cases = [
        makeCase({ name: 'A', expected_output: 'out', order: 0 }),
        makeCase({ name: 'B', order: 1 }),
      ];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);
      expect(screen.getByText('Test Case')).toBeInTheDocument();
      expect(screen.getByText('Example Input')).toBeInTheDocument();
    });
  });

  describe('Add case', () => {
    it('should call onChange with a new empty case when add button is clicked', () => {
      const onChange = jest.fn();
      render(<IOCaseForm cases={[]} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: /add case/i }));

      expect(onChange).toHaveBeenCalledTimes(1);
      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases).toHaveLength(1);
      expect(newCases[0]).toMatchObject({
        name: expect.any(String),
        input: '',
        match_type: 'exact',
        order: 0,
      });
    });

    it('should append a new case after existing cases', () => {
      const onChange = jest.fn();
      const existing = [makeCase({ name: 'Existing', order: 0 })];
      render(<IOCaseForm cases={existing} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: /add case/i }));

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases).toHaveLength(2);
      expect(newCases[0].name).toBe('Existing');
      expect(newCases[1].order).toBe(1);
    });
  });

  describe('Remove case', () => {
    it('should call onChange with case removed when delete button is clicked', () => {
      const onChange = jest.fn();
      const cases = [
        makeCase({ name: 'Case A', order: 0 }),
        makeCase({ name: 'Case B', order: 1 }),
      ];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      const removeButtons = screen.getAllByRole('button', { name: /remove case/i });
      fireEvent.click(removeButtons[0]);

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases).toHaveLength(1);
      expect(newCases[0].name).toBe('Case B');
    });

    it('should reindex order after removal', () => {
      const onChange = jest.fn();
      const cases = [
        makeCase({ name: 'A', order: 0 }),
        makeCase({ name: 'B', order: 1 }),
        makeCase({ name: 'C', order: 2 }),
      ];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      const removeButtons = screen.getAllByRole('button', { name: /remove case/i });
      fireEvent.click(removeButtons[0]); // remove "A"

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases[0].order).toBe(0);
      expect(newCases[1].order).toBe(1);
    });
  });

  describe('Reorder cases', () => {
    it('should show move-up button for non-first cases', () => {
      const cases = [
        makeCase({ name: 'A', order: 0 }),
        makeCase({ name: 'B', order: 1 }),
      ];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);

      const moveUpButtons = screen.getAllByRole('button', { name: /move up/i });
      // Only the second case should have a functional move-up button
      expect(moveUpButtons).toHaveLength(1);
    });

    it('should show move-down button for non-last cases', () => {
      const cases = [
        makeCase({ name: 'A', order: 0 }),
        makeCase({ name: 'B', order: 1 }),
      ];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);

      const moveDownButtons = screen.getAllByRole('button', { name: /move down/i });
      // Only the first case should have a functional move-down button
      expect(moveDownButtons).toHaveLength(1);
    });

    it('should swap cases when move-up is clicked', () => {
      const onChange = jest.fn();
      const cases = [
        makeCase({ name: 'A', order: 0 }),
        makeCase({ name: 'B', order: 1 }),
      ];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: /move up/i }));

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases[0].name).toBe('B');
      expect(newCases[1].name).toBe('A');
      expect(newCases[0].order).toBe(0);
      expect(newCases[1].order).toBe(1);
    });

    it('should swap cases when move-down is clicked', () => {
      const onChange = jest.fn();
      const cases = [
        makeCase({ name: 'A', order: 0 }),
        makeCase({ name: 'B', order: 1 }),
      ];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: /move down/i }));

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases[0].name).toBe('B');
      expect(newCases[1].name).toBe('A');
    });
  });

  describe('Edit case fields', () => {
    it('should call onChange when name is edited', () => {
      const onChange = jest.fn();
      const cases = [makeCase({ name: 'Old Name', order: 0 })];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      fireEvent.change(screen.getByDisplayValue('Old Name'), {
        target: { value: 'New Name' },
      });

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases[0].name).toBe('New Name');
    });

    it('should call onChange when input is edited', () => {
      const onChange = jest.fn();
      const cases = [makeCase({ input: '', order: 0 })];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      const inputTextarea = screen.getByLabelText(/stdin|input/i);
      fireEvent.change(inputTextarea, { target: { value: 'test input' } });

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases[0].input).toBe('test input');
    });

    it('should call onChange when expected_output is edited', () => {
      const onChange = jest.fn();
      const cases = [makeCase({ expected_output: '', order: 0 })];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      const outputTextarea = screen.getByLabelText(/expected output/i);
      fireEvent.change(outputTextarea, { target: { value: 'expected result' } });

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases[0].expected_output).toBe('expected result');
    });

    it('should show expected_output field (optional) for each case', () => {
      const cases = [makeCase({ order: 0 })];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);
      expect(screen.getByLabelText(/expected output/i)).toBeInTheDocument();
    });

    it('should call onChange when random_seed is edited', () => {
      const onChange = jest.fn();
      const cases = [makeCase({ order: 0 })];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      const seedInput = screen.getByLabelText(/random seed/i);
      fireEvent.change(seedInput, { target: { value: '42' } });

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases[0].random_seed).toBe(42);
    });

    it('should set random_seed to undefined when field is cleared', () => {
      const onChange = jest.fn();
      const cases = [makeCase({ random_seed: 42, order: 0 })];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      const seedInput = screen.getByLabelText(/random seed/i);
      fireEvent.change(seedInput, { target: { value: '' } });

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases[0].random_seed).toBeUndefined();
    });

    it('should not modify other cases when editing one case', () => {
      const onChange = jest.fn();
      const cases = [
        makeCase({ name: 'A', order: 0 }),
        makeCase({ name: 'B', order: 1 }),
      ];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      fireEvent.change(screen.getByDisplayValue('A'), { target: { value: 'A-modified' } });

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases[0].name).toBe('A-modified');
      expect(newCases[1].name).toBe('B');
    });
  });

  describe('Match type', () => {
    it('should render match_type selector with exact, contains, regex options', () => {
      const cases = [makeCase({ order: 0 })];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} />);

      const select = screen.getByLabelText(/match type/i);
      expect(select).toBeInTheDocument();

      const options = within(select as HTMLElement).getAllByRole('option');
      const optionValues = options.map((o) => (o as HTMLOptionElement).value);
      expect(optionValues).toContain('exact');
      expect(optionValues).toContain('contains');
      expect(optionValues).toContain('regex');
    });

    it('should call onChange when match_type is changed', () => {
      const onChange = jest.fn();
      const cases = [makeCase({ match_type: 'exact', order: 0 })];
      render(<IOCaseForm cases={cases} onChange={onChange} />);

      fireEvent.change(screen.getByLabelText(/match type/i), {
        target: { value: 'contains' },
      });

      const newCases = onChange.mock.calls[0][0] as IOTestCase[];
      expect(newCases[0].match_type).toBe('contains');
    });
  });

  describe('Props', () => {
    it('should accept a label prop for the section heading', () => {
      render(
        <IOCaseForm cases={[]} onChange={jest.fn()} label="I/O Cases" />
      );
      expect(screen.getByText('I/O Cases')).toBeInTheDocument();
    });

    it('should be read-only when readOnly prop is true', () => {
      const cases = [makeCase({ name: 'Readonly Case', order: 0 })];
      render(<IOCaseForm cases={cases} onChange={jest.fn()} readOnly />);

      // No add/remove/reorder buttons
      expect(screen.queryByRole('button', { name: /add case/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /remove case/i })).not.toBeInTheDocument();
    });
  });
});
