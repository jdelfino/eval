/**
 * Tests for PreviewBanner component
 *
 * Tests:
 * - Renders when preview is active with informational text
 * - Renders "Exit Preview" button
 * - Calls exitPreview when Exit Preview button is clicked
 * - Does not render when preview is not active
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewBanner } from '../PreviewBanner';

// Mock usePreview hook
const mockExitPreview = jest.fn();
const mockIsPreview = jest.fn();

jest.mock('@/contexts/PreviewContext', () => ({
  usePreview: () => ({
    isPreview: mockIsPreview(),
    exitPreview: mockExitPreview,
    previewSectionId: 'section-123',
    enterPreview: jest.fn(),
  }),
}));

describe('PreviewBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPreview.mockReturnValue(true);
    mockExitPreview.mockResolvedValue(undefined);
  });

  it('renders preview text when preview is active', () => {
    render(<PreviewBanner />);

    expect(screen.getByText(/previewing this section as a student/i)).toBeInTheDocument();
  });

  it('renders "Exit Preview" button when preview is active', () => {
    render(<PreviewBanner />);

    expect(screen.getByRole('button', { name: /exit preview/i })).toBeInTheDocument();
  });

  it('calls exitPreview when Exit Preview button is clicked', async () => {
    render(<PreviewBanner />);

    await userEvent.click(screen.getByRole('button', { name: /exit preview/i }));

    expect(mockExitPreview).toHaveBeenCalledTimes(1);
  });

  it('does not render when preview is not active', () => {
    mockIsPreview.mockReturnValue(false);

    render(<PreviewBanner />);

    expect(screen.queryByText(/previewing this section as a student/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /exit preview/i })).not.toBeInTheDocument();
  });

  it('has visually distinct amber/yellow styling when active', () => {
    const { container } = render(<PreviewBanner />);

    // Should have some amber/yellow color indicator
    const bannerEl = container.firstChild as HTMLElement;
    expect(bannerEl).not.toBeNull();
    expect(bannerEl.className).toMatch(/amber|yellow/);
  });
});
