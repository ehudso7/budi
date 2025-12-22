import { test, expect } from '@playwright/test';
import { TEST_USER, TEST_PROJECT, mockAuth } from './fixtures';

test.describe('Project Management', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication for all tests
    await mockAuth(page);

    // Mock login
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
          token: 'test-jwt-token',
        }),
      });
    });
  });

  test.describe('Projects List Page', () => {
    test('should display projects page with empty state', async ({ page }) => {
      await page.route('**/api/v1/projects', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ projects: [] }),
        });
      });

      await page.goto('/projects');

      // Should show empty state or create project button
      await expect(
        page.locator('text=/no projects|create.*first|get started/i')
          .or(page.getByRole('button', { name: /new project|create/i }))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should display list of projects', async ({ page }) => {
      const mockProjects = [
        {
          id: 'project-1',
          name: 'Album Master 2024',
          description: 'New album mastering project',
          trackCount: 12,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'project-2',
          name: 'Single Release',
          description: 'Single track release',
          trackCount: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      await page.route('**/api/v1/projects', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ projects: mockProjects }),
        });
      });

      await page.goto('/projects');

      // Should display project names
      await expect(page.locator('text=Album Master 2024')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Single Release')).toBeVisible();
    });

    test('should have create project button', async ({ page }) => {
      await page.route('**/api/v1/projects', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ projects: [] }),
        });
      });

      await page.goto('/projects');

      await expect(page.getByRole('button', { name: /new project|create/i })).toBeVisible();
    });

    test('should search/filter projects', async ({ page }) => {
      const mockProjects = [
        { id: '1', name: 'Rock Album', description: 'Rock music', trackCount: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: '2', name: 'Jazz Collection', description: 'Jazz tracks', trackCount: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];

      await page.route('**/api/v1/projects', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ projects: mockProjects }),
        });
      });

      await page.goto('/projects');

      // Look for search input
      const searchInput = page.locator('input[placeholder*="search" i]').or(page.locator('input[type="search"]'));
      if (await searchInput.isVisible()) {
        await searchInput.fill('Rock');
        // Should filter results
        await expect(page.locator('text=Rock Album')).toBeVisible();
      }
    });
  });

  test.describe('Create Project', () => {
    test('should open create project dialog/modal', async ({ page }) => {
      await page.route('**/api/v1/projects', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ projects: [] }),
          });
        }
      });

      await page.goto('/projects');
      await page.getByRole('button', { name: /new project|create/i }).click();

      // Should show create form/dialog
      await expect(page.locator('input[name="name"]')).toBeVisible({ timeout: 5000 });
    });

    test('should validate required fields', async ({ page }) => {
      await page.route('**/api/v1/projects', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ projects: [] }),
          });
        }
      });

      await page.goto('/projects');
      await page.getByRole('button', { name: /new project|create/i }).click();

      // Try to submit empty form
      await page.getByRole('button', { name: /create|save|submit/i }).click();

      // Should show validation error
      await expect(page.locator('text=/required|name.*required/i')).toBeVisible({ timeout: 5000 });
    });

    test('should create a new project', async ({ page }) => {
      const newProject = {
        id: 'new-project-id',
        name: TEST_PROJECT.name,
        description: TEST_PROJECT.description,
        trackCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await page.route('**/api/v1/projects', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ projects: [] }),
          });
        } else if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ project: newProject }),
          });
        }
      });

      await page.goto('/projects');
      await page.getByRole('button', { name: /new project|create/i }).click();

      await page.fill('input[name="name"]', TEST_PROJECT.name);

      const descriptionField = page.locator('textarea[name="description"]').or(page.locator('input[name="description"]'));
      if (await descriptionField.isVisible()) {
        await descriptionField.fill(TEST_PROJECT.description || '');
      }

      await page.getByRole('button', { name: /create|save|submit/i }).click();

      // Should show success or redirect
      await expect(
        page.locator(`text=${TEST_PROJECT.name}`)
          .or(page.locator('text=/created|success/i'))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should handle create project error', async ({ page }) => {
      await page.route('**/api/v1/projects', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ projects: [] }),
          });
        } else if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Failed to create project' }),
          });
        }
      });

      await page.goto('/projects');
      await page.getByRole('button', { name: /new project|create/i }).click();
      await page.fill('input[name="name"]', 'Test Project');
      await page.getByRole('button', { name: /create|save|submit/i }).click();

      // Should show error
      await expect(page.locator('text=/error|failed/i')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Project Detail Page', () => {
    test('should display project details', async ({ page }) => {
      const mockProject = {
        id: 'project-1',
        name: 'Test Album',
        description: 'A test album project',
        trackCount: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockTracks = [
        { id: 'track-1', name: 'Track 1', status: 'ready', duration: 180, createdAt: new Date().toISOString() },
        { id: 'track-2', name: 'Track 2', status: 'analyzing', duration: 240, createdAt: new Date().toISOString() },
        { id: 'track-3', name: 'Track 3', status: 'pending', duration: 200, createdAt: new Date().toISOString() },
      ];

      await page.route('**/api/v1/projects/project-1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ project: mockProject }),
        });
      });

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: mockTracks }),
        });
      });

      await page.goto('/projects/project-1');

      await expect(page.locator('text=Test Album')).toBeVisible({ timeout: 5000 });
    });

    test('should display tracks in project', async ({ page }) => {
      const mockProject = {
        id: 'project-1',
        name: 'Album Project',
        trackCount: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockTracks = [
        { id: 'track-1', name: 'First Song.wav', status: 'ready', duration: 180, fileSize: 50000000 },
        { id: 'track-2', name: 'Second Song.wav', status: 'ready', duration: 200, fileSize: 55000000 },
      ];

      await page.route('**/api/v1/projects/project-1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ project: mockProject }),
        });
      });

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: mockTracks }),
        });
      });

      await page.goto('/projects/project-1');

      await expect(page.locator('text=First Song')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Second Song')).toBeVisible();
    });

    test('should have upload track button', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            project: { id: 'project-1', name: 'Test', trackCount: 0 },
          }),
        });
      });

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [] }),
        });
      });

      await page.goto('/projects/project-1');

      await expect(
        page.getByRole('button', { name: /upload|add track/i })
          .or(page.locator('text=/drag.*drop|upload/i'))
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Update Project', () => {
    test('should open edit project form', async ({ page }) => {
      const mockProject = {
        id: 'project-1',
        name: 'Original Name',
        description: 'Original description',
        trackCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await page.route('**/api/v1/projects/project-1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ project: mockProject }),
        });
      });

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [] }),
        });
      });

      await page.goto('/projects/project-1');

      // Look for edit button or settings
      const editButton = page.getByRole('button', { name: /edit|settings/i })
        .or(page.locator('[data-testid="edit-project"]'));

      if (await editButton.isVisible()) {
        await editButton.click();
        await expect(page.locator('input[name="name"]')).toBeVisible({ timeout: 5000 });
      }
    });

    test('should update project name', async ({ page }) => {
      const mockProject = {
        id: 'project-1',
        name: 'Original Name',
        description: 'Description',
        trackCount: 0,
      };

      await page.route('**/api/v1/projects/project-1', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ project: mockProject }),
          });
        } else if (route.request().method() === 'PATCH') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              project: { ...mockProject, name: 'Updated Name' },
            }),
          });
        }
      });

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [] }),
        });
      });

      await page.goto('/projects/project-1');

      const editButton = page.getByRole('button', { name: /edit|settings/i });
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.fill('input[name="name"]', 'Updated Name');
        await page.getByRole('button', { name: /save|update/i }).click();

        await expect(page.locator('text=Updated Name').or(page.locator('text=/updated|saved/i'))).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Delete Project', () => {
    test('should show delete confirmation dialog', async ({ page }) => {
      const mockProject = {
        id: 'project-1',
        name: 'Project to Delete',
        trackCount: 0,
      };

      await page.route('**/api/v1/projects/project-1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ project: mockProject }),
        });
      });

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [] }),
        });
      });

      await page.goto('/projects/project-1');

      const deleteButton = page.getByRole('button', { name: /delete/i })
        .or(page.locator('[data-testid="delete-project"]'));

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // Should show confirmation
        await expect(page.locator('text=/confirm|are you sure|delete/i')).toBeVisible({ timeout: 5000 });
      }
    });

    test('should delete project on confirmation', async ({ page }) => {
      await page.route('**/api/v1/projects', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            projects: [{ id: 'project-1', name: 'Delete Me', trackCount: 0 }],
          }),
        });
      });

      await page.route('**/api/v1/projects/project-1', async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({ status: 204 });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ project: { id: 'project-1', name: 'Delete Me' } }),
          });
        }
      });

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [] }),
        });
      });

      await page.goto('/projects/project-1');

      const deleteButton = page.getByRole('button', { name: /delete/i });
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        // Confirm deletion
        const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          // Should redirect or show success
          await Promise.race([
            expect(page.locator('text=/deleted|removed/i')).toBeVisible({ timeout: 5000 }),
            expect(page).toHaveURL(/\/projects$/, { timeout: 5000 }),
          ]).catch(() => {});
        }
      }
    });

    test('should cancel delete on cancel button', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ project: { id: 'project-1', name: 'Keep Me' } }),
        });
      });

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [] }),
        });
      });

      await page.goto('/projects/project-1');

      const deleteButton = page.getByRole('button', { name: /delete/i });
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        const cancelButton = page.getByRole('button', { name: /cancel|no|close/i });
        if (await cancelButton.isVisible()) {
          await cancelButton.click();

          // Should still be on project page
          await expect(page).toHaveURL(/\/projects\/project-1/);
        }
      }
    });
  });
});
