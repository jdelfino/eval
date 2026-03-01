/**
 * Shared sessionStorage key constants.
 *
 * Centralized here so that all consumers import from a single source,
 * preventing silent bugs from diverging string literals.
 */

/** Cached user profile (JSON with timestamp for TTL). */
export const USER_PROFILE_CACHE_KEY = 'eval:user-profile';

/** Preview section ID — persisted so preview survives page reloads. */
export const PREVIEW_SECTION_KEY = 'eval:preview-section-id';
