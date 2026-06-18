/**
 * Unit tests for the reusable Forbidden (403) component.
 * @jest-environment jsdom
 *
 * Contract: Forbidden is a generic permission-denied surface built on EmptyState
 * with a warn tone and "403 · …" code badge. It exposes title/body/actions so any
 * permission-denied screen can reuse it. (It is intentionally NOT wired into the
 * join flow — the join path has no 403 in the backend.)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Forbidden } from '../Forbidden';

describe('Forbidden', () => {
  it('renders a warn-toned 403 EmptyState with a default code badge', () => {
    const { container } = render(<Forbidden title="No access" />);
    expect(screen.getByText(/^403 ·/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No access' })).toBeInTheDocument();
    // warn tone => warn-soft token icon circle
    expect(container.querySelector('.bg-warn-soft')).toBeInTheDocument();
  });

  it('renders the provided body and actions', () => {
    render(
      <Forbidden
        title="No access"
        body="You don't have permission to view this."
        primary={<button>Go back</button>}
        secondary={<button>Sign in</button>}
      />
    );
    expect(screen.getByText("You don't have permission to view this.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('allows overriding the code badge text', () => {
    render(<Forbidden title="No access" code="403 · Forbidden" />);
    expect(screen.getByText('403 · Forbidden')).toBeInTheDocument();
  });
});
