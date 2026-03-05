import { Centrifuge } from 'centrifuge';
import { getAuthHeaders, getPreviewSectionId } from '@/lib/api-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Resolves the Centrifugo WebSocket URL.
 *
 * When NEXT_PUBLIC_CENTRIFUGO_URL is set (production/local dev), it is used as-is.
 * When it is empty (staging), the URL is derived from the page origin so the browser
 * connects via the nginx proxy at the same host/port rather than an internal cluster DNS name.
 *
 * @param protocol - override window.location.protocol (for testing)
 * @param host     - override window.location.host (for testing)
 */
export function resolveCentrifugoUrl(protocol?: string, host?: string): string {
  const configured = process.env.NEXT_PUBLIC_CENTRIFUGO_URL;
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    const proto = (protocol ?? window.location.protocol) === 'https:' ? 'wss:' : 'ws:';
    const h = host ?? window.location.host;
    return `${proto}//${h}/connection/websocket`;
  }
  return 'ws://localhost:8000/connection/websocket';
}

function buildHeaders(authHeaders: Record<string, string>): Record<string, string> {
  const previewSectionId = getPreviewSectionId();
  if (previewSectionId) {
    return { ...authHeaders, 'X-Preview-Section': previewSectionId };
  }
  return authHeaders;
}

export function createCentrifuge(): Centrifuge {
  return new Centrifuge(resolveCentrifugoUrl(), {
    getToken: async () => {
      const authHeaders = await getAuthHeaders();
      const headers = buildHeaders(authHeaders);
      const res = await fetch(`${API_URL}/realtime/token`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to get token: ${res.status}`);
      }
      const data = await res.json();
      return data.token;
    },
  });
}

export async function getSubscriptionToken(channel: string): Promise<string> {
  const authHeaders = await getAuthHeaders();
  const headers = buildHeaders(authHeaders);
  const res = await fetch(`${API_URL}/realtime/token?channel=${encodeURIComponent(channel)}`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to get subscription token: ${res.status}`);
  }
  const data = await res.json();
  return data.token;
}
