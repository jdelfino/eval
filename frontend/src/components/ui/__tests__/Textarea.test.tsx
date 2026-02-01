import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from '../Textarea';

describe('Textarea', () => {
  describe('rendering', () => {
    it('renders a textarea element', () => {
      render(<Textarea placeholder="Enter description" />);
      expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument();
    });

    it('renders with provided value', () => {
      render(<Textarea value="test value" onChange={() => {}} data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveValue('test value');
    });

    it('renders with custom rows', () => {
      render(<Textarea rows={5} data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('rows', '5');
    });
  });

  describe('styling', () => {
    it('applies base styling classes', () => {
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveClass('appearance-none');
      expect(textarea).toHaveClass('rounded-lg');
      expect(textarea).toHaveClass('border');
      expect(textarea).toHaveClass('px-4');
      expect(textarea).toHaveClass('py-3');
    });

    it('applies default border and focus ring colors', () => {
      render(<Textarea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveClass('border-gray-300');
      expect(textarea).toHaveClass('focus:ring-indigo-500');
    });

    it('applies resize-y class for vertical resizing', () => {
      render(<Textarea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveClass('resize-y');
    });

    it('merges custom className with default classes', () => {
      render(<Textarea className="custom-class" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveClass('custom-class');
      expect(textarea).toHaveClass('rounded-lg');
    });
  });

  describe('error state', () => {
    it('displays error message when error prop is provided', () => {
      render(<Textarea error="Description is required" />);
      expect(screen.getByText('Description is required')).toBeInTheDocument();
    });

    it('applies error styling when error prop is provided', () => {
      render(<Textarea error="Invalid input" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveClass('border-red-300');
      expect(textarea).toHaveClass('focus:ring-red-500');
      expect(textarea).not.toHaveClass('border-gray-300');
    });

    it('sets aria-invalid to true when error is provided', () => {
      render(<Textarea error="Error" data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('aria-invalid', 'true');
    });

    it('sets aria-invalid to false when no error', () => {
      render(<Textarea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('aria-invalid', 'false');
    });

    it('links error message to textarea via aria-describedby', () => {
      render(<Textarea id="description" error="Description is required" />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('aria-describedby', 'description-error');
      expect(screen.getByText('Description is required')).toHaveAttribute('id', 'description-error');
    });

    it('error message has role alert for screen readers', () => {
      render(<Textarea error="Error message" />);
      expect(screen.getByRole('alert')).toHaveTextContent('Error message');
    });
  });

  describe('disabled state', () => {
    it('applies disabled styling classes', () => {
      render(<Textarea disabled data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveClass('disabled:bg-gray-50');
      expect(textarea).toHaveClass('disabled:text-gray-500');
    });

    it('is actually disabled when disabled prop is true', () => {
      render(<Textarea disabled data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toBeDisabled();
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to the textarea element', () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      render(<Textarea ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });

    it('allows focus via ref', () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      render(<Textarea ref={ref} data-testid="textarea" />);
      ref.current?.focus();
      expect(screen.getByTestId('textarea')).toHaveFocus();
    });
  });

  describe('interaction', () => {
    it('calls onChange handler when typing', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<Textarea onChange={handleChange} data-testid="textarea" />);

      await user.type(screen.getByTestId('textarea'), 'hello');
      expect(handleChange).toHaveBeenCalled();
    });

    it('supports onFocus and onBlur handlers', async () => {
      const user = userEvent.setup();
      const handleFocus = jest.fn();
      const handleBlur = jest.fn();
      render(
        <Textarea
          onFocus={handleFocus}
          onBlur={handleBlur}
          data-testid="textarea"
        />
      );

      const textarea = screen.getByTestId('textarea');
      await user.click(textarea);
      expect(handleFocus).toHaveBeenCalled();

      await user.tab();
      expect(handleBlur).toHaveBeenCalled();
    });

    it('allows multiline input', async () => {
      const user = userEvent.setup();
      render(<Textarea data-testid="textarea" />);

      const textarea = screen.getByTestId('textarea');
      await user.type(textarea, 'line1{enter}line2');
      expect(textarea).toHaveValue('line1\nline2');
    });
  });

  describe('native attributes', () => {
    it('passes through native textarea attributes', () => {
      render(
        <Textarea
          id="test-id"
          name="test-name"
          maxLength={500}
          cols={50}
          data-testid="textarea"
        />
      );
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('id', 'test-id');
      expect(textarea).toHaveAttribute('name', 'test-name');
      expect(textarea).toHaveAttribute('maxlength', '500');
      expect(textarea).toHaveAttribute('cols', '50');
    });

    it('supports required attribute', () => {
      render(<Textarea required data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toBeRequired();
    });
  });
});
