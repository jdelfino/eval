/**
 * Tests for the OpenOnLaptop component — the shared mobile read-only affordance.
 *
 * Contract: a dependency-free guidance card that tells a mobile user to switch
 * to a laptop and offers a "Copy link" button that copies the current URL via
 * the Clipboard API. It is the visible surface of G8's mobile read-only strategy
 * (notably the /student workspace guard), so its copy, copy-link wiring, and
 * graceful degradation when the Clipboard API is unavailable all matter.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OpenOnLaptop } from '../OpenOnLaptop';

describe('OpenOnLaptop', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    // Restore clipboard between tests (some tests replace or delete it).
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    jest.clearAllMocks();
  });

  it('renders the default title and body copy plus a Copy link button', () => {
    render(<OpenOnLaptop />);

    expect(screen.getByText('Coding works best on a laptop')).toBeInTheDocument();
    expect(screen.getByText("You'll write code on a bigger screen.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });

  it('renders custom title/body when provided (workspace-guard variant)', () => {
    render(<OpenOnLaptop title="Open this session on your laptop" body="Switch over to keep coding." />);

    expect(screen.getByText('Open this session on your laptop')).toBeInTheDocument();
    expect(screen.getByText('Switch over to keep coding.')).toBeInTheDocument();
  });

  it('copies window.location.href and shows the copied confirmation when Copy link is clicked', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(<OpenOnLaptop />);

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /link copied/i })).toBeInTheDocument();
    });
  });

  it('does not throw and keeps the button usable when clipboard write rejects', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    render(<OpenOnLaptop />);
    const button = screen.getByRole('button', { name: /copy link/i });

    // Should not throw synchronously.
    expect(() => fireEvent.click(button)).not.toThrow();

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });

    // Button remains present and enabled (still says "Copy link", not stuck).
    const stillThere = screen.getByRole('button', { name: /copy link/i });
    expect(stillThere).toBeEnabled();
  });

  it('does not throw when the Clipboard API is entirely absent', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    render(<OpenOnLaptop />);
    const button = screen.getByRole('button', { name: /copy link/i });

    expect(() => fireEvent.click(button)).not.toThrow();
    expect(button).toBeEnabled();
  });

  it('gives the Copy link button a >=44px touch target', () => {
    render(<OpenOnLaptop />);
    const button = screen.getByRole('button', { name: /copy link/i });

    // Hit target enforced via inline minHeight token (jsdom has no layout).
    expect(button.style.minHeight).toBe('44px');
  });
});
