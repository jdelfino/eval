/**
 * Contract tests for preview API functions.
 *
 * Tests enterPreview (POST) and exitPreview (DELETE) against the real backend.
 */

// helpers MUST be imported before API functions — it sets NEXT_PUBLIC_API_URL
import { INSTRUCTOR_TOKEN, configureTestAuth, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import { enterPreview, exitPreview } from '@/lib/api/preview';
import { expectSnakeCaseKeys } from './validators';

describe('enterPreview()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('creates a preview student and returns PreviewResponse with correct snake_case shape', async () => {
    const sectionId = state.sectionId;
    expect(sectionId).toBeTruthy();

    const result = await enterPreview(sectionId);

    // Validate snake_case shape
    expectSnakeCaseKeys(result, 'PreviewResponse');

    // Validate required string fields
    expect(typeof result.preview_user_id).toBe('string');
    expect(typeof result.section_id).toBe('string');

    // Validate values
    expect(result.section_id).toBe(sectionId);
    expect(result.preview_user_id).toBeTruthy();
  });

  it('is idempotent — calling twice returns same preview_user_id', async () => {
    const sectionId = state.sectionId;

    const first = await enterPreview(sectionId);
    const second = await enterPreview(sectionId);

    expect(second.preview_user_id).toBe(first.preview_user_id);
    expect(second.section_id).toBe(first.section_id);
  });
});

describe('exitPreview()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('exits preview without error', async () => {
    const sectionId = state.sectionId;
    expect(sectionId).toBeTruthy();

    // Ensure preview is entered first
    await enterPreview(sectionId);

    // Exit should succeed without error (returns void)
    await expect(exitPreview(sectionId)).resolves.toBeUndefined();
  });
});
