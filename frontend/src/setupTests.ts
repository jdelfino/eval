import '@testing-library/jest-dom';
import { createMockSupabaseClient } from './server/testing/supabase-mock';

// Mock Supabase client globally for unit tests
jest.mock('./server/supabase/client', () => ({
  getSupabaseClient: () => createMockSupabaseClient(),
  getSupabaseClientWithAuth: () => createMockSupabaseClient(),
  getClient: () => createMockSupabaseClient(),
}));

// Mock browser-side Supabase client
jest.mock('./lib/supabase/client', () => ({
  createClient: () => createMockSupabaseClient()
}));
