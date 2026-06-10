import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { Field } from '../Field';

describe('Field', () => {
  /**
   * Test case 1: Field renders label and children.
   * Verifies that the Field component correctly renders its label text and
   * children. If violated, consuming forms would silently lose their labels
   * or input controls.
   */
  it('renders label and children', () => {
    render(
      <Field label="Join code">
        <input data-testid="child-input" />
      </Field>
    );
    expect(screen.getByText('Join code')).toBeInTheDocument();
    expect(screen.getByTestId('child-input')).toBeInTheDocument();
  });

  /**
   * Test case 2: Field shows hint in subtle color.
   * Verifies that hint text is rendered with the --fg-subtle token color.
   * If violated, users lose the contextual guidance without any visible error.
   */
  it('shows hint text with var(--fg-subtle) color', () => {
    render(<Field hint="6 characters"><input /></Field>);
    const hint = screen.getByText('6 characters');
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveStyle({ color: 'var(--fg-subtle)' });
  });

  /**
   * Test case 3: Field error replaces hint and uses danger color.
   * Verifies the precedence rule: error overrides hint, rendered with
   * --danger color and role="alert" for a11y. If violated, both would show
   * or the danger styling would be absent.
   */
  it('error replaces hint and uses danger color with role alert', () => {
    render(<Field hint="6 characters" error="Invalid code"><input /></Field>);
    expect(screen.getByText('Invalid code')).toBeInTheDocument();
    expect(screen.queryByText('6 characters')).not.toBeInTheDocument();
    const errorEl = screen.getByRole('alert');
    expect(errorEl).toHaveTextContent('Invalid code');
    expect(errorEl).toHaveStyle({ color: 'var(--danger)' });
  });

  /**
   * Test case 4: Field right slot renders.
   * Verifies that the right prop (optional element next to label) is rendered.
   * If violated, the "Forgot code?" link or other right-aligned affordances
   * would silently drop from the UI.
   */
  it('renders right slot next to label', () => {
    render(
      <Field label="Join code" right={<a href="/help">Wrong code?</a>}>
        <input />
      </Field>
    );
    const link = screen.getByRole('link', { name: 'Wrong code?' });
    expect(link).toBeInTheDocument();
  });

  it('renders without label (label-less mode)', () => {
    render(<Field hint="some hint"><input data-testid="bare" /></Field>);
    expect(screen.getByTestId('bare')).toBeInTheDocument();
    expect(screen.getByText('some hint')).toBeInTheDocument();
  });

  it('renders neither hint nor error div when both are absent', () => {
    const { container } = render(<Field label="Email"><input /></Field>);
    // The hint/error div should not be present
    expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument();
  });

  it('passes style prop to the label container', () => {
    const { container } = render(
      <Field style={{ marginBottom: 24 }}><input /></Field>
    );
    const label = container.querySelector('label');
    expect(label).toHaveStyle({ marginBottom: '24px' });
  });
});
