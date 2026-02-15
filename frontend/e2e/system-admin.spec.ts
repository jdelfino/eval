/**
 * E2E tests for system admin core flows.
 *
 * Tests the essential system admin functionality:
 * 1. Sign in as system admin
 * 2. Create namespace via UI
 * 3. Navigate to user management for new namespace
 * 4. Sidebar navigation between views
 * 5. Verify invitations tab and create invitation button
 *
 * Uses AUTH_MODE=test — no external auth provider required.
 */

import { test, expect } from './fixtures/test-fixture';
import {
  loginAsSystemAdmin,
  navigateToNamespaces,
  navigateToUserManagement,
} from './fixtures/auth';

test.describe('System Admin Core Flows', () => {
  test('System admin can create namespace and view invitation UI', async ({ page }) => {
    // Generate unique namespace ID for this test
    const namespaceId = `e2e-ns-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Sign in as system admin
    await loginAsSystemAdmin(page);

    // Wait for redirect to system admin dashboard
    await expect(page).toHaveURL('/system', {});
    await expect(page.locator('h1:has-text("System Administration")')).toBeVisible();

    // Verify we can see the namespace management UI
    await expect(page.locator('h2:has-text("Namespaces")')).toBeVisible();

    // Click to open create namespace form
    await page.click('button:has-text("Create New Namespace")');

    // Wait for form to appear and fill it
    await expect(page.locator('input#namespace-id')).toBeVisible();
    await page.fill('input#namespace-id', namespaceId);
    await page.fill('input#display-name', 'Test Organization');

    // Submit the form
    await page.click('button:has-text("Create Namespace")');

    // Wait for success - namespace should appear in the list
    await expect(page.locator(`text=${namespaceId}`)).toBeVisible();
    await expect(page.locator('h3:has-text("Test Organization")').first()).toBeVisible();

    // Click "Manage Users" for the new namespace
    // Find the namespace ID text in the card, then navigate up to the card container
    const namespaceCard = page.locator('div.text-sm.text-gray-500.font-mono', { hasText: namespaceId });
    await namespaceCard.scrollIntoViewIfNeeded();

    // Find the Manage Users button in the same card as our namespace ID
    const card = namespaceCard.locator('xpath=ancestor::div[contains(@class, "border")]').first();
    await card.locator('button:has-text("Manage Users")').click();

    // Should navigate to user management page for this namespace
    await expect(page).toHaveURL(`/system/namespaces/${namespaceId}`);
    await expect(page.locator('text=Test Organization')).toBeVisible();

    // Verify the users list heading is shown (will be empty for new namespace)
    await expect(page.getByRole('heading', { name: /Users/ })).toBeVisible();

    // Navigate back to system dashboard via sidebar (tests sidebar navigation)
    await navigateToNamespaces(page);
    await expect(page).toHaveURL('/system');

    // Verify namespace still shows in the list
    await expect(page.locator('div.text-sm.text-gray-500.font-mono', { hasText: namespaceId })).toBeVisible();

    // Navigate to User Management via sidebar
    await navigateToUserManagement(page);
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('h1:has-text("System Administration")')).toBeVisible();

    // Navigate back to Namespaces via sidebar
    await navigateToNamespaces(page);

    // Verify Invitations tab exists and is accessible
    await page.click('button:has-text("Invitations")');
    await expect(page.locator('h2:has-text("Invitations")')).toBeVisible();

    // Verify Create Invitation button is available
    await expect(page.locator('button:has-text("Create Invitation")')).toBeVisible();
  });
});
