/**
 * Tests for Instructor Dashboard Page
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isLoading: false }),
}));

// Mock LayoutConfigContext to verify useForceDesktopLayout is called for zoom protection
const mockUseForceDesktopLayout = jest.fn();
jest.mock('@/contexts/LayoutConfigContext', () => ({
  useLayoutConfig: () => ({ forceDesktop: false, setForceDesktop: jest.fn() }),
  useForceDesktopLayout: () => mockUseForceDesktopLayout(),
}));

// Mock InstructorDashboard to avoid deep dependency tree
jest.mock('../components/InstructorDashboard', () => ({
  InstructorDashboard: function MockInstructorDashboard({
    onStartSession,
    onRejoinSession,
  }: any) {
    return (
      <div data-testid="instructor-dashboard">
        <button
          onClick={() => onStartSession('section-1', 'Morning Section')}
          data-testid="start-session-btn"
        >
          Start Session
        </button>
        <button
          onClick={() => onRejoinSession('session-123')}
          data-testid="rejoin-session-btn"
        >
          Rejoin Session
        </button>
      </div>
    );
  },
}));

// NamespaceHeader has been removed from this page (moved into Sidebar) — no mock needed.

// Mock StartSessionModal
jest.mock('../components/StartSessionModal', () => {
  return function MockStartSessionModal({ onClose, onSessionCreated, section_name }: any) {
    return (
      <div data-testid="start-session-modal">
        <span data-testid="modal-section-name">{section_name}</span>
        <button onClick={onClose} data-testid="close-modal-btn">Close</button>
        <button onClick={() => onSessionCreated('new-session-456')} data-testid="session-created-btn">
          Create
        </button>
      </div>
    );
  };
});

import InstructorPageWrapper from '../page';

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockReset();
});

describe('InstructorPage', () => {
  describe('Zoom Protection (forceDesktop)', () => {
    it('calls useForceDesktopLayout to prevent browser zoom from collapsing sidebar', () => {
      render(<InstructorPageWrapper />);

      expect(mockUseForceDesktopLayout).toHaveBeenCalled();
    });
  });

  describe('rendering', () => {
    it('renders the instructor dashboard', () => {
      render(<InstructorPageWrapper />);

      expect(screen.getByTestId('instructor-dashboard')).toBeInTheDocument();
    });

    /**
     * TC6: Instructor page no longer renders <NamespaceHeader>.
     * Contract: namespace display belongs in Sidebar, not in the page body.
     * Catches: incomplete removal of NamespaceHeader from page.
     */
    it('does not render namespace-header in the page body', () => {
      render(<InstructorPageWrapper />);

      expect(screen.queryByTestId('namespace-header')).not.toBeInTheDocument();
    });

    it('does not show start session modal initially', () => {
      render(<InstructorPageWrapper />);

      expect(screen.queryByTestId('start-session-modal')).not.toBeInTheDocument();
    });
  });

  describe('start session flow', () => {
    it('shows start session modal when start session is triggered', () => {
      render(<InstructorPageWrapper />);

      fireEvent.click(screen.getByTestId('start-session-btn'));

      expect(screen.getByTestId('start-session-modal')).toBeInTheDocument();
      expect(screen.getByTestId('modal-section-name')).toHaveTextContent('Morning Section');
    });

    it('hides modal when close is clicked', () => {
      render(<InstructorPageWrapper />);

      fireEvent.click(screen.getByTestId('start-session-btn'));
      expect(screen.getByTestId('start-session-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('close-modal-btn'));

      expect(screen.queryByTestId('start-session-modal')).not.toBeInTheDocument();
    });

    it('navigates to new session and closes modal when session is created', async () => {
      render(<InstructorPageWrapper />);

      fireEvent.click(screen.getByTestId('start-session-btn'));
      fireEvent.click(screen.getByTestId('session-created-btn'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/instructor/session/new-session-456');
      });
      expect(screen.queryByTestId('start-session-modal')).not.toBeInTheDocument();
    });
  });

  describe('rejoin session flow', () => {
    it('navigates to session when rejoin is triggered', () => {
      render(<InstructorPageWrapper />);

      fireEvent.click(screen.getByTestId('rejoin-session-btn'));

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-123');
    });
  });
});
