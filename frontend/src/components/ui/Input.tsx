import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Error message to display below the input.
   * When provided, the input will show error styling using the --danger token.
   */
  error?: string;
  /**
   * Render the input in the monospace font (--font-mono).
   * Useful for code or join-code inputs.
   */
  mono?: boolean;
}

/**
 * A styled input component with consistent focus, error, and disabled states.
 * Extends native HTML input props and supports ref forwarding.
 *
 * Styling uses CSS design tokens (--bg, --border-strong, --accent, --danger, etc.)
 * rather than hardcoded Tailwind color classes. Focus treatment applies
 * accent border-color and box-shadow rather than a Tailwind ring.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, mono, type = 'text', onFocus, onBlur, style, ...props }, ref) => {
    const [focused, setFocused] = React.useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false);
      onBlur?.(e);
    };

    const baseClasses = [
      'appearance-none',
      'block',
      'w-full',
      'focus:outline-none',
      'transition-all',
      'duration-200',
      'disabled:opacity-60',
    ].join(' ');

    const combinedClasses = [baseClasses, className].filter(Boolean).join(' ');

    const borderValue = error
      ? '1px solid var(--danger)'
      : focused
        ? '1px solid var(--accent)'
        : '1px solid var(--border-strong)';

    const boxShadow = focused && !error ? '0 0 0 2px var(--accent-soft)' : undefined;

    const inputStyle: React.CSSProperties = {
      background: 'var(--bg)',
      border: borderValue,
      borderRadius: 'var(--radius)',
      fontSize: 13,
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      color: 'var(--fg)',
      padding: '8px 12px',
      width: '100%',
      boxShadow,
      ...style,
    };

    return (
      <div className="w-full">
        <input
          type={type}
          className={combinedClasses}
          ref={ref}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${props.id}-error` : undefined}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={inputStyle}
          {...props}
        />
        {error && (
          <p
            id={props.id ? `${props.id}-error` : undefined}
            role="alert"
            style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}
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
