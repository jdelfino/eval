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
    it('applies base styling classes', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveClass('appearance-none');
      expect(input).toHaveClass('rounded-lg');
      expect(input).toHaveClass('border');
      expect(input).toHaveClass('px-4');
      expect(input).toHaveClass('py-3');
    });

    it('applies default border and focus ring colors', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveClass('border-gray-300');
      expect(input).toHaveClass('focus:ring-indigo-500');
    });

    it('merges custom className with default classes', () => {
      render(<Input className="custom-class" data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveClass('custom-class');
      expect(input).toHaveClass('rounded-lg');
    });
  });

  describe('error state', () => {
    it('displays error message when error prop is provided', () => {
      render(<Input error="Email is required" />);
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });

    it('applies error styling when error prop is provided', () => {
      render(<Input error="Invalid input" data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveClass('border-red-300');
      expect(input).toHaveClass('focus:ring-red-500');
      expect(input).not.toHaveClass('border-gray-300');
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
  });

  describe('disabled state', () => {
    it('applies disabled styling classes', () => {
      render(<Input disabled data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveClass('disabled:bg-gray-50');
      expect(input).toHaveClass('disabled:text-gray-500');
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
