import React from 'react';

export interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /**
   * The HTML element to render as. Defaults to 'div'.
   * Use 'h2' when the label is a semantic section heading (e.g. "Problems", "Past sessions").
   */
  as?: 'div' | 'h2';
}

/**
 * SectionLabel — uppercase eyebrow label used above content sections.
 *
 * Recipe: 11.5px / weight 600 / letter-spacing 0.4 / uppercase / fg-muted.
 * Replaces the duplicated inline style block that appeared in Statement,
 * Tests, and Section headings across the public problem page and StudentSectionView.
 *
 * @example
 * ```tsx
 * <SectionLabel as="h2">Problems</SectionLabel>
 * ```
 */
export function SectionLabel({ children, className, style, as: Tag = 'div' }: SectionLabelProps): React.ReactElement {
  return (
    <Tag
      className={className}
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: 'var(--fg-muted)',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export default SectionLabel;
