/**
 * Unit tests for BackButton component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BackButton } from '../BackButton';

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  };
});

describe('BackButton', () => {
  describe('rendering', () => {
    it('should render with default text "Back"', () => {
      render(<BackButton onClick={() => {}} />);

      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    });

    it('should render with custom children', () => {
      render(<BackButton onClick={() => {}}>Back to Home</BackButton>);

      expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
    });

    it('should render chevron icon', () => {
      render(<BackButton onClick={() => {}} />);

      const button = screen.getByRole('button');
      const svg = button.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('should apply base styling classes', () => {
      render(<BackButton onClick={() => {}} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('inline-flex');
      expect(button).toHaveClass('items-center');
      expect(button).toHaveClass('text-gray-600');
      expect(button).toHaveClass('hover:text-gray-900');
      expect(button).toHaveClass('transition-colors');
    });

    it('should apply custom className', () => {
      render(<BackButton onClick={() => {}} className="custom-class" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('sizes', () => {
    it('should apply small size styles', () => {
      render(<BackButton onClick={() => {}} size="sm" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('py-1');
      expect(button).toHaveClass('text-sm');

      const svg = button.querySelector('svg');
      expect(svg).toHaveClass('w-4');
      expect(svg).toHaveClass('h-4');
    });

    it('should apply medium size styles (default)', () => {
      render(<BackButton onClick={() => {}} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('py-1.5');
      expect(button).toHaveClass('text-sm');

      const svg = button.querySelector('svg');
      expect(svg).toHaveClass('w-5');
      expect(svg).toHaveClass('h-5');
    });

    it('should apply large size styles', () => {
      render(<BackButton onClick={() => {}} size="lg" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('py-2');
      expect(button).toHaveClass('text-base');
    });
  });

  describe('navigation modes', () => {
    describe('button mode (onClick)', () => {
      it('should render as a button when onClick is provided', () => {
        render(<BackButton onClick={() => {}} />);

        expect(screen.getByRole('button')).toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
      });

      it('should call onClick when clicked', () => {
        const handleClick = jest.fn();
        render(<BackButton onClick={handleClick} />);

        fireEvent.click(screen.getByRole('button'));
        expect(handleClick).toHaveBeenCalledTimes(1);
      });

      it('should have type="button" to prevent form submission', () => {
        render(<BackButton onClick={() => {}} />);

        expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
      });
    });

    describe('link mode (href)', () => {
      it('should render as a link when href is provided', () => {
        render(<BackButton href="/classes" />);

        expect(screen.getByRole('link')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
      });

      it('should have correct href attribute', () => {
        render(<BackButton href="/classes">Back to Classes</BackButton>);

        const link = screen.getByRole('link', { name: /back to classes/i });
        expect(link).toHaveAttribute('href', '/classes');
      });

      it('should apply same styling as button mode', () => {
        render(<BackButton href="/home" />);

        const link = screen.getByRole('link');
        expect(link).toHaveClass('inline-flex');
        expect(link).toHaveClass('items-center');
        expect(link).toHaveClass('text-gray-600');
        expect(link).toHaveClass('hover:text-gray-900');
      });
    });
  });

  describe('accessibility', () => {
    it('should have focus ring styles', () => {
      render(<BackButton onClick={() => {}} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus:outline-none');
      expect(button).toHaveClass('focus:ring-2');
      expect(button).toHaveClass('focus:ring-indigo-500');
      expect(button).toHaveClass('focus:ring-offset-2');
    });

    it('should hide icon from screen readers', () => {
      render(<BackButton onClick={() => {}} />);

      const button = screen.getByRole('button');
      const svg = button.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('should have text content for screen readers', () => {
      render(<BackButton onClick={() => {}}>Go Back</BackButton>);

      const button = screen.getByRole('button', { name: 'Go Back' });
      expect(button).toBeInTheDocument();
    });
  });
});
