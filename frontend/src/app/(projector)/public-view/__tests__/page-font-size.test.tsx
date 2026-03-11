/**
 * Tests for public-view font size controls.
 *
 * Separated from page.test.tsx because this file mocks useRealtimePublicView
 * directly (module-level mock), while the main test file drives state through
 * fetch mocks.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: jest.fn((key: string) => (key === 'session_id' ? 'test-session-id' : null))
  })),
}));

// Mock ProtectedRoute to bypass auth
jest.mock('@/components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock useHeaderSlot
jest.mock('@/contexts/HeaderSlotContext', () => ({
  useHeaderSlot: () => ({ setHeaderSlot: jest.fn() }),
}));

// Mock useApiDebugger hook
jest.mock('@/hooks/useApiDebugger', () => ({
  useApiDebugger: () => ({
    trace: null,
    currentStep: 0,
    isLoading: false,
    error: null,
    requestTrace: jest.fn(),
    setTrace: jest.fn(),
    setError: jest.fn(),
    stepForward: jest.fn(),
    stepBackward: jest.fn(),
    jumpToStep: jest.fn(),
    jumpToFirst: jest.fn(),
    jumpToLast: jest.fn(),
    reset: jest.fn(),
    getCurrentStep: jest.fn(),
    getCurrentLocals: jest.fn(),
    getCurrentGlobals: jest.fn(),
    getCurrentCallStack: jest.fn(),
    getPreviousStep: jest.fn(),
    total_steps: 0,
    hasTrace: false,
    canStepForward: false,
    canStepBackward: false,
  }),
}));

// Mock ConnectionStatus
jest.mock('@/components/ConnectionStatus', () => ({
  ConnectionStatus: () => null,
}));

// Track props passed to CodeEditor
let lastCodeEditorProps: any = null;

// Mock CodeEditor component
jest.mock('@/app/(fullscreen)/student/components/CodeEditor', () => {
  return function MockCodeEditor(props: any) {
    lastCodeEditorProps = props;
    return (
      <div data-testid="code-editor">
        <div data-testid="code-title">{props.title}</div>
        <div data-testid="code-content">{props.code}</div>
      </div>
    );
  };
});

// Mock useRealtimePublicView to return a loaded state
const mockUseRealtimePublicView = jest.fn();
jest.mock('@/hooks/useRealtimePublicView', () => ({
  useRealtimePublicView: (...args: any[]) => mockUseRealtimePublicView(...args),
}));

const loadedState = {
  state: {
    join_code: 'ABC-123',
    problem: {
      title: 'Test Problem',
      description: 'A test problem',
      starter_code: null,
      language: 'python',
    },
    featured_student_id: null,
    featured_code: null,
    status: 'active',
    featured_execution_settings: null,
  },
  loading: false,
  error: null,
  connectionStatus: 'connected',
  connectionError: null,
};

describe('PublicInstructorView font size controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    lastCodeEditorProps = null;
    mockUseRealtimePublicView.mockReturnValue(loadedState);
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('renders font size increase and decrease buttons', () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(screen.getByLabelText('Increase font size')).toBeInTheDocument();
    expect(screen.getByLabelText('Decrease font size')).toBeInTheDocument();
  });

  test('passes default fontSize of 24 to CodeEditor', () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastCodeEditorProps).toBeTruthy();
    expect(lastCodeEditorProps.fontSize).toBe(24);
  });

  test('increases fontSize when + button is clicked', async () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastCodeEditorProps.fontSize).toBe(24);

    await act(async () => {
      screen.getByLabelText('Increase font size').click();
    });

    expect(lastCodeEditorProps.fontSize).toBeGreaterThan(24);
  });

  test('decreases fontSize when - button is clicked', async () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastCodeEditorProps.fontSize).toBe(24);

    await act(async () => {
      screen.getByLabelText('Decrease font size').click();
    });

    expect(lastCodeEditorProps.fontSize).toBeLessThan(24);
  });

  test('persists fontSize to localStorage when changed', async () => {
    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    await act(async () => {
      screen.getByLabelText('Increase font size').click();
    });

    const stored = localStorage.getItem('publicView_fontSize');
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(24);
  });

  test('loads fontSize from localStorage on mount', () => {
    localStorage.setItem('publicView_fontSize', '32');

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastCodeEditorProps).toBeTruthy();
    expect(lastCodeEditorProps.fontSize).toBe(32);
  });

  test('does not increase fontSize beyond maximum', async () => {
    localStorage.setItem('publicView_fontSize', '48');

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastCodeEditorProps.fontSize).toBe(48);

    await act(async () => {
      screen.getByLabelText('Increase font size').click();
    });

    expect(lastCodeEditorProps.fontSize).toBe(48);
  });

  test('does not decrease fontSize below minimum', async () => {
    localStorage.setItem('publicView_fontSize', '12');

    const PublicInstructorView = require('../page').default;
    render(<PublicInstructorView />);

    expect(lastCodeEditorProps.fontSize).toBe(12);

    await act(async () => {
      screen.getByLabelText('Decrease font size').click();
    });

    expect(lastCodeEditorProps.fontSize).toBe(12);
  });
});
