/**
 * Unit tests for ProblemPropertiesBar.
 * @jest-environment jsdom
 *
 * Contract: ProblemPropertiesBar renders Class, Language, and Tag chip-buttons.
 * Selecting a class or language fires onChangeProperties with the full state triple
 * (class id | null, language backend value, tags). Tag editing (add/remove/backspace)
 * also fires the callback with updated tags. Regressions break author problem editing.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProblemPropertiesBar } from '../ProblemPropertiesBar';

const classes = [
  { id: 'c1', name: 'Algorithms 201' },
  { id: 'c2', name: 'Data Structures' },
];

const defaultProps = {
  problemClass: { id: 'c1', name: 'Algorithms 201' },
  classes,
  problemLanguage: 'python' as const,
  problemTags: [],
  onChangeProperties: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// Test 1: Class chip renders label + value + caret
it('renders CLASS label, class name value, and caret', () => {
  render(<ProblemPropertiesBar {...defaultProps} />);
  expect(screen.getByText('CLASS')).toBeInTheDocument();
  expect(screen.getByText('Algorithms 201')).toBeInTheDocument();
  // caret is rendered as ▾ symbol
  expect(screen.getAllByText('▾').length).toBeGreaterThan(0);
});

// Test 2: Class selection fires onChangeProperties with full triple
it('fires onChangeProperties with full triple when class is selected', () => {
  const onChangeProperties = jest.fn();
  render(
    <ProblemPropertiesBar
      {...defaultProps}
      problemLanguage="python"
      problemTags={['hashing']}
      onChangeProperties={onChangeProperties}
    />
  );

  // Click class chip to open menu
  fireEvent.click(screen.getByRole('button', { name: /CLASS/i }));

  // Select c2 from menu
  fireEvent.click(screen.getByRole('menuitem', { name: 'Data Structures' }));

  expect(onChangeProperties).toHaveBeenCalledTimes(1);
  expect(onChangeProperties).toHaveBeenCalledWith({
    class: 'c2',
    language: 'python',
    tags: ['hashing'],
  });
});

// Test 3: Language menu shows exactly Python 3.11 + Java 21
it('language menu shows exactly Python 3.11 and Java 21', () => {
  render(<ProblemPropertiesBar {...defaultProps} />);

  fireEvent.click(screen.getByRole('button', { name: /LANGUAGE/i }));

  const items = screen.getAllByRole('menuitem');
  const labels = items.map((i) => i.textContent);
  expect(labels).toContain('Python 3.11');
  expect(labels).toContain('Java 21');
  expect(items.length).toBe(2);
});

// Test 4: Language selection fires backend value (not display string)
it('fires language:"java" (not "Java 21") when Java 21 is selected', () => {
  const onChangeProperties = jest.fn();
  render(
    <ProblemPropertiesBar
      {...defaultProps}
      problemClass={{ id: 'c1', name: 'Algorithms 201' }}
      problemLanguage="python"
      problemTags={[]}
      onChangeProperties={onChangeProperties}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: /LANGUAGE/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Java 21' }));

  expect(onChangeProperties).toHaveBeenCalledTimes(1);
  expect(onChangeProperties).toHaveBeenCalledWith({
    class: 'c1',
    language: 'java',
    tags: [],
  });
});

// Test 5: Tag chips render with # prefix and + tag affordance is present
it('renders tag chips with # prefix and the + tag affordance', () => {
  render(
    <ProblemPropertiesBar
      {...defaultProps}
      problemTags={['hashing', 'arrays']}
    />
  );

  expect(screen.getByText('#hashing')).toBeInTheDocument();
  expect(screen.getByText('#arrays')).toBeInTheDocument();
  expect(screen.getByText('+ tag')).toBeInTheDocument();
});

// Test 6: Inline tag-add comma-separated
it('adds comma-separated tags on Enter and calls onChangeProperties', async () => {
  const onChangeProperties = jest.fn();
  const user = userEvent.setup();

  render(
    <ProblemPropertiesBar
      {...defaultProps}
      problemTags={['a']}
      onChangeProperties={onChangeProperties}
    />
  );

  // Click + tag to open inline input
  fireEvent.click(screen.getByText('+ tag'));

  const input = screen.getByRole('textbox');
  await user.type(input, 'graph,bfs');
  await user.keyboard('{Enter}');

  expect(onChangeProperties).toHaveBeenCalledTimes(1);
  expect(onChangeProperties).toHaveBeenCalledWith({
    class: 'c1',
    language: 'python',
    tags: ['a', 'graph', 'bfs'],
  });
});

// Test 7: Backspace on empty input removes last tag
it('removes last tag when Backspace pressed on empty input', async () => {
  const onChangeProperties = jest.fn();
  const user = userEvent.setup();

  render(
    <ProblemPropertiesBar
      {...defaultProps}
      problemTags={['a', 'b']}
      onChangeProperties={onChangeProperties}
    />
  );

  fireEvent.click(screen.getByText('+ tag'));

  const input = screen.getByRole('textbox');
  // input is empty, press Backspace
  await user.keyboard('{Backspace}');

  expect(onChangeProperties).toHaveBeenCalledTimes(1);
  expect(onChangeProperties).toHaveBeenCalledWith({
    class: 'c1',
    language: 'python',
    tags: ['a'],
  });
});

// Test 8: Click x on tag chip removes it
it('removes a tag when its x button is clicked', () => {
  const onChangeProperties = jest.fn();

  render(
    <ProblemPropertiesBar
      {...defaultProps}
      problemTags={['a', 'b', 'c']}
      onChangeProperties={onChangeProperties}
    />
  );

  // Each tag chip has an × button; find the one for 'b'
  const removeButtons = screen.getAllByRole('button', { name: /×/ });
  // chips are rendered in order: a, b, c — so index 1 is 'b'
  fireEvent.click(removeButtons[1]);

  expect(onChangeProperties).toHaveBeenCalledTimes(1);
  expect(onChangeProperties).toHaveBeenCalledWith({
    class: 'c1',
    language: 'python',
    tags: ['a', 'c'],
  });
});
