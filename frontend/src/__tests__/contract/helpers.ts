const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';
const CONTRACT_NS = process.env.CONTRACT_NS || 'contract-test';
const ADMIN_TOKEN = 'test:contract-admin:contract-admin@test.local';

export function contractFetch(path: string, token: string = ADMIN_TOKEN, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

export function testToken(externalId: string, email: string) {
  return `test:${externalId}:${email}`;
}

export { CONTRACT_NS };
