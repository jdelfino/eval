'use client';

import * as React from 'react';

export type AuthHeadingSize = 'lg' | 'md' | 'sm' | 'xs';

export interface AuthHeadingProps {
  /** Heading text content. */
  children: React.ReactNode;
  /**
   * Size variant controlling font-size and letter-spacing.
   * lg: 26px / -0.5  (landing, main sign-in)
   * md: 24px / -0.4  (most auth cards)      — default
   * sm: 22px / -0.3  (secondary headings)
   * xs: 20px / -0.3  (app-shell page titles)
   */
  size?: AuthHeadingSize;
  /** Optional muted sub-paragraph rendered below the heading. */
  sub?: React.ReactNode;
  /** Additional inline styles applied to the <h1>. */
  style?: React.CSSProperties;
  /** Override the heading element. Defaults to 'h1'. */
  as?: 'h1' | 'h2' | 'h3';
}

const SIZE_MAP: Record<AuthHeadingSize, { fontSize: number; letterSpacing: number }> = {
  lg: { fontSize: 26, letterSpacing: -0.5 },
  md: { fontSize: 24, letterSpacing: -0.4 },
  sm: { fontSize: 22, letterSpacing: -0.3 },
  xs: { fontSize: 20, letterSpacing: -0.3 },
};

/**
 * AuthHeading — serif h1 with optional muted sub-paragraph.
 *
 * Encapsulates the repeated pattern across all G5 auth surfaces:
 * fontFamily var(--font-serif), fontWeight 500, size-specific
 * fontSize + letterSpacing, margin 0.
 *
 * Use the `sub` prop for the secondary muted line that appears on most
 * auth cards below the heading (fontSize 13, color var(--fg-muted)).
 */
export function AuthHeading({
  children,
  size = 'md',
  sub,
  style,
  as: Tag = 'h1',
}: AuthHeadingProps): React.ReactElement {
  const { fontSize, letterSpacing } = SIZE_MAP[size];

  return (
    <>
      <Tag
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize,
          fontWeight: 500,
          letterSpacing,
          margin: 0,
          ...style,
        }}
      >
        {children}
      </Tag>
      {sub && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--fg-muted)',
            margin: '8px 0 0',
          }}
        >
          {sub}
        </p>
      )}
    </>
  );
}

export default AuthHeading;
