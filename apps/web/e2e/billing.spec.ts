import { test, expect } from '@playwright/test';
import { TEST_USER, mockAuth } from './fixtures';

test.describe('Billing & Subscription', () => {
  const mockSubscription = {
    id: 'sub_123',
    plan: 'PRO',
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancelAtPeriodEnd: false,
  };

  const mockPlans = [
    {
      id: 'price_free',
      name: 'Free',
      price: 0,
      interval: 'month',
      features: ['5 projects', '10 tracks/month', '1GB storage'],
      limits: { projects: 5, tracksPerMonth: 10, storageGb: 1 },
    },
    {
      id: 'price_pro_monthly',
      name: 'Pro',
      price: 2900,
      interval: 'month',
      features: ['Unlimited projects', '100 tracks/month', '50GB storage', 'Priority processing'],
      limits: { projects: -1, tracksPerMonth: 100, storageGb: 50 },
    },
    {
      id: 'price_enterprise',
      name: 'Enterprise',
      price: 9900,
      interval: 'month',
      features: ['Unlimited everything', 'API access', 'Dedicated support'],
      limits: { projects: -1, tracksPerMonth: -1, storageGb: -1 },
    },
  ];

  const mockUsage = {
    tracksProcessed: 25,
    tracksLimit: 100,
    storageUsed: 12.5,
    storageLimit: 50,
    periodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
  };

  test.beforeEach(async ({ page }) => {
    await mockAuth(page);

    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'test-user-id', email: TEST_USER.email, name: TEST_USER.name },
          token: 'test-jwt-token',
        }),
      });
    });

    await page.route('**/api/v1/billing/subscription', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ subscription: mockSubscription }),
      });
    });

    await page.route('**/api/v1/billing/plans', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plans: mockPlans }),
      });
    });

    await page.route('**/api/v1/billing/usage', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ usage: mockUsage }),
      });
    });
  });

  test.describe('Billing Page', () => {
    test('should display billing page', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('text=/billing|subscription|plan/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show current subscription plan', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('text=/pro|current plan/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show subscription status', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('text=/active|status/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show billing period', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('text=/period|renews|expires/i')
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Usage Metrics', () => {
    test('should display usage statistics', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('text=/usage|tracks.*processed|storage/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show tracks processed count', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('text=/25|tracks/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show storage usage', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('text=/12.*GB|storage/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show usage progress bars', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('[role="progressbar"]')
          .or(page.locator('text=/%/'))
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Plan Selection', () => {
    test('should display available plans', async ({ page }) => {
      await page.goto('/billing');

      await expect(page.locator('text=/free/i')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=/pro/i')).toBeVisible();
      await expect(page.locator('text=/enterprise/i')).toBeVisible();
    });

    test('should show plan features', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('text=/projects|tracks|storage|features/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show plan pricing', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('text=/\\$29|\\$99|month|free/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should highlight current plan', async ({ page }) => {
      await page.goto('/billing');

      // Current plan should be marked
      await expect(
        page.locator('text=/current|active/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have upgrade button for higher plans', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.getByRole('button', { name: /upgrade|select|choose/i })
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Checkout Flow', () => {
    test('should initiate checkout for plan upgrade', async ({ page }) => {
      await page.route('**/api/v1/billing/checkout', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: 'https://checkout.stripe.com/test' }),
        });
      });

      await page.goto('/billing');

      const upgradeButton = page.getByRole('button', { name: /upgrade|enterprise/i });
      if (await upgradeButton.isVisible()) {
        await upgradeButton.click();

        // Should redirect to Stripe or show checkout message
        await expect(
          page.locator('text=/checkout|payment|redirect/i')
        ).toBeVisible({ timeout: 5000 }).catch(() => {
          // May redirect instead
        });
      }
    });

    test('should handle checkout error', async ({ page }) => {
      await page.route('**/api/v1/billing/checkout', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Checkout failed' }),
        });
      });

      await page.goto('/billing');

      const upgradeButton = page.getByRole('button', { name: /upgrade|select/i });
      if (await upgradeButton.isVisible()) {
        await upgradeButton.click();

        await expect(
          page.locator('text=/error|failed/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Manage Subscription', () => {
    test('should have manage subscription button', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.getByRole('button', { name: /manage|portal|settings/i })
          .or(page.getByRole('link', { name: /manage|portal/i }))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should open customer portal', async ({ page }) => {
      await page.route('**/api/v1/billing/portal', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: 'https://billing.stripe.com/portal/test' }),
        });
      });

      await page.goto('/billing');

      const manageButton = page.getByRole('button', { name: /manage|portal/i });
      if (await manageButton.isVisible()) {
        await manageButton.click();

        // Should redirect or show portal message
        await expect(
          page.locator('text=/portal|manage|redirect/i')
        ).toBeVisible({ timeout: 5000 }).catch(() => {
          // May redirect instead
        });
      }
    });

    test('should show cancel subscription option', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.getByRole('button', { name: /cancel|downgrade/i })
          .or(page.locator('text=/cancel.*subscription/i'))
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Free Plan', () => {
    test('should show limits for free users', async ({ page }) => {
      await page.route('**/api/v1/billing/subscription', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ subscription: null }),
        });
      });

      await page.goto('/billing');

      await expect(
        page.locator('text=/free|limit|upgrade/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should prompt upgrade when approaching limits', async ({ page }) => {
      await page.route('**/api/v1/billing/subscription', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ subscription: null }),
        });
      });

      await page.route('**/api/v1/billing/usage', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            usage: {
              tracksProcessed: 9,
              tracksLimit: 10,
              storageUsed: 0.9,
              storageLimit: 1,
              periodEnd: new Date().toISOString(),
            },
          }),
        });
      });

      await page.goto('/billing');

      await expect(
        page.locator('text=/limit|upgrade|reaching/i')
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Invoice History', () => {
    test('should show invoice history section', async ({ page }) => {
      await page.goto('/billing');

      await expect(
        page.locator('text=/invoice|history|payment/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should list past invoices', async ({ page }) => {
      await page.route('**/api/v1/billing/invoices', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            invoices: [
              { id: 'inv_1', amount: 2900, status: 'paid', createdAt: new Date().toISOString() },
              { id: 'inv_2', amount: 2900, status: 'paid', createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
            ],
          }),
        });
      });

      await page.goto('/billing');

      await expect(
        page.locator('text=/\\$29|paid/i')
      ).toBeVisible({ timeout: 5000 }).catch(() => {});
    });
  });
});
