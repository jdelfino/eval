/**
 * Mapper from realtime Centrifugo connection states to ConnectionDot display states.
 *
 * Contract: the four connection states from useRealtimeSession and useRealtimePublicView
 * map to the four ConnectionDot statuses:
 *
 * - 'connected' → 'live' (green dot, "Live")
 * - 'connecting' → 'warming' (yellow dot, "Warming up")
 * - 'disconnected' → 'offline' (red dot, "Offline")
 * - 'failed' → 'offline' (red dot, "Offline")
 */

import type { ConnectionStatus as DotStatus } from '@/components/ui';

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected' | 'failed';

export function mapToDotStatus(status: RealtimeStatus): DotStatus {
  switch (status) {
    case 'connected':
      return 'live';
    case 'connecting':
      return 'warming';
    case 'disconnected':
    case 'failed':
      return 'offline';
    default:
      return 'idle';
  }
}
