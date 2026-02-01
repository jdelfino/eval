'use client';

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Show loading spinner and disable interactions */
  loading?: boolean;
  /** Render as child element (for link buttons) */
  asChild?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Button contents */
  children: React.ReactNode;
}

const baseClasses = [
  'inline-flex',
  'items-center',
  'justify-center',
  'font-semibold',
  'rounded-lg',
  'transition-all',
  'duration-200',
  'focus:outline-none',
  'focus:ring-2',
  'focus:ring-offset-2',
  'disabled:opacity-50',
  'disabled:cursor-not-allowed',
].join(' ');

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'text-white',
    'bg-gradient-to-r',
    'from-indigo-600',
    'to-purple-600',
    'hover:from-indigo-700',
    'hover:to-purple-700',
    'focus:ring-indigo-500',
    'shadow-lg',
    'hover:shadow-xl',
    'transform',
    'hover:-translate-y-0.5',
    'active:translate-y-0',
    'border',
    'border-transparent',
  ].join(' '),
  secondary: [
    'text-gray-700',
    'bg-white',
    'border',
    'border-gray-300',
    'hover:bg-gray-50',
    'focus:ring-gray-500',
  ].join(' '),
  danger: [
    'text-white',
    'bg-red-600',
    'hover:bg-red-700',
    'focus:ring-red-500',
    'border',
    'border-transparent',
  ].join(' '),
  ghost: [
    'text-gray-700',
    'bg-transparent',
    'hover:bg-gray-100',
    'focus:ring-gray-500',
  ].join(' '),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

/**
 * Button component with multiple variants and sizes.
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md">Save</Button>
 * <Button variant="danger" size="sm" disabled>Delete</Button>
 * <Button variant="ghost" loading>Submitting...</Button>
 * ```
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      asChild = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const classes = [
      baseClasses,
      variantClasses[variant],
      sizeClasses[size],
      className,
    ]
      .filter(Boolean)
      .join(' ');

    // For asChild pattern, clone the child element with button props
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        className: classes,
        ref,
        'aria-disabled': isDisabled || undefined,
        ...props,
      });
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
