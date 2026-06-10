'use client';

import * as React from 'react';
import { normalizeJoinCode, formatJoinCodeInput } from '@/lib/join-code';

/** Ghost placeholder characters shown when the input is empty (screen I). */
const GHOST_CHARS = ['A', 'B', 'C', '1', '2', '3'] as const;

export interface JoinCodeBoxesProps {
  /** Formatted value (XXX-XXX or partial). */
  value: string;
  /** Emits formatJoinCodeInput(raw) on every change. */
  onChange: (formatted: string) => void;
  /** K2 variant: all boxes get 2px var(--danger) border. */
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /**
   * Size variant.
   * lg (landing): 44×52 boxes, 22px glyphs — default.
   * md (register): 38×46 boxes, 18px glyphs.
   */
  size?: 'md' | 'lg';
  /** Default 'join-code'. T4 passes 'join_code' to keep e2e selectors stable. */
  id?: string;
  /** Default 'Join code'. */
  'aria-label'?: string;
}

const SIZE_MAP = {
  lg: { width: 44, height: 52, fontSize: 22 },
  md: { width: 38, height: 46, fontSize: 18 },
} as const;

/**
 * JoinCodeBoxes — visually segmented 6-character code input.
 *
 * Uses a single real <input> (for paste, autofill, and Playwright fill)
 * absolutely positioned over the visual boxes. The boxes are aria-hidden
 * decoration — the input carries the accessible name.
 *
 * The onChange handler always emits formatJoinCodeInput(raw) so the
 * parent never needs to format manually.
 *
 * e2e selector contract: `container.querySelector('#join-code')` (or whatever
 * id is passed) hits the real input element.
 */
export function JoinCodeBoxes({
  value,
  onChange,
  error = false,
  disabled = false,
  autoFocus = false,
  size = 'lg',
  id = 'join-code',
  'aria-label': ariaLabel = 'Join code',
}: JoinCodeBoxesProps): React.ReactElement {
  const [focused, setFocused] = React.useState(false);
  const dims = SIZE_MAP[size];

  // Derive the 6 typed characters (without the dash) from the formatted value
  const chars = normalizeJoinCode(value).split('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(formatJoinCodeInput(e.target.value));
  };

  const totalWidth = dims.width * 6 + 10 + 6 * 6; // 6 boxes + divider + gaps

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: totalWidth,
      }}
    >
      {/* Real input — invisible but interactive */}
      <input
        id={id}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={7}
        aria-label={ariaLabel}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.01,
          width: '100%',
          height: '100%',
          fontSize: 16,
          cursor: 'text',
          zIndex: 1,
        }}
      />

      {/* Visual boxes (aria-hidden decoration) */}
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {GHOST_CHARS.map((ghost, i) => {
          const char = chars[i];
          const isActive = !error && focused && i === Math.min(chars.length, 5);

          let border: string;
          if (error) {
            border = '2px solid var(--danger)';
          } else if (isActive) {
            border = '2px solid var(--accent)';
          } else {
            border = '1px solid var(--border)';
          }

          return (
            <React.Fragment key={i}>
              <div
                data-box={i}
                style={{
                  width: dims.width,
                  height: dims.height,
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg)',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  fontSize: dims.fontSize,
                  color: char ? 'var(--fg)' : 'var(--fg-subtle)',
                  border,
                  flexShrink: 0,
                }}
              >
                {char ?? ghost}
              </div>
              {i === 2 && (
                <div
                  style={{
                    width: 10,
                    height: 2,
                    background: 'var(--border-strong)',
                    borderRadius: 1,
                    flexShrink: 0,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default JoinCodeBoxes;
