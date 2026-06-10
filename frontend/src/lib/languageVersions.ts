/**
 * Language version display map for the public problem hero meta line.
 *
 * Source of truth: executor/Dockerfile
 *   - python → debian:bookworm-slim default Python 3.11
 *   - java   → eclipse-temurin:21-jdk
 *
 * When the executor's pinned runtime version changes, update this map.
 * Do NOT add a language_version column to the schema — this is a frontend constant.
 */
export const LANGUAGE_VERSIONS: Record<string, string> = {
  python: '3.11',
  java: '21',
};

/**
 * Returns the display version string for a language, or null when the
 * language is not in the map (avoid rendering "undefined" in the UI).
 */
export function getLanguageVersion(language: string): string | null {
  return LANGUAGE_VERSIONS[language] ?? null;
}
