/**
 * Contract test: GET /api/v1/classes
 * Validates the Class[] response shape matches frontend type definitions.
 */
import { contractFetch } from './helpers';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
} from './validators';

describe('GET /api/v1/classes', () => {
  it('returns an array of Class objects with correct snake_case shape', async () => {
    const res = await contractFetch('/api/v1/classes');
    expect(res.status).toBe(200);

    const classes = await res.json();
    expect(Array.isArray(classes)).toBe(true);

    // Validate at least one class exists (setup created one)
    expect(classes.length).toBeGreaterThan(0);

    const cls = classes[0];

    // Field presence and types
    expectString(cls, 'id');
    expectString(cls, 'namespace_id');
    expectString(cls, 'name');
    expectNullableString(cls, 'description');
    expectString(cls, 'created_by');
    expectString(cls, 'created_at');
    expectString(cls, 'updated_at');

    // No PascalCase
    expectSnakeCaseKeys(cls, 'Class');
  });
});
