/**
 * Tests for languageVersions — LANGUAGE_VERSIONS constant map and getLanguageVersion helper.
 *
 * Contract: The map provides display versions for known languages (python→3.11, java→21).
 * getLanguageVersion returns null for unknown languages to prevent "undefined" in the UI.
 * Source of truth is executor/Dockerfile — update this map when the executor runtime changes.
 */
import { LANGUAGE_VERSIONS, getLanguageVersion } from '../languageVersions';

describe('LANGUAGE_VERSIONS', () => {
  it('maps python to 3.11 (debian:bookworm-slim default)', () => {
    expect(LANGUAGE_VERSIONS['python']).toBe('3.11');
  });

  it('maps java to 21 (eclipse-temurin:21-jdk)', () => {
    expect(LANGUAGE_VERSIONS['java']).toBe('21');
  });
});

describe('getLanguageVersion', () => {
  it('returns the version string for a known language', () => {
    expect(getLanguageVersion('python')).toBe('3.11');
    expect(getLanguageVersion('java')).toBe('21');
  });

  it('returns null for an unknown language (not undefined — prevents UI render of "undefined")', () => {
    /**
     * Contract: unknown languages must return null, never undefined.
     * If this returns undefined, it will render "python 3.11 undefined" in the meta line
     * for languages added to the executor before the constant map is updated.
     */
    expect(getLanguageVersion('rust')).toBeNull();
    expect(getLanguageVersion('go')).toBeNull();
    expect(getLanguageVersion('')).toBeNull();
  });
});
