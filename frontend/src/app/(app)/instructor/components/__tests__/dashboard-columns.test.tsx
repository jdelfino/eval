/**
 * Smoke tests for the four G4 dashboard column placeholders (T6).
 *
 * Contract verified: each column renders its locked data-testid and accepts the
 * FINAL prop contract that T7-T10 will fill in. This catches contract drift
 * before the real internals land, and pins the FocusedStudentPanel empty-state
 * hint (the only placeholder with required interactive behavior).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { InstructorRoster } from '../InstructorRoster';
import { ClassMinimap } from '../ClassMinimap';
import { SignalsPanel } from '../SignalsPanel';
import { FocusedStudentPanel } from '../FocusedStudentPanel';

const students = [{ id: 's1', name: 'Alice', has_code: true }];
const realtimeStudents = [{ id: 's1', name: 'Alice', code: 'x = 1' }];
const enrolled = [{ user_id: 's1', name: 'Alice' }, { user_id: 's2', name: 'Bob' }];
const noop = jest.fn();

describe('InstructorRoster placeholder', () => {
  it('renders its testid and accepts the full contract (incl. featured_student_id)', () => {
    render(
      <InstructorRoster
        students={students}
        realtimeStudents={realtimeStudents}
        enrolled={enrolled}
        focusedStudentId={null}
        featured_student_id="s1"
        onFocusStudent={noop}
      />
    );
    expect(screen.getByTestId('instructor-roster')).toBeInTheDocument();
  });
});

describe('ClassMinimap placeholder', () => {
  it('renders its testid and accepts the full contract', () => {
    render(
      <ClassMinimap
        realtimeStudents={realtimeStudents}
        enrolled={enrolled}
        focusedStudentId={null}
        onFocusStudent={noop}
      />
    );
    expect(screen.getByTestId('class-minimap')).toBeInTheDocument();
  });
});

describe('SignalsPanel placeholder', () => {
  it('renders its testid and accepts the full contract', () => {
    render(
      <SignalsPanel
        session_id="session-1"
        realtimeStudents={realtimeStudents}
        enrolled={enrolled}
        onFocusStudent={noop}
      />
    );
    expect(screen.getByTestId('signals-panel')).toBeInTheDocument();
  });
});

describe('FocusedStudentPanel placeholder', () => {
  const baseProps = {
    session_id: 'session-1',
    students,
    realtimeStudents,
    onClose: noop,
    onFocusStudent: noop,
    onShowOnPublicView: noop,
    onViewHistory: noop,
    onExecuteCode: jest.fn().mockResolvedValue(undefined),
    featured_student_id: null,
    sessionProblem: null,
    sessionTestCases: [],
  };

  it('renders its testid and accepts the full contract', () => {
    render(<FocusedStudentPanel {...baseProps} focusedStudentId="s1" />);
    expect(screen.getByTestId('focused-student-panel')).toBeInTheDocument();
  });

  it('shows the FocusedEmpty hint with esc/enter pills when nothing is focused', () => {
    render(<FocusedStudentPanel {...baseProps} focusedStudentId={null} />);
    expect(screen.getByTestId('focused-empty')).toBeInTheDocument();
    expect(screen.getByText('No student focused')).toBeInTheDocument();
    expect(screen.getByText(/open selected/)).toBeInTheDocument();
    expect(screen.getByText(/esc close/)).toBeInTheDocument();
  });
});
