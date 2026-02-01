import { createHmac } from 'crypto';

const MFA_SECRET = process.env.SUPABASE_SECRET_KEY!;
const MFA_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Signs an MFA cookie with the given email address.
 * The cookie contains the email, expiry timestamp, and HMAC signature.
 * @param email - The email address to include in the signed cookie
 * @returns A signed cookie string in format: email:expiresAt:signature
 */
export function signMfaCookie(email: string): string {
  const expiresAt = Date.now() + MFA_EXPIRY_MS;
  const data = `${email}:${expiresAt}`;
  const signature = createHmac('sha256', MFA_SECRET).update(data).digest('hex');
  return `${data}:${signature}`;
}

/**
 * Verifies an MFA cookie and extracts the email address.
 * @param cookie - The cookie string to verify (may be undefined)
 * @returns Object with email and valid flag
 */
export function verifyMfaCookie(cookie: string | undefined): { email: string; valid: boolean } {
  if (!cookie) return { email: '', valid: false };

  const parts = cookie.split(':');
  if (parts.length !== 3) return { email: '', valid: false };

  const [email, expiresAtStr, signature] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);

  if (isNaN(expiresAt)) return { email: '', valid: false };
  if (Date.now() > expiresAt) return { email, valid: false };

  const expected = createHmac('sha256', MFA_SECRET).update(`${email}:${expiresAt}`).digest('hex');
  return { email, valid: signature === expected };
}
