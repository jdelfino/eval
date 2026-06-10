import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Banner } from '../Banner';
import type { BannerTone } from '../Banner';

describe('Banner', () => {
  /**
   * Test case 5: Banner renders title and body.
   * Verifies that both the title and body text are visible. If violated,
   * error messages or status text would be silently missing.
   */
  it('renders title and body', () => {
    render(<Banner title="Sign in failed" body="Try a different provider." />);
    expect(screen.getByText('Sign in failed')).toBeInTheDocument();
    expect(screen.getByText('Try a different provider.')).toBeInTheDocument();
  });

  /**
   * Test case 6: Banner tone → background var, parameterized over all 5 tones.
   * Verifies that the container background maps to the correct `-soft` token
   * for each tone. If violated, tone-map drift would break visual differentiation
   * between info/warn/danger/accent/run states.
   */
  describe('tone maps to background var', () => {
    const toneBackgrounds: Array<[BannerTone, string]> = [
      ['info',   'var(--info-soft)'],
      ['warn',   'var(--warn-soft)'],
      ['danger', 'var(--danger-soft)'],
      ['accent', 'var(--accent-soft)'],
      ['run',    'var(--run-soft)'],
    ];

    it.each(toneBackgrounds)('tone=%s → background includes %s', (tone, expectedBg) => {
      const { container } = render(<Banner tone={tone} title="Test" />);
      const bannerEl = container.firstChild as HTMLElement;
      expect(bannerEl.style.background).toBe(expectedBg);
    });
  });

  /**
   * Test case 7: Banner danger/warn have role="alert", info/accent/run have role="status".
   * Verifies accessibility role assignment based on tone severity. If violated,
   * screen readers would fail to announce urgent messages or incorrectly
   * announce non-urgent ones.
   */
  describe('accessibility roles', () => {
    it('danger tone has role="alert"', () => {
      render(<Banner tone="danger" title="Error occurred" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('warn tone has role="alert"', () => {
      render(<Banner tone="warn" title="Warning" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('info tone has role="status"', () => {
      render(<Banner tone="info" title="Info message" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('accent tone has role="status"', () => {
      render(<Banner tone="accent" title="Accent message" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('run tone has role="status"', () => {
      render(<Banner tone="run" title="Run message" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('default tone (info) has role="status"', () => {
      render(<Banner title="Default tone" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  /**
   * Test case 8: Banner onDismiss fires — click dismiss button; assert callback called once.
   * Also asserts no dismiss button when prop omitted. Catches: handler wiring.
   */
  it('calls onDismiss when dismiss button clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    render(<Banner title="Dismissable" onDismiss={onDismiss} />);
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
    await user.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not render a dismiss button when onDismiss is omitted', () => {
    render(<Banner title="No dismiss" />);
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('renders action slot', () => {
    render(<Banner title="With action" action={<button>Retry</button>} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
