import { Centrifuge } from 'centrifuge';
import { getAuthHeaders, getPreviewSectionId } from '@/lib/api-client';

// When NEXT_PUBLIC_CENTRIFUGO_URL is set, use it directly.
// When empty (e.g. staging behind nginx proxy), derive from window.location so the
// WebSocket connects through the same host/port as the page (e.g. ws://localhost:8080/connection/websocket).
export function getCentrifugoUrl(location?: Location): string {
  const configured = process.env.NEXT_PUBLIC_CENTRIFUGO_URL;
  if (configured) {
    return configured;
  }
  const loc = location || window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/connection/websocket`;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function buildHeaders(authHeaders: Record<string, string>): Record<string, string> {
  const previewSectionId = getPreviewSectionId();
  if (previewSectionId) {
    return { ...authHeaders, 'X-Preview-Section': previewSectionId };
  }
  return authHeaders;
}

export function createCentrifuge(): Centrifuge {
  return new Centrifuge(getCentrifugoUrl(window.location), {
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
