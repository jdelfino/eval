/**
 * Unit tests for classes/components/ClassList (student-count-free card grid).
 *
 * Contracts verified:
 * - One card per class with class name and description rendered
 * - Sections listed inside each card with name and join code
 * - Footer actions "+ Section" and "Edit" present per card
 * - "+ Section" footer button triggers the onCreateSection callback for that class
 * - Empty state shows when no classes are passed
 * - No live pill rendered (payload has no live-session signal on sections/classes list)
 *
 * Why it matters: the card grid replaces the old link-based ClassList;
 * these tests catch regressions in flow wiring during the grid conversion.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ClassList from '../ClassList';
import type { Class, Section } from '@/types/api';

// Mock next/link
jest.mock('next/link', () => {
  return ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

// Mock join-code formatting
jest.mock('@/lib/join-code', () => ({
  formatJoinCodeForDisplay: (code: string) => code,
}));

const makeClass = (overrides: Partial<Class> = {}): Class => ({
  id: 'class-1',
  namespace_id: 'ns-1',
  name: 'CS A — Intro',
  description: 'Python fundamentals',
  created_by: 'user-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

const makeSection = (overrides: Partial<Section> = {}): Section => ({
  id: 'section-1',
  namespace_id: 'ns-1',
  class_id: 'class-1',
  name: 'Period 1',
  semester: 'Fall 2025',
  join_code: 'K3X9P2',
  active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

describe('ClassList (classes route card grid)', () => {
  const onCreateNew = jest.fn();
  const onCreateSection = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when no classes are provided', () => {
    render(
      <ClassList
        classes={[]}
        onCreateNew={onCreateNew}
        onCreateSection={onCreateSection}
        sectionsByClass={{}}
      />
    );
    expect(screen.getByText(/no classes/i)).toBeInTheDocument();
  });

  it('renders one card per class with name and description', () => {
    const classes = [
      makeClass({ id: 'class-1', name: 'CS A — Intro', description: 'Python fundamentals' }),
      makeClass({ id: 'class-2', name: 'CS B — Data structures', description: 'Lists and dicts' }),
    ];
    render(
      <ClassList
        classes={classes}
        onCreateNew={onCreateNew}
        onCreateSection={onCreateSection}
        sectionsByClass={{}}
      />
    );

    expect(screen.getByText('CS A — Intro')).toBeInTheDocument();
    expect(screen.getByText('Python fundamentals')).toBeInTheDocument();
    expect(screen.getByText('CS B — Data structures')).toBeInTheDocument();
    expect(screen.getByText('Lists and dicts')).toBeInTheDocument();
  });

  it('renders sections inside each class card with name and join code', () => {
    const classes = [makeClass({ id: 'class-1', name: 'CS A — Intro' })];
    const sectionsByClass: Record<string, Section[]> = {
      'class-1': [
        makeSection({ id: 'sec-1', name: 'Period 1', join_code: 'K3X9P2' }),
        makeSection({ id: 'sec-2', name: 'Period 3', join_code: 'K7M2A9' }),
      ],
    };

    render(
      <ClassList
        classes={classes}
        onCreateNew={onCreateNew}
        onCreateSection={onCreateSection}
        sectionsByClass={sectionsByClass}
      />
    );

    expect(screen.getByText('Period 1')).toBeInTheDocument();
    expect(screen.getByText('K3X9P2')).toBeInTheDocument();
    expect(screen.getByText('Period 3')).toBeInTheDocument();
    expect(screen.getByText('K7M2A9')).toBeInTheDocument();
  });

  it('renders "+ Section" and "Edit" footer actions per card', () => {
    const classes = [
      makeClass({ id: 'class-1', name: 'CS A' }),
      makeClass({ id: 'class-2', name: 'CS B' }),
    ];
    render(
      <ClassList
        classes={classes}
        onCreateNew={onCreateNew}
        onCreateSection={onCreateSection}
        sectionsByClass={{}}
      />
    );

    // Two cards = two "+ Section" buttons and two "Edit" buttons
    const sectionButtons = screen.getAllByRole('button', { name: /section/i });
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    expect(sectionButtons).toHaveLength(2);
    expect(editButtons).toHaveLength(2);
  });

  it('+ Section button triggers onCreateSection with the correct class id', () => {
    /**
     * Contract: clicking "+ Section" in a class card calls onCreateSection(classId),
     * not a generic callback. This ensures the create-section flow targets the right class.
     */
    const classes = [
      makeClass({ id: 'class-1', name: 'CS A' }),
      makeClass({ id: 'class-2', name: 'CS B' }),
    ];
    render(
      <ClassList
        classes={classes}
        onCreateNew={onCreateNew}
        onCreateSection={onCreateSection}
        sectionsByClass={{}}
      />
    );

    const sectionButtons = screen.getAllByRole('button', { name: /section/i });
    // Click the second card's "+ Section" button
    fireEvent.click(sectionButtons[1]);

    expect(onCreateSection).toHaveBeenCalledWith('class-2');
    expect(onCreateSection).toHaveBeenCalledTimes(1);
  });

  it('does not render a live pill (payload has no live-session signal)', () => {
    /**
     * Contract: The classes list payload (Class[]) carries no live-session signal.
     * Rendering a live pill would require invented data; it must not appear.
     */
    const classes = [makeClass({ id: 'class-1', name: 'CS A' })];
    const sectionsByClass: Record<string, Section[]> = {
      'class-1': [makeSection({ id: 'sec-1', name: 'Period 1', active: true })],
    };
    render(
      <ClassList
        classes={classes}
        onCreateNew={onCreateNew}
        onCreateSection={onCreateSection}
        sectionsByClass={sectionsByClass}
      />
    );

    expect(screen.queryByText(/live/i)).not.toBeInTheDocument();
  });
});
