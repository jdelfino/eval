import { Centrifuge } from 'centrifuge';
import { getAuthHeaders } from '@/lib/api-client';

const CENTRIFUGO_URL = process.env.NEXT_PUBLIC_CENTRIFUGO_URL || 'ws://localhost:8000/connection/websocket';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export function createCentrifuge(): Centrifuge {
  return new Centrifuge(CENTRIFUGO_URL, {
    getToken: async () => {
      const headers = await getAuthHeaders();
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
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/realtime/token?channel=${encodeURIComponent(channel)}`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to get subscription token: ${res.status}`);
  }
  const data = await res.json();
  return data.token;
}
