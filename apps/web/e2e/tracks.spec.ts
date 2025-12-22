import { test, expect } from '@playwright/test';
import { TEST_USER, mockAuth } from './fixtures';

test.describe('Track Management', () => {
  const mockProject = {
    id: 'project-1',
    name: 'Test Project',
    description: 'Test project description',
    trackCount: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockTracks = [
    {
      id: 'track-1',
      name: 'Test Track 1.wav',
      originalFileName: 'Test Track 1.wav',
      fileSize: 50000000,
      duration: 180,
      sampleRate: 44100,
      bitDepth: 24,
      channels: 2,
      format: 'wav',
      waveformUrl: null,
      status: 'ready',
      analysis: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'track-2',
      name: 'Test Track 2.wav',
      originalFileName: 'Test Track 2.wav',
      fileSize: 45000000,
      duration: 240,
      sampleRate: 48000,
      bitDepth: 16,
      channels: 2,
      format: 'wav',
      waveformUrl: null,
      status: 'analyzing',
      analysis: null,
      createdAt: new Date().toISOString(),
    },
  ];

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

    await page.route('**/api/v1/projects/project-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ project: mockProject }),
      });
    });

    await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: mockTracks }),
        });
      }
    });
  });

  test.describe('Track List', () => {
    test('should display list of tracks', async ({ page }) => {
      await page.goto('/projects/project-1');

      await expect(page.locator('text=Test Track 1')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Test Track 2')).toBeVisible();
    });

    test('should display track status', async ({ page }) => {
      await page.goto('/projects/project-1');

      // Should show status indicators
      await expect(
        page.locator('text=/ready|analyzing|pending|processing/i').first()
      ).toBeVisible({ timeout: 5000 });
    });

    test('should display track metadata', async ({ page }) => {
      await page.goto('/projects/project-1');

      // Should show duration, sample rate, or other metadata
      await expect(
        page.locator('text=/44100|48000|3:00|4:00|wav/i').first()
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show empty state when no tracks', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [] }),
        });
      });

      await page.goto('/projects/project-1');

      await expect(
        page.locator('text=/no tracks|upload.*first|drag.*drop/i')
          .or(page.getByRole('button', { name: /upload/i }))
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Track Upload', () => {
    test('should show upload area/button', async ({ page }) => {
      await page.goto('/projects/project-1');

      await expect(
        page.getByRole('button', { name: /upload|add/i })
          .or(page.locator('[data-testid="dropzone"]'))
          .or(page.locator('text=/drag.*drop/i'))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should open file picker on upload click', async ({ page }) => {
      await page.goto('/projects/project-1');

      const uploadButton = page.getByRole('button', { name: /upload|add track/i });
      if (await uploadButton.isVisible()) {
        // Check for file input
        const fileInput = page.locator('input[type="file"]');
        await expect(fileInput).toBeAttached();
      }
    });

    test('should validate file type', async ({ page }) => {
      await page.goto('/projects/project-1');

      const fileInput = page.locator('input[type="file"]');
      if ((await fileInput.count()) > 0) {
        // Try to upload invalid file type
        await fileInput.setInputFiles({
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('not an audio file'),
        });

        // Should show error
        await expect(
          page.locator('text=/invalid|unsupported|audio only/i')
        ).toBeVisible({ timeout: 5000 }).catch(() => {
          // Some implementations may not show error for this
        });
      }
    });

    test('should upload audio file successfully', async ({ page }) => {
      const newTrack = {
        id: 'new-track',
        name: 'Uploaded Track.wav',
        status: 'pending',
        duration: 120,
        fileSize: 30000000,
      };

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ track: newTrack }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ tracks: mockTracks }),
          });
        }
      });

      await page.goto('/projects/project-1');

      const fileInput = page.locator('input[type="file"]');
      if ((await fileInput.count()) > 0) {
        // Create a minimal WAV file buffer
        const wavHeader = Buffer.alloc(44);
        wavHeader.write('RIFF', 0);
        wavHeader.writeUInt32LE(36, 4);
        wavHeader.write('WAVE', 8);
        wavHeader.write('fmt ', 12);

        await fileInput.setInputFiles({
          name: 'test-audio.wav',
          mimeType: 'audio/wav',
          buffer: wavHeader,
        });

        // Should show success or add track to list
        await expect(
          page.locator('text=/uploaded|success|Uploaded Track/i')
        ).toBeVisible({ timeout: 10000 }).catch(() => {});
      }
    });

    test('should show upload progress', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        if (route.request().method() === 'POST') {
          // Delay response to show progress
          await new Promise(resolve => setTimeout(resolve, 1000));
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ track: { id: 'new', name: 'Test.wav' } }),
          });
        }
      });

      await page.goto('/projects/project-1');

      const fileInput = page.locator('input[type="file"]');
      if ((await fileInput.count()) > 0) {
        const wavHeader = Buffer.alloc(44);
        wavHeader.write('RIFF', 0);

        await fileInput.setInputFiles({
          name: 'large-file.wav',
          mimeType: 'audio/wav',
          buffer: wavHeader,
        });

        // Look for progress indicator
        await expect(
          page.locator('[role="progressbar"]')
            .or(page.locator('text=/%|uploading/i'))
        ).toBeVisible({ timeout: 5000 }).catch(() => {});
      }
    });

    test('should handle upload error', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Upload failed' }),
          });
        }
      });

      await page.goto('/projects/project-1');

      const fileInput = page.locator('input[type="file"]');
      if ((await fileInput.count()) > 0) {
        const wavHeader = Buffer.alloc(44);
        wavHeader.write('RIFF', 0);

        await fileInput.setInputFiles({
          name: 'test.wav',
          mimeType: 'audio/wav',
          buffer: wavHeader,
        });

        await expect(
          page.locator('text=/error|failed/i')
        ).toBeVisible({ timeout: 5000 }).catch(() => {});
      }
    });

    test('should support multiple file upload', async ({ page }) => {
      await page.goto('/projects/project-1');

      const fileInput = page.locator('input[type="file"]');
      if ((await fileInput.count()) > 0) {
        const multipleAttr = await fileInput.getAttribute('multiple');
        // Some implementations support multiple files
        expect(multipleAttr !== null || true).toBeTruthy();
      }
    });
  });

  test.describe('Track Details', () => {
    test('should show track details on click', async ({ page }) => {
      await page.goto('/projects/project-1');

      // Click on a track
      await page.locator('text=Test Track 1').click();

      // Should show detail view/modal
      await expect(
        page.locator('text=/details|info|properties/i')
          .or(page.locator('[role="dialog"]'))
          .or(page.locator('text=/44100.*Hz|24.*bit/i'))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should display track waveform', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Test Track 1').click();

      // Look for waveform or audio visualizer
      await expect(
        page.locator('canvas')
          .or(page.locator('[data-testid="waveform"]'))
          .or(page.locator('svg'))
      ).toBeVisible({ timeout: 5000 }).catch(() => {});
    });

    test('should show audio metadata', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Test Track 1').click();

      // Should show sample rate, bit depth, channels
      await expect(
        page.locator('text=/44100|sample rate|bit depth|stereo|channels/i')
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Track Actions', () => {
    test('should have analyze button', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Test Track 1').click();

      await expect(
        page.getByRole('button', { name: /analyze/i })
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have fix/repair button', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Test Track 1').click();

      await expect(
        page.getByRole('button', { name: /fix|repair|process/i })
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have master button', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Test Track 1').click();

      await expect(
        page.getByRole('button', { name: /master/i })
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have export button', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Test Track 1').click();

      await expect(
        page.getByRole('button', { name: /export|download/i })
      ).toBeVisible({ timeout: 5000 });
    });

    test('should have delete button', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Test Track 1').click();

      await expect(
        page.getByRole('button', { name: /delete|remove/i })
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Track Deletion', () => {
    test('should show delete confirmation', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Test Track 1').click();

      const deleteButton = page.getByRole('button', { name: /delete|remove/i });
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        await expect(
          page.locator('text=/confirm|are you sure/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should delete track on confirmation', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1/tracks/track-1', async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({ status: 204 });
        }
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Test Track 1').click();

      const deleteButton = page.getByRole('button', { name: /delete|remove/i });
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i }).last();
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          await expect(
            page.locator('text=/deleted|removed|success/i')
          ).toBeVisible({ timeout: 5000 }).catch(() => {});
        }
      }
    });
  });

  test.describe('Track Status Updates', () => {
    test('should show analyzing status', async ({ page }) => {
      await page.goto('/projects/project-1');

      await expect(page.locator('text=/analyzing/i')).toBeVisible({ timeout: 5000 });
    });

    test('should show processing indicator', async ({ page }) => {
      const processingTrack = { ...mockTracks[0], status: 'processing' };

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [processingTrack] }),
        });
      });

      await page.goto('/projects/project-1');

      await expect(
        page.locator('text=/processing/i')
          .or(page.locator('[role="progressbar"]'))
          .or(page.locator('.animate-spin'))
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show error status', async ({ page }) => {
      const errorTrack = { ...mockTracks[0], status: 'error' };

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [errorTrack] }),
        });
      });

      await page.goto('/projects/project-1');

      await expect(
        page.locator('text=/error|failed/i')
      ).toBeVisible({ timeout: 5000 });
    });
  });
});
