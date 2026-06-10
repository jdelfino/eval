import React from 'react';

export interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * SectionLabel — uppercase eyebrow label used above content sections.
 *
 * Recipe: 11.5px / weight 600 / letter-spacing 0.4 / uppercase / fg-muted.
 * Replaces the duplicated inline style block that appeared in Statement,
 * Tests, and Section headings across the public problem page and StudentSectionView.
 */
export function SectionLabel({ children, className, style }: SectionLabelProps): React.ReactElement {
  return (
    <div
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
    </div>
  );
}

export default SectionLabel;
