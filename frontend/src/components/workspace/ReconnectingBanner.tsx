'use client';

import * as React from 'react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import type { RealtimeStatus } from '@/lib/connectionStatus';

export interface ReconnectingBannerProps {
  /**
   * The Centrifugo WebSocket connection status from `useRealtimeSession`.
   * This reflects ONLY the live realtime link, NOT internet connectivity:
   * code execution (`/api/v1/execute`) and autosave (`apiUpdateCode`) are HTTP
   * and keep working regardless of this value.
   */
  connectionStatus: RealtimeStatus;
  /** Optional handler for the "Retry now" action. Button is hidden when omitted. */
  onRetry?: () => void;
  /** Optional wrapper class (e.g. layout spacing). Only applied when visible. */
  className?: string;
}

/**
 * ReconnectingBanner — graceful-degradation strip shown when the live realtime
 * link (Centrifugo WS) is lost mid-session. It is purely additive UI: it never
 * throws, never unmounts the workspace, and never gates execution/autosave.
 *
 * Visibility gate (lost-link transition only):
 *   - `failed`, OR
 *   - `disconnected` AFTER the link has been `connected` at least once
 *     (tracked via wasConnectedRef).
 * A bare `disconnected` that was never preceded by `connected` (initial mount,
 * practice mode where `session_id === ''` never subscribes) is a NORMAL state and
 * shows nothing. The page additionally gates on `mode === 'live' && joined`,
 * mirroring the ConnectionDot gate.
 *
 * Honest copy: the live instructor view, featuring, and classmate presence are
 * PAUSED while the link is down; the student's code still runs and saves because
 * those go over HTTP. No "offline" / "saved on this device" / "local vs hidden
 * tests" framing — every run is the same HTTP `/execute` call.
 */
export function ReconnectingBanner({
  connectionStatus,
  onRetry,
  className,
}: ReconnectingBannerProps): React.ReactElement | null {
  const wasConnectedRef = React.useRef(false);
  const [dismissed, setDismissed] = React.useState(false);

  if (connectionStatus === 'connected') {
    wasConnectedRef.current = true;
  }

  const lostLink =
    connectionStatus === 'failed' ||
    (connectionStatus === 'disconnected' && wasConnectedRef.current);

  if (!lostLink) {
    return null;
  }

  const body = dismissed ? undefined : (
    <>
      Paused while we reconnect: the live instructor view, featuring, and
      classmate presence. Your code still runs and saves normally — those go over
      a separate connection.
    </>
  );

  const action = onRetry ? (
    <Button variant="quiet" size="xs" onClick={onRetry}>
      Retry now
    </Button>
  ) : undefined;

  return (
    <div className={className}>
      <Banner
        tone="warn"
        icon="wifi"
        title="Reconnecting to the live session…"
        body={body}
        action={dismissed ? undefined : action}
        onDismiss={dismissed ? undefined : () => setDismissed(true)}
      />
    </div>
  );
}

export default ReconnectingBanner;
