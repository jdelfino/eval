import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '../Input';

describe('Input', () => {
  describe('rendering', () => {
    it('renders an input element', () => {
      render(<Input placeholder="Enter text" />);
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });

    it('renders with type text by default', () => {
      render(<Input data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'text');
    });

    it('renders with custom type', () => {
      render(<Input type="email" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'email');
    });

    it('renders with provided value', () => {
      render(<Input value="test value" onChange={() => {}} data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveValue('test value');
    });
  });

  describe('styling', () => {
    /**
     * Test case 13: Input default border uses var(--border-strong) and no border-gray-300 class.
     * Verifies that the token restyle is complete — hardcoded gray classes must not remain.
     * If violated, the input would ignore the design-token theme.
     */
    it('applies var(--border-strong) border in default state', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input.style.border).toContain('var(--border-strong)');
    });

    it('does not have border-gray-300 class', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).not.toHaveClass('border-gray-300');
    });

    it('applies base structural classes', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveClass('appearance-none');
      expect(input).toHaveClass('block');
      expect(input).toHaveClass('w-full');
    });

    it('does not apply Tailwind ring utility classes', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).not.toHaveClass('focus:ring-indigo-500');
      expect(input).not.toHaveClass('focus:ring-2');
    });

    /**
     * Test case 13 (continued): focused input carries accent border/shadow, not Tailwind ring.
     * Verifies that the focus treatment uses design tokens. The amendment requires
     * border-color: var(--accent) and box-shadow: 0 0 0 2px var(--accent-soft).
     */
    it('applies accent focus style via onFocus handler', async () => {
      const user = userEvent.setup();
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      await user.click(input);
      // The onFocus handler should apply accent border and shadow
      expect(input.style.border).toContain('var(--accent)');
      expect(input.style.boxShadow).toBe('0 0 0 2px var(--accent-soft)');
    });

    it('restores default border on blur', async () => {
      const user = userEvent.setup();
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      await user.click(input);
      await user.tab();
      expect(input.style.border).not.toContain('var(--accent)');
    });

    it('merges custom className with default classes', () => {
      render(<Input className="custom-class" data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveClass('custom-class');
      expect(input).toHaveClass('appearance-none');
    });

    /**
     * Test case 14: Input mono prop sets var(--font-mono) font-family.
     * Verifies that the new mono prop is wired through to the inline style.
     * If violated, mono code inputs would render in the default sans-serif font.
     */
    it('applies var(--font-mono) when mono prop is true', () => {
      render(<Input mono data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input.style.fontFamily).toBe('var(--font-mono)');
    });

    it('applies var(--font-sans) when mono prop is false/absent', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input.style.fontFamily).toBe('var(--font-sans)');
    });
  });

  describe('error state', () => {
    it('displays error message when error prop is provided', () => {
      render(<Input error="Email is required" />);
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });

    /**
     * Test case 12: Input error styling uses tokens.
     * Verifies that on error, the border uses var(--danger) (not red-300 class),
     * the error message has role="alert", and aria-invalid="true" is set.
     * If violated, errors would be invisible to the design-token theme.
     */
    it('applies var(--danger) border when error prop is provided', () => {
      render(<Input error="Invalid input" data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input.style.border).toContain('var(--danger)');
    });

    it('does not apply border-red-300 class', () => {
      render(<Input error="Invalid input" data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).not.toHaveClass('border-red-300');
    });

    it('does not apply focus:ring-red-500 class', () => {
      render(<Input error="Invalid input" data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).not.toHaveClass('focus:ring-red-500');
    });

    it('sets aria-invalid to true when error is provided', () => {
      render(<Input error="Error" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('aria-invalid', 'true');
    });

    it('sets aria-invalid to false when no error', () => {
      render(<Input data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('aria-invalid', 'false');
    });

    it('links error message to input via aria-describedby', () => {
      render(<Input id="email" error="Email is required" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby', 'email-error');
      expect(screen.getByText('Email is required')).toHaveAttribute('id', 'email-error');
    });

    it('error message has role alert for screen readers', () => {
      render(<Input error="Error message" />);
      expect(screen.getByRole('alert')).toHaveTextContent('Error message');
    });

    it('error message uses var(--danger) color', () => {
      render(<Input error="Error message" />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveStyle({ color: 'var(--danger)' });
    });
  });

  describe('disabled state', () => {
    it('applies disabled:opacity-60 class', () => {
      render(<Input disabled data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveClass('disabled:opacity-60');
    });

    it('is actually disabled when disabled prop is true', () => {
      render(<Input disabled data-testid="input" />);
      expect(screen.getByTestId('input')).toBeDisabled();
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to the input element', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('allows focus via ref', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} data-testid="input" />);
      ref.current?.focus();
      expect(screen.getByTestId('input')).toHaveFocus();
    });
  });

  describe('interaction', () => {
    it('calls onChange handler when typing', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<Input onChange={handleChange} data-testid="input" />);

      await user.type(screen.getByTestId('input'), 'hello');
      expect(handleChange).toHaveBeenCalled();
    });

    it('supports onFocus and onBlur handlers', async () => {
      const user = userEvent.setup();
      const handleFocus = jest.fn();
      const handleBlur = jest.fn();
      render(
        <Input
          onFocus={handleFocus}
          onBlur={handleBlur}
          data-testid="input"
        />
      );

      const input = screen.getByTestId('input');
      await user.click(input);
      expect(handleFocus).toHaveBeenCalled();

      await user.tab();
      expect(handleBlur).toHaveBeenCalled();
    });
  });

  describe('native attributes', () => {
    it('passes through native input attributes', () => {
      render(
        <Input
          id="test-id"
          name="test-name"
          autoComplete="email"
          maxLength={50}
          data-testid="input"
        />
      );
      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('id', 'test-id');
      expect(input).toHaveAttribute('name', 'test-name');
      expect(input).toHaveAttribute('autocomplete', 'email');
      expect(input).toHaveAttribute('maxlength', '50');
    });

    it('supports required attribute', () => {
      render(<Input required data-testid="input" />);
      expect(screen.getByTestId('input')).toBeRequired();
    });
  });
});
