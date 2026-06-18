/**
 * Tests for ReconnectingBanner — the realtime-link "reconnecting" banner.
 *
 * Contract: the banner is purely additive, graceful-degradation UI driven by
 * `useRealtimeSession.connectionStatus` (the Centrifugo WS link only, NOT internet).
 * It must:
 *  - render ONLY on a genuine lost-link transition: `failed`, or `disconnected`
 *    AFTER having been `connected` (tracked across renders).
 *  - stay silent on the normal states (`connected`, `connecting`) and on a bare
 *    `disconnected` that was never preceded by a `connected` (initial mount /
 *    practice mode), which would otherwise false-fire.
 *  - tell the honest paused/still-working split: live instructor view / featuring /
 *    classmate presence are PAUSED; code runs + saves continue over HTTP. It must
 *    NOT claim "offline" / "saved on this device" / "local vs hidden tests".
 *  - wire "Retry now" to onRetry and collapse (not unmount) on dismiss.
 *
 * Why it matters: this is the riskiest G9 surface — a false-fire or dishonest copy
 * misleads students about whether their run/save still works.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { ReconnectingBanner } from '../ReconnectingBanner';

describe('ReconnectingBanner', () => {
  it('renders the honest reconnecting split on failed', () => {
    render(<ReconnectingBanner connectionStatus="failed" />);

    // Header copy
    expect(screen.getByText(/Reconnecting to the live session/i)).toBeInTheDocument();

    // Honest split: what is paused vs. what keeps working (HTTP).
    expect(screen.getByText(/instructor/i)).toBeInTheDocument();
    expect(screen.getByText(/runs.*save|save.*runs|code runs/i)).toBeInTheDocument();

    // Must NOT use the false/offline framing.
    expect(screen.queryByText(/on this device/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden tests/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/local tests/i)).not.toBeInTheDocument();
  });

  it('renders the alert role (danger/warn) so it is announced', () => {
    render(<ReconnectingBanner connectionStatus="failed" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders nothing on connected', () => {
    const { container } = render(<ReconnectingBanner connectionStatus="connected" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on connecting', () => {
    const { container } = render(<ReconnectingBanner connectionStatus="connecting" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on a bare disconnected that was never connected', () => {
    // This is the false-fire case: initial mount / practice mode stay disconnected
    // forever without ever having been connected.
    const { container } = render(<ReconnectingBanner connectionStatus="disconnected" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders on disconnected AFTER having been connected (lost-link transition)', () => {
    const { container, rerender } = render(
      <ReconnectingBanner connectionStatus="connected" />,
    );
    // initially online → silent
    expect(container).toBeEmptyDOMElement();

    rerender(<ReconnectingBanner connectionStatus="disconnected" />);
    expect(screen.getByText(/Reconnecting to the live session/i)).toBeInTheDocument();
  });

  it('invokes onRetry when "Retry now" is clicked', async () => {
    const onRetry = jest.fn();
    render(<ReconnectingBanner connectionStatus="failed" onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render a retry button when onRetry is not provided', () => {
    render(<ReconnectingBanner connectionStatus="failed" />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('collapses the body on dismiss without unmounting the banner', async () => {
    render(<ReconnectingBanner connectionStatus="failed" />);

    // header present, body present
    expect(screen.getByText(/Reconnecting to the live session/i)).toBeInTheDocument();
    expect(screen.getByText(/instructor/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    // Still mounted (graceful degradation): header stays, detailed body collapses.
    expect(screen.getByText(/Reconnecting to the live session/i)).toBeInTheDocument();
    expect(screen.queryByText(/instructor/i)).not.toBeInTheDocument();
  });
});
