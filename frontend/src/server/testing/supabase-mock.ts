/**
 * Mock Supabase client for unit tests
 *
 * Provides Jest mock functions for common Supabase operations.
 * Used in setupTests.ts to globally mock the Supabase client.
 *
 * Note: Supabase does not provide official test utilities.
 * This is a simple mock that returns chainable functions.
 * For more complex scenarios, set up specific mocks in individual tests.
 */

export function createMockSupabaseClient() {
  // Create a shared query builder that can be configured per test
  const mockQueryBuilder: any = {};

  // Set up all the chainable methods to return the same builder instance
  mockQueryBuilder.select = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.insert = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.update = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.delete = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.eq = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.neq = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.gt = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.gte = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.lt = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.lte = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.like = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.ilike = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.is = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.in = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.contains = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.containedBy = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.range = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.match = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.not = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.or = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.filter = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.order = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.limit = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.offset = jest.fn(() => mockQueryBuilder);
  mockQueryBuilder.single = jest.fn().mockResolvedValue({ data: null, error: null });
  mockQueryBuilder.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  // Promise-like then for await compatibility
  mockQueryBuilder.then = jest.fn((resolve) => resolve({ data: [], error: null }));

  return {
    from: jest.fn().mockReturnValue(mockQueryBuilder),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      signUp: jest.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
    },
  };
}
