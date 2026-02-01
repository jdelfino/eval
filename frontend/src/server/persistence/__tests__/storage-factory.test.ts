/**
 * Tests for storage factory function
 *
 * Verifies that the createStorage factory correctly instantiates
 * the Supabase storage backend with RLS-backed access control.
 */

import { createStorage, StorageBackend } from '../index';

describe('Storage Factory', () => {
  describe('createStorage', () => {
    it('should create Supabase storage backend with accessToken', async () => {
      // Mock environment variables for Supabase
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SECRET_KEY;
      const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
      process.env.SUPABASE_SECRET_KEY = 'test-service-key';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

      try {
        const storage = await createStorage('test-access-token');

        expect(storage).toBeInstanceOf(StorageBackend);
        expect(storage.sessions).toBeDefined();
        expect(storage.revisions).toBeDefined();
        expect(storage.users).toBeDefined();
        expect(storage.problems).toBeDefined();
        expect(storage.classes).toBeDefined();
        expect(storage.sections).toBeDefined();
        expect(storage.memberships).toBeDefined();

        await storage.shutdown();
      } finally {
        // Restore environment variables
        if (originalUrl) {
          process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
        } else {
          delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        }
        if (originalKey) {
          process.env.SUPABASE_SECRET_KEY = originalKey;
        } else {
          delete process.env.SUPABASE_SECRET_KEY;
        }
        if (originalPublishableKey) {
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalPublishableKey;
        } else {
          delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        }
      }
    });

    it('should initialize all repositories', async () => {
      const storage = await createStorage('test-access-token');

      // Verify that repositories are ready to use
      expect(storage.sessions).toBeDefined();
      expect(storage.revisions).toBeDefined();
      expect(storage.users).toBeDefined();
      expect(storage.problems).toBeDefined();

      // Verify health check works
      const health = await storage.health();
      expect(typeof health).toBe('boolean');

      await storage.shutdown();
    });
  });

  describe('StorageBackend', () => {
    it('should provide transaction support', async () => {
      const storage = new StorageBackend('test-access-token');
      await storage.initialize();

      const result = await storage.transaction(async (tx) => {
        expect(tx.sessions).toBe(storage.sessions);
        expect(tx.revisions).toBe(storage.revisions);
        expect(tx.users).toBe(storage.users);
        expect(tx.problems).toBe(storage.problems);
        return 'success';
      });

      expect(result).toBe('success');

      await storage.shutdown();
    });
  });
});
