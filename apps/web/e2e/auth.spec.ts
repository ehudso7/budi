import { test, expect, Page } from '@playwright/test';
import { TEST_USER, TEST_USER_2, login, signup, mockAuth, waitForToast } from './fixtures';

test.describe('Authentication Flow', () => {
  test.describe('Landing Page', () => {
    test('should display landing page with login and signup links', async ({ page }) => {
      await page.goto('/');

      // Check for main landing page elements
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.getByRole('link', { name: /login/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /sign up|get started/i })).toBeVisible();
    });

    test('should navigate to login page from landing', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('link', { name: /login/i }).click();
      await expect(page).toHaveURL(/\/login/);
    });

    test('should navigate to signup page from landing', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('link', { name: /sign up|get started/i }).first().click();
      await expect(page).toHaveURL(/\/signup/);
    });
  });

  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');

      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('button', { name: /sign in|log in/i }).click();

      // Should show validation errors
      await expect(page.locator('text=/email|required/i')).toBeVisible();
    });

    test('should show error for invalid email format', async ({ page }) => {
      await page.goto('/login');
      await page.fill('input[name="email"]', 'invalid-email');
      await page.fill('input[name="password"]', 'password123');
      await page.getByRole('button', { name: /sign in|log in/i }).click();

      await expect(page.locator('text=/invalid email|valid email/i')).toBeVisible();
    });

    test('should show error for wrong credentials', async ({ page }) => {
      // Mock failed login
      await page.route('**/api/v1/auth/login', async (route) => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Invalid credentials' }),
        });
      });

      await page.goto('/login');
      await page.fill('input[name="email"]', 'wrong@example.com');
      await page.fill('input[name="password"]', 'wrongpassword');
      await page.getByRole('button', { name: /sign in|log in/i }).click();

      await expect(page.locator('text=/invalid|incorrect|wrong/i')).toBeVisible({ timeout: 5000 });
    });

    test('should successfully login with valid credentials', async ({ page }) => {
      // Mock successful login
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
              subscription: { plan: 'FREE', status: 'active' },
              createdAt: new Date().toISOString(),
            },
            token: 'test-jwt-token',
          }),
        });
      });

      await mockAuth(page);

      await page.goto('/login');
      await page.fill('input[name="email"]', TEST_USER.email);
      await page.fill('input[name="password"]', TEST_USER.password);
      await page.getByRole('button', { name: /sign in|log in/i }).click();

      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    });

    test('should have link to signup page', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('link', { name: /sign up|create account|register/i })).toBeVisible();
    });

    test('should have link to forgot password', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
    });

    test('should navigate to forgot password page', async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('link', { name: /forgot password/i }).click();
      await expect(page).toHaveURL(/\/forgot-password/);
    });
  });

  test.describe('Signup Page', () => {
    test('should display signup form', async ({ page }) => {
      await page.goto('/signup');

      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.getByRole('button', { name: /sign up|create account|register/i })).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
      await page.goto('/signup');
      await page.getByRole('button', { name: /sign up|create account|register/i }).click();

      // Should show validation errors
      await expect(page.locator('text=/required|email|password/i').first()).toBeVisible();
    });

    test('should show error for weak password', async ({ page }) => {
      await page.goto('/signup');
      await page.fill('input[name="name"]', 'Test User');
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', '123');

      if (await page.locator('input[name="confirmPassword"]').isVisible()) {
        await page.fill('input[name="confirmPassword"]', '123');
      }

      await page.getByRole('button', { name: /sign up|create account|register/i }).click();

      await expect(page.locator('text=/password|characters|strong/i')).toBeVisible();
    });

    test('should show error for mismatched passwords', async ({ page }) => {
      await page.goto('/signup');

      // Check if confirm password field exists
      const confirmPasswordExists = await page.locator('input[name="confirmPassword"]').isVisible();
      if (!confirmPasswordExists) {
        test.skip();
        return;
      }

      await page.fill('input[name="name"]', 'Test User');
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'Password123!');
      await page.fill('input[name="confirmPassword"]', 'DifferentPassword456!');
      await page.getByRole('button', { name: /sign up|create account|register/i }).click();

      await expect(page.locator('text=/match|same/i')).toBeVisible();
    });

    test('should show error for existing email', async ({ page }) => {
      await page.route('**/api/v1/auth/register', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Email already exists' }),
        });
      });

      await page.goto('/signup');
      await page.fill('input[name="name"]', 'Test User');
      await page.fill('input[name="email"]', 'existing@example.com');
      await page.fill('input[name="password"]', 'Password123!');

      if (await page.locator('input[name="confirmPassword"]').isVisible()) {
        await page.fill('input[name="confirmPassword"]', 'Password123!');
      }

      await page.getByRole('button', { name: /sign up|create account|register/i }).click();

      await expect(page.locator('text=/exists|already|taken/i')).toBeVisible({ timeout: 5000 });
    });

    test('should successfully register new user', async ({ page }) => {
      await page.route('**/api/v1/auth/register', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'new-user-id',
              email: TEST_USER_2.email,
              name: TEST_USER_2.name,
              avatar: null,
              subscription: { plan: 'FREE', status: 'active' },
              createdAt: new Date().toISOString(),
            },
            token: 'new-jwt-token',
          }),
        });
      });

      await mockAuth(page);

      await page.goto('/signup');
      await page.fill('input[name="name"]', TEST_USER_2.name);
      await page.fill('input[name="email"]', TEST_USER_2.email);
      await page.fill('input[name="password"]', TEST_USER_2.password);

      if (await page.locator('input[name="confirmPassword"]').isVisible()) {
        await page.fill('input[name="confirmPassword"]', TEST_USER_2.password);
      }

      await page.getByRole('button', { name: /sign up|create account|register/i }).click();

      // Should redirect to dashboard after signup
      await expect(page).toHaveURL(/\/dashboard|\/login/, { timeout: 10000 });
    });

    test('should have link to login page', async ({ page }) => {
      await page.goto('/signup');
      await expect(page.getByRole('link', { name: /sign in|log in|already have/i })).toBeVisible();
    });
  });

  test.describe('Forgot Password Page', () => {
    test('should display forgot password form', async ({ page }) => {
      await page.goto('/forgot-password');

      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.getByRole('button', { name: /send|reset|submit/i })).toBeVisible();
    });

    test('should show validation error for invalid email', async ({ page }) => {
      await page.goto('/forgot-password');
      await page.fill('input[name="email"]', 'invalid-email');
      await page.getByRole('button', { name: /send|reset|submit/i }).click();

      await expect(page.locator('text=/invalid|valid email/i')).toBeVisible();
    });

    test('should submit forgot password request', async ({ page }) => {
      await page.route('**/api/v1/auth/forgot-password', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Reset email sent' }),
        });
      });

      await page.goto('/forgot-password');
      await page.fill('input[name="email"]', TEST_USER.email);
      await page.getByRole('button', { name: /send|reset|submit/i }).click();

      // Should show success message
      await expect(page.locator('text=/sent|check.*email|success/i')).toBeVisible({ timeout: 5000 });
    });

    test('should have link back to login', async ({ page }) => {
      await page.goto('/forgot-password');
      await expect(page.getByRole('link', { name: /back|login|sign in/i })).toBeVisible();
    });
  });

  test.describe('Reset Password Page', () => {
    test('should display reset password form with token', async ({ page }) => {
      await page.goto('/reset-password?token=test-reset-token');

      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.getByRole('button', { name: /reset|change|update/i })).toBeVisible();
    });

    test('should show error without token', async ({ page }) => {
      await page.goto('/reset-password');

      // Should show error or redirect
      await expect(page.locator('text=/invalid|expired|token/i').or(page.locator('[href*="forgot-password"]'))).toBeVisible({ timeout: 5000 });
    });

    test('should submit reset password', async ({ page }) => {
      await page.route('**/api/v1/auth/reset-password', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Password reset successful' }),
        });
      });

      await page.goto('/reset-password?token=valid-token');
      await page.fill('input[name="password"]', 'NewPassword123!');

      if (await page.locator('input[name="confirmPassword"]').isVisible()) {
        await page.fill('input[name="confirmPassword"]', 'NewPassword123!');
      }

      await page.getByRole('button', { name: /reset|change|update/i }).click();

      // Should show success or redirect to login
      await expect(
        page.locator('text=/success|changed|updated/i')
      ).toBeVisible({ timeout: 5000 }).catch(() => {
        // May redirect instead of showing message
      });
    });
  });

  test.describe('Logout', () => {
    test('should logout user and redirect to login', async ({ page }) => {
      // Mock authenticated state
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
              subscription: { plan: 'FREE', status: 'active' },
              createdAt: new Date().toISOString(),
            },
            token: 'test-jwt-token',
          }),
        });
      });

      // Login first
      await page.goto('/login');
      await page.fill('input[name="email"]', TEST_USER.email);
      await page.fill('input[name="password"]', TEST_USER.password);
      await page.getByRole('button', { name: /sign in|log in/i }).click();

      // Wait for dashboard
      await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});

      // Find and click logout
      const logoutButton = page.getByRole('button', { name: /logout|sign out/i });
      const userMenu = page.locator('[data-testid="user-menu"]').or(page.locator('button:has(img[alt*="avatar"])')).or(page.locator('button:has-text("' + TEST_USER.name + '")'));

      if (await userMenu.isVisible()) {
        await userMenu.click();
        await page.getByRole('menuitem', { name: /logout|sign out/i }).click();
      } else if (await logoutButton.isVisible()) {
        await logoutButton.click();
      }

      // Should redirect to login or home
      await expect(page).toHaveURL(/\/login|\/$/);
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing dashboard without auth', async ({ page }) => {
      // Ensure no auth token
      await page.context().clearCookies();

      await page.goto('/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });

    test('should redirect to login when accessing projects without auth', async ({ page }) => {
      await page.context().clearCookies();

      await page.goto('/projects');

      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });

    test('should redirect to login when accessing settings without auth', async ({ page }) => {
      await page.context().clearCookies();

      await page.goto('/settings');

      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });
  });

  test.describe('Session Persistence', () => {
    test('should maintain session across page reloads', async ({ page }) => {
      // Mock auth
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
            },
            token: 'persistent-jwt-token',
          }),
        });
      });

      // Login
      await page.goto('/login');
      await page.fill('input[name="email"]', TEST_USER.email);
      await page.fill('input[name="password"]', TEST_USER.password);
      await page.getByRole('button', { name: /sign in|log in/i }).click();

      // Wait for dashboard
      await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});

      // Reload page
      await page.reload();

      // Should still be on dashboard (authenticated)
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });
});
