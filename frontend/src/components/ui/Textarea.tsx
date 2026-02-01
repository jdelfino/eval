import * as React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Error message to display below the textarea.
   * When provided, the textarea will show error styling.
   */
  error?: string;
}

/**
 * A styled textarea component with consistent focus, error, and disabled states.
 * Extends native HTML textarea props and supports ref forwarding.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
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
      'resize-y',
    ].join(' ');

    const borderClasses = error
      ? 'border-red-300 focus:ring-red-500'
      : 'border-gray-300 focus:ring-indigo-500';

    const combinedClasses = [baseClasses, borderClasses, className]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="w-full">
        <textarea
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

Textarea.displayName = 'Textarea';

export { Textarea };
