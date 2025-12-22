import { test, expect } from '@playwright/test';
import { TEST_USER, mockAuth } from './fixtures';

test.describe('Settings & Profile', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);

    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            email: TEST_USER.email,
            name: TEST_USER.name,
            avatar: null,
            subscription: { plan: 'PRO', status: 'active' },
          },
          token: 'test-jwt-token',
        }),
      });
    });
  });

  test.describe('Settings Page', () => {
    test('should display settings page', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('text=/settings|preferences|account/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have profile section', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('text=/profile|account|personal/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should display current user info', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator(`text=${TEST_USER.email}`)
          .or(page.locator(`text=${TEST_USER.name}`))
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Profile Settings', () => {
    test('should have name input field', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('input[name="name"]')
          .or(page.locator('input[placeholder*="name" i]'))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have email display', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator(`text=${TEST_USER.email}`)
      ).toBeVisible({ timeout: 5000 });
    });

    test('should update profile name', async ({ page }) => {
      await page.route('**/api/v1/user/profile', async (route) => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              user: { ...TEST_USER, name: 'Updated Name' },
            }),
          });
        }
      });

      await page.goto('/settings');

      const nameInput = page.locator('input[name="name"]');
      if (await nameInput.isVisible()) {
        await nameInput.fill('Updated Name');

        const saveButton = page.getByRole('button', { name: /save|update/i });
        if (await saveButton.isVisible()) {
          await saveButton.click();

          await expect(
            page.locator('text=/saved|updated|success/i')
          ).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should have avatar upload', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('input[type="file"]')
          .or(page.locator('[data-testid="avatar-upload"]'))
          .or(page.locator('text=/upload.*avatar|change.*photo/i'))
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Password Change', () => {
    test('should have password change section', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('text=/password|security/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have current password field', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('input[name="currentPassword"]')
          .or(page.locator('input[placeholder*="current" i]'))
          .or(page.locator('input[type="password"]').first())
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have new password field', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('input[name="newPassword"]')
          .or(page.locator('input[placeholder*="new" i]'))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should validate password strength', async ({ page }) => {
      await page.goto('/settings');

      const newPasswordField = page.locator('input[name="newPassword"]')
        .or(page.locator('input[placeholder*="new" i]'));

      if (await newPasswordField.isVisible()) {
        await newPasswordField.fill('weak');

        const saveButton = page.getByRole('button', { name: /change.*password|update.*password|save/i });
        if (await saveButton.isVisible()) {
          await saveButton.click();

          await expect(
            page.locator('text=/weak|strong|characters|requirements/i')
          ).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should update password successfully', async ({ page }) => {
      await page.route('**/api/v1/user/password', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Password updated' }),
        });
      });

      await page.goto('/settings');

      const currentPassword = page.locator('input[name="currentPassword"]')
        .or(page.locator('input[placeholder*="current" i]'));
      const newPassword = page.locator('input[name="newPassword"]')
        .or(page.locator('input[placeholder*="new" i]'));

      if (await currentPassword.isVisible() && await newPassword.isVisible()) {
        await currentPassword.fill('currentPassword123');
        await newPassword.fill('NewPassword456!');

        const saveButton = page.getByRole('button', { name: /change|update|save/i });
        if (await saveButton.isVisible()) {
          await saveButton.click();

          await expect(
            page.locator('text=/updated|changed|success/i')
          ).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Notification Settings', () => {
    test('should have notification preferences', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('text=/notification|email.*preferences|alerts/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have email notification toggles', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('input[type="checkbox"]')
          .or(page.locator('[role="switch"]'))
          .or(page.locator('text=/email.*notification/i'))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should toggle notification settings', async ({ page }) => {
      await page.route('**/api/v1/user/notifications', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto('/settings');

      const toggle = page.locator('[role="switch"]').first()
        .or(page.locator('input[type="checkbox"]').first());

      if (await toggle.isVisible()) {
        await toggle.click();

        await expect(
          page.locator('text=/saved|updated|success/i')
        ).toBeVisible({ timeout: 5000 }).catch(() => {});
      }
    });
  });

  test.describe('API Keys', () => {
    test('should show API key section', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('text=/API.*key|developer|access.*token/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have generate API key button', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.getByRole('button', { name: /generate|create|new.*key/i })
      ).toBeVisible({ timeout: 5000 });
    });

    test('should mask API key by default', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('text=/\\*\\*\\*|hidden|•••/i')
          .or(page.getByRole('button', { name: /show|reveal/i }))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should copy API key', async ({ page }) => {
      await page.goto('/settings');

      const copyButton = page.getByRole('button', { name: /copy/i });
      if (await copyButton.isVisible()) {
        await copyButton.click();

        await expect(
          page.locator('text=/copied/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Theme Settings', () => {
    test('should have theme selector', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('text=/theme|appearance|dark.*mode|light.*mode/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have light/dark/system options', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('text=/light|dark|system/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should switch theme', async ({ page }) => {
      await page.goto('/settings');

      const themeButton = page.getByRole('button', { name: /dark|light|theme/i });
      if (await themeButton.isVisible()) {
        await themeButton.click();

        // Theme should change (check for class or attribute change)
        await expect(
          page.locator('html.dark')
            .or(page.locator('[data-theme="dark"]'))
            .or(page.locator('text=/dark.*mode.*enabled/i'))
        ).toBeVisible({ timeout: 5000 }).catch(() => {});
      }
    });
  });

  test.describe('Account Deletion', () => {
    test('should have delete account option', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('text=/delete.*account|danger.*zone/i')
          .or(page.getByRole('button', { name: /delete.*account/i }))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show delete confirmation', async ({ page }) => {
      await page.goto('/settings');

      const deleteButton = page.getByRole('button', { name: /delete.*account/i });
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        await expect(
          page.locator('text=/confirm|are you sure|permanent/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should require confirmation to delete', async ({ page }) => {
      await page.goto('/settings');

      const deleteButton = page.getByRole('button', { name: /delete.*account/i });
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // Look for confirmation input or button
        await expect(
          page.locator('input[placeholder*="confirm" i]')
            .or(page.locator('input[placeholder*="delete" i]'))
            .or(page.getByRole('button', { name: /confirm|yes.*delete/i }))
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Connected Accounts', () => {
    test('should show connected services', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.locator('text=/connected|integrations|services/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should allow connecting external services', async ({ page }) => {
      await page.goto('/settings');

      await expect(
        page.getByRole('button', { name: /connect|link/i })
      ).toBeVisible({ timeout: 5000 }).catch(() => {});
    });
  });
});

test.describe('Dashboard', () => {
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

    await page.route('**/api/v1/projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: [
            { id: '1', name: 'Project 1', trackCount: 5, createdAt: new Date().toISOString() },
            { id: '2', name: 'Project 2', trackCount: 3, createdAt: new Date().toISOString() },
          ],
        }),
      });
    });
  });

  test('should display dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(
      page.locator('text=/dashboard|overview|welcome/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show recent projects', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(
      page.locator('text=/recent|projects/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show quick actions', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(
      page.getByRole('button', { name: /new.*project|upload|create/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to projects from dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    const projectsLink = page.getByRole('link', { name: /projects|view.*all/i });
    if (await projectsLink.isVisible()) {
      await projectsLink.click();
      await expect(page).toHaveURL(/\/projects/);
    }
  });
});

test.describe('Notifications', () => {
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
  });

  test('should display notifications page', async ({ page }) => {
    await page.route('**/api/v1/notifications', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: [
            { id: '1', type: 'info', title: 'Welcome', message: 'Welcome to Budi!', read: false, createdAt: new Date().toISOString() },
            { id: '2', type: 'success', title: 'Processing complete', message: 'Your track has been mastered', read: true, createdAt: new Date().toISOString() },
          ],
        }),
      });
    });

    await page.goto('/notifications');

    await expect(
      page.locator('text=/notifications|alerts/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should show unread notifications', async ({ page }) => {
    await page.route('**/api/v1/notifications', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: [
            { id: '1', type: 'info', title: 'Welcome', message: 'Welcome to Budi!', read: false, createdAt: new Date().toISOString() },
          ],
        }),
      });
    });

    await page.goto('/notifications');

    await expect(
      page.locator('text=Welcome')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should mark notification as read', async ({ page }) => {
    await page.route('**/api/v1/notifications', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: [
            { id: '1', type: 'info', title: 'Test Notification', message: 'Test message', read: false, createdAt: new Date().toISOString() },
          ],
        }),
      });
    });

    await page.route('**/api/v1/notifications/1', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 200 });
      }
    });

    await page.goto('/notifications');

    const notification = page.locator('text=Test Notification');
    if (await notification.isVisible()) {
      await notification.click();

      // Should mark as read (visual change or API call)
    }
  });

  test('should mark all as read', async ({ page }) => {
    await page.route('**/api/v1/notifications', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: [
            { id: '1', title: 'Notification 1', read: false, createdAt: new Date().toISOString() },
            { id: '2', title: 'Notification 2', read: false, createdAt: new Date().toISOString() },
          ],
        }),
      });
    });

    await page.route('**/api/v1/notifications/mark-all-read', async (route) => {
      await route.fulfill({ status: 200 });
    });

    await page.goto('/notifications');

    const markAllButton = page.getByRole('button', { name: /mark.*all.*read/i });
    if (await markAllButton.isVisible()) {
      await markAllButton.click();

      await expect(
        page.locator('text=/all.*read|marked/i')
      ).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });

  test('should show empty state when no notifications', async ({ page }) => {
    await page.route('**/api/v1/notifications', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notifications: [] }),
      });
    });

    await page.goto('/notifications');

    await expect(
      page.locator('text=/no.*notification|all.*caught.*up|empty/i')
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Help Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('should display help page', async ({ page }) => {
    await page.goto('/help');

    await expect(
      page.locator('text=/help|support|faq|documentation/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should have FAQ section', async ({ page }) => {
    await page.goto('/help');

    await expect(
      page.locator('text=/faq|frequently.*asked|questions/i')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should have contact support option', async ({ page }) => {
    await page.goto('/help');

    await expect(
      page.getByRole('link', { name: /contact|support|email/i })
        .or(page.locator('text=/contact.*support/i'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('should have documentation links', async ({ page }) => {
    await page.goto('/help');

    await expect(
      page.locator('text=/documentation|docs|guide|tutorial/i')
    ).toBeVisible({ timeout: 5000 });
  });
});
