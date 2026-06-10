import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { EvalLogomark } from '../EvalLogomark';

describe('EvalLogomark', () => {
  /**
   * Test case 9: EvalLogomark renders glyph "e" and wordmark "Eval".
   * Verifies both brand elements render correctly. The container must have
   * aria-label "Eval" for accessibility. If violated, brand identity in auth
   * surfaces would regress.
   */
  it('renders glyph "e", wordmark "Eval", and aria-label="Eval"', () => {
    const { container } = render(<EvalLogomark />);
    expect(screen.getByText('e')).toBeInTheDocument();
    expect(screen.getByText('Eval')).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('aria-label', 'Eval');
  });

  /**
   * Test case 10: EvalLogomark size props.
   * Verifies that size and wordmarkSize props are actually applied to the
   * rendered elements. Catches prop-wiring drops where default values are
   * always used regardless of the passed props.
   */
  it('applies size prop to glyph width/height', () => {
    render(<EvalLogomark size={40} wordmarkSize={30} />);
    const glyph = screen.getByText('e');
    expect(glyph).toHaveStyle({ width: '40px', height: '40px' });
  });

  it('applies wordmarkSize prop to wordmark fontSize', () => {
    render(<EvalLogomark size={40} wordmarkSize={30} />);
    const wordmark = screen.getByText('Eval');
    expect(wordmark).toHaveStyle({ fontSize: '30px' });
  });

  /**
   * Test case 11: EvalLogomark showWordmark={false} hides "Eval" text.
   * Verifies the wordmark-hidden variant. If violated, every EvalLogomark
   * usage that intends icon-only would show the wordmark unexpectedly.
   */
  it('hides wordmark when showWordmark={false}', () => {
    render(<EvalLogomark showWordmark={false} />);
    expect(screen.queryByText('Eval')).not.toBeInTheDocument();
    expect(screen.getByText('e')).toBeInTheDocument();
  });

  it('shows wordmark by default', () => {
    render(<EvalLogomark />);
    expect(screen.getByText('Eval')).toBeInTheDocument();
  });

  it('uses default size=26 when not specified', () => {
    render(<EvalLogomark />);
    const glyph = screen.getByText('e');
    expect(glyph).toHaveStyle({ width: '26px', height: '26px' });
  });

  it('glyph uses accent background and accent-fg color', () => {
    render(<EvalLogomark />);
    const glyph = screen.getByText('e');
    expect(glyph).toHaveStyle({ background: 'var(--accent)', color: 'var(--accent-fg)' });
  });
});
