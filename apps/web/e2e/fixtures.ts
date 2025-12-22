import { test as base, expect, Page } from '@playwright/test';

/**
 * Test fixtures and utilities for Budi E2E tests
 */

// Test user credentials
export const TEST_USER = {
  email: 'test@budi.ai',
  password: 'TestPassword123!',
  name: 'Test User',
};

export const TEST_USER_2 = {
  email: 'test2@budi.ai',
  password: 'TestPassword456!',
  name: 'Test User 2',
};

// Test project data
export const TEST_PROJECT = {
  name: 'Test Project',
  description: 'A test project for e2e testing',
};

// Test track data
export const TEST_TRACK = {
  name: 'test-audio.wav',
  // In real tests, we'd use a test audio file
};

/**
 * Extended test with authentication helpers
 */
export const test = base.extend<{
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    // Navigate to login and authenticate
    await page.goto('/login');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {
      // If dashboard redirect fails, we might be on a different page
      console.log('Dashboard redirect not detected, continuing...');
    });

    await use(page);
  },
});

export { expect };

/**
 * Helper to fill login form
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

/**
 * Helper to fill signup form
 */
export async function signup(page: Page, email: string, password: string, name: string) {
  await page.goto('/signup');
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.click('button[type="submit"]');
}

/**
 * Helper to create a project
 */
export async function createProject(page: Page, name: string, description?: string) {
  await page.goto('/projects');
  await page.click('button:has-text("New Project")');
  await page.fill('input[name="name"]', name);
  if (description) {
    await page.fill('textarea[name="description"]', description);
  }
  await page.click('button[type="submit"]:has-text("Create")');
}

/**
 * Helper to wait for toast message
 */
export async function waitForToast(page: Page, text: string) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text })).toBeVisible({
    timeout: 5000,
  });
}

/**
 * Helper to mock API responses
 */
export async function mockApiResponse(page: Page, url: string, response: object) {
  await page.route(url, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Helper to mock authentication
 */
export async function mockAuth(page: Page) {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'test-user-id',
          email: TEST_USER.email,
          name: TEST_USER.name,
          avatar: null,
          subscription: { plan: 'FREE', status: 'active' },
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });
}
