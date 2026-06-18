/**
 * Tests for the landing page (screen I / v4) — focus on the join-code primary
 * action and its selector/behavior contract, which the G8 mobile responsive
 * reskin must preserve.
 *
 * Contracts verified:
 * - The join-code input keeps the e2e selector id="join-code" (hyphen).
 * - The submit button is disabled until a code is entered, and enabled once it is.
 * - A complete code submits and navigates to /register/student?code=<normalized>.
 * - An incomplete code surfaces a validation error and does not navigate.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import Home from '../page';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('Landing page (join-code)', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useAuth as jest.Mock).mockReturnValue({ user: null, isLoading: false });
  });

  /** The single real input in JoinCodeBoxes carries id="join-code". */
  function getJoinCodeInput(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector('#join-code');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('join-code input not found');
    }
    return input;
  }

  it('renders the join-code input with the preserved id="join-code" selector', () => {
    /**
     * Contract: e2e and registration deep-links rely on the input id "join-code"
     * (hyphen). The mobile reskin must not rename it.
     */
    const { container } = render(<Home />);
    expect(getJoinCodeInput(container)).toBeInTheDocument();
  });

  it('disables the submit button until a code is entered, then enables it', () => {
    /**
     * Contract: the "Join section" submit is disabled while the code is empty
     * (disabled={isValidating || !join_code}) and enables once characters exist.
     * Breaking this lets users submit an empty code or blocks valid submits.
     */
    const { container } = render(<Home />);

    const submit = screen.getByRole('button', { name: /join section/i });
    expect(submit).toBeDisabled();

    fireEvent.change(getJoinCodeInput(container), { target: { value: 'ABC123' } });
    expect(submit).toBeEnabled();
  });

  it('navigates to student registration with the normalized code on submit of a complete code', () => {
    /**
     * Contract: submitting a complete code pushes /register/student?code=<normalized>.
     * Breaking this drops the primary join flow.
     */
    const { container } = render(<Home />);

    fireEvent.change(getJoinCodeInput(container), { target: { value: 'abc-123' } });
    fireEvent.click(screen.getByRole('button', { name: /join section/i }));

    expect(mockPush).toHaveBeenCalledWith('/register/student?code=ABC123');
  });

  it('shows a validation error and does not navigate for an incomplete code', () => {
    /**
     * Contract: an incomplete code surfaces the validation message and does NOT
     * navigate. Note this requires bypassing the disabled-button guard via direct
     * form submit, mirroring autofill/edge paths.
     */
    const { container } = render(<Home />);

    const input = getJoinCodeInput(container);
    fireEvent.change(input, { target: { value: 'AB1' } });

    // Submit the form directly (covers the validation branch).
    const form = input.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(screen.getByText(/valid join code/i)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
