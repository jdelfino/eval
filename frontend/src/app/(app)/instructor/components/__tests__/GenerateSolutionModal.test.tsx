/**
 * Tests for GenerateSolutionModal (G7 T7)
 *
 * The modal wraps the existing `generateSolution` client (DEC-12, reskin only)
 * and writes the chosen draft back to the host via `onUse`. These tests verify:
 * - payload composition (description + hints + toggle-derived custom_instructions)
 * - loading/error handling around the async call
 * - the apply ("Use as solution.py") gate + wiring
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import GenerateSolutionModal from '../GenerateSolutionModal';

const mockGenerateSolution = jest.fn();
jest.mock('@/lib/api/problems', () => ({
  generateSolution: (...args: unknown[]) => mockGenerateSolution(...args),
}));

const DESCRIPTION = 'Given a list of integers, return the two indices that sum to target.';

function renderModal(overrides: Partial<React.ComponentProps<typeof GenerateSolutionModal>> = {}) {
  const props = {
    open: true,
    onClose: jest.fn(),
    description: DESCRIPTION,
    starterCode: 'def two_sum(nums, target):\n    pass',
    onUse: jest.fn(),
    ...overrides,
  };
  render(<GenerateSolutionModal {...props} />);
  return props;
}

describe('GenerateSolutionModal (G7 T7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Test case 1: render + payload composition + result render ────────────────
  /**
   * Contract: the modal shows the read-only statement, a hints input, and the
   * option toggles; clicking Generate calls generateSolution with the description,
   * starter code, and a composed custom_instructions string; the returned code
   * lands in a CodeBlock. Breaks if endpoint wiring or payload composition drifts.
   */
  it('renders statement preview, hints, toggles and generates with composed payload', async () => {
    mockGenerateSolution.mockResolvedValue({ solution: 'def two_sum():\n    return [0, 1]' });
    renderModal();

    // Read-only statement preview is shown
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();

    // Hints input present
    const hints = screen.getByPlaceholderText(/prefer a one-pass dict/i);
    fireEvent.change(hints, { target: { value: 'use a dict' } });

    // Toggles present; "two approaches" defaults off — turn it on, leave others default-on
    const twoApproaches = screen.getByLabelText(/two approaches/i);
    fireEvent.click(twoApproaches);

    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() => expect(mockGenerateSolution).toHaveBeenCalledTimes(1));

    const payload = mockGenerateSolution.mock.calls[0][0];
    expect(payload.description).toBe(DESCRIPTION);
    expect(payload.starter_code).toBe('def two_sum(nums, target):\n    pass');
    // composed custom_instructions carries the hint + toggle-derived text
    expect(payload.custom_instructions).toContain('use a dict');
    expect(payload.custom_instructions).toContain('docstring');
    expect(payload.custom_instructions).toContain('type hints');
    expect(payload.custom_instructions).toContain('two approaches');

    // Generated code shows in a CodeBlock
    await waitFor(() =>
      expect(screen.getByText(/return \[0, 1\]/)).toBeInTheDocument()
    );
  });

  it('omits unchecked toggles from custom_instructions', async () => {
    mockGenerateSolution.mockResolvedValue({ solution: 'x' });
    renderModal();

    // Turn OFF the two default-on toggles
    fireEvent.click(screen.getByLabelText(/docstring/i));
    fireEvent.click(screen.getByLabelText(/type hints/i));

    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() => expect(mockGenerateSolution).toHaveBeenCalledTimes(1));
    const payload = mockGenerateSolution.mock.calls[0][0];
    expect(payload.custom_instructions ?? '').not.toContain('docstring');
    expect(payload.custom_instructions ?? '').not.toContain('type hints');
  });

  // ── Test case 2: loading + error handling ────────────────────────────────────
  /**
   * Contract: while generating, a loading indicator shows and Generate is busy;
   * an endpoint error renders inline (no crash) and leaves Regenerate usable.
   * Breaks if loading/error handling is missing.
   */
  it('shows loading state during generation', async () => {
    let resolve!: (v: { solution: string }) => void;
    mockGenerateSolution.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    // Loading indicator visible while the promise is pending
    expect(await screen.findByRole('status')).toBeInTheDocument();

    await act(async () => {
      resolve({ solution: 'done' });
    });

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('renders endpoint error inline and keeps regenerate usable', async () => {
    mockGenerateSolution.mockRejectedValueOnce(new Error('model unavailable'));
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    expect(await screen.findByText(/model unavailable/i)).toBeInTheDocument();

    // Recovery: a follow-up generation succeeds
    mockGenerateSolution.mockResolvedValueOnce({ solution: 'recovered code' });
    fireEvent.click(screen.getByRole('button', { name: /generate|regenerate/i }));

    await waitFor(() => expect(screen.getByText('recovered code')).toBeInTheDocument());
    expect(mockGenerateSolution).toHaveBeenCalledTimes(2);
  });

  // ── Test case 3: apply gate + wiring ─────────────────────────────────────────
  /**
   * Contract: "Use as solution.py" is disabled until a successful generation, then
   * calls onUse with the generated code and closes. Breaks on premature-apply or
   * apply-wiring bugs (generated code must never auto-apply).
   */
  it('disables "Use as solution.py" until a successful generation, then applies + closes', async () => {
    mockGenerateSolution.mockResolvedValue({ solution: 'final solution code' });
    const props = renderModal();

    const useBtn = screen.getByRole('button', { name: /use as solution\.py/i });
    expect(useBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    await waitFor(() => expect(screen.getByText('final solution code')).toBeInTheDocument());

    expect(useBtn).toBeEnabled();
    fireEvent.click(useBtn);

    expect(props.onUse).toHaveBeenCalledWith('final solution code');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByRole('button', { name: /^generate$/i })).not.toBeInTheDocument();
  });
});
