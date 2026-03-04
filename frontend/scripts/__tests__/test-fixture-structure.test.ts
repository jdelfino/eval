/**
 * Tests for E2E fixture dependency ordering and teardown hygiene.
 *
 * The testNamespace fixture tears down after use by deleting the test
 * namespace from the database (FK CASCADE removes all related data). If the
 * browser page's WebSocket is still open at teardown time, async revision
 * writes may race with the DELETE and produce FK violations.
 *
 * Playwright's fixture dependency ordering guarantees that fixtures that
 * declare a dependency on testNamespace tear down BEFORE testNamespace itself.
 * By making the `page` fixture depend on `testNamespace`, the browser page
 * always closes first, disconnecting the WebSocket before the namespace
 * delete runs.
 *
 * These tests verify that the fixture file is structurally correct:
 * - No setTimeout workaround in testNamespace teardown
 * - The `page` fixture declares testNamespace as a parameter (forcing order)
 */

import * as fs from 'fs';
import * as path from 'path';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../e2e/fixtures/test-fixture.ts'
);

function readFixtureSource(): string {
  return fs.readFileSync(FIXTURE_PATH, 'utf-8');
}

describe('test-fixture.ts structural constraints', () => {
  describe('testNamespace teardown', () => {
    it('does NOT use setTimeout as a teardown workaround', () => {
      const source = readFixtureSource();
      // The setTimeout was a workaround for undefined fixture teardown order.
      // It must be removed once proper dependency ordering is in place.
      expect(source).not.toMatch(/setTimeout/);
    });

    it('does NOT include the settle time comment that documented the workaround', () => {
      const source = readFixtureSource();
      expect(source).not.toMatch(/Brief settle time/);
    });
  });

  describe('page fixture dependency on testNamespace', () => {
    it('declares testNamespace as a parameter of the page fixture', () => {
      const source = readFixtureSource();
      // The page fixture must destructure testNamespace from its first argument
      // so that Playwright knows page depends on testNamespace and tears them
      // down in the correct order (page first, then testNamespace).
      //
      // Match: page: async ({ page, ..., testNamespace }, use, testInfo) =>
      // The testNamespace must appear inside the destructuring braces of the
      // page fixture override.
      const pageFixtureMatch = source.match(
        /page:\s*async\s*\(\s*\{([^}]+)\}/
      );
      expect(pageFixtureMatch).not.toBeNull();
      const destructuredParams = pageFixtureMatch![1];
      expect(destructuredParams).toContain('testNamespace');
    });
  });
});
