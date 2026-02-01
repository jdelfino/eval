import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Error message to display below the input.
   * When provided, the input will show error styling.
   */
  error?: string;
}

/**
 * A styled input component with consistent focus, error, and disabled states.
 * Extends native HTML input props and supports ref forwarding.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type = 'text', ...props }, ref) => {
    const baseClasses = [
      'appearance-none',
      'rounded-lg',
      'relative',
      'block',
      'w-full',
      'px-4',
      'py-3',
      'border',
      'placeholder-gray-400',
      'text-gray-900',
      'focus:outline-none',
      'focus:ring-2',
      'focus:border-transparent',
      'transition-all',
      'duration-200',
      'sm:text-sm',
      'disabled:bg-gray-50',
      'disabled:text-gray-500',
    ].join(' ');

    const borderClasses = error
      ? 'border-red-300 focus:ring-red-500'
      : 'border-gray-300 focus:ring-indigo-500';

    const combinedClasses = [baseClasses, borderClasses, className]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="w-full">
        <input
          type={type}
          className={combinedClasses}
          ref={ref}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${props.id}-error` : undefined}
          {...props}
        />
        {error && (
          <p
            id={props.id ? `${props.id}-error` : undefined}
            className="mt-1 text-sm text-red-600"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
