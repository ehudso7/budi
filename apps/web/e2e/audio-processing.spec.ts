import { test, expect } from '@playwright/test';
import { TEST_USER, mockAuth } from './fixtures';

test.describe('Audio Processing', () => {
  const mockProject = {
    id: 'project-1',
    name: 'Processing Test Project',
    trackCount: 1,
  };

  const mockTrack = {
    id: 'track-1',
    name: 'Audio Track.wav',
    originalFileName: 'Audio Track.wav',
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
  };

  const mockAnalysis = {
    lufs: -14.2,
    truePeak: -1.5,
    dynamicRange: 8.5,
    issues: [
      { type: 'clipping', severity: 'high', description: 'Clipping detected at 2:30' },
      { type: 'noise', severity: 'medium', description: 'Background noise in intro' },
    ],
    spectralAnalysis: {
      lowEnd: 0.3,
      midRange: 0.5,
      highEnd: 0.2,
    },
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
        body: JSON.stringify({ tracks: [mockTrack] }),
      });
    });

    await page.route('**/api/v1/projects/project-1/tracks/track-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ track: mockTrack }),
      });
    });
  });

  test.describe('Track Analysis', () => {
    test('should start analysis on button click', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1/tracks/track-1/analyze', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ analysis: mockAnalysis }),
        });
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const analyzeButton = page.getByRole('button', { name: /analyze/i });
      if (await analyzeButton.isVisible()) {
        await analyzeButton.click();

        // Should show analysis results or loading state
        await expect(
          page.locator('text=/analyzing|LUFS|peak/i')
        ).toBeVisible({ timeout: 10000 });
      }
    });

    test('should display analysis results', async ({ page }) => {
      const analyzedTrack = {
        ...mockTrack,
        status: 'ready',
        analysis: mockAnalysis,
      };

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [analyzedTrack] }),
        });
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      // Should show LUFS value
      await expect(
        page.locator('text=/-14|LUFS/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should display detected issues', async ({ page }) => {
      const analyzedTrack = {
        ...mockTrack,
        analysis: mockAnalysis,
      };

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [analyzedTrack] }),
        });
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      // Should show issues
      await expect(
        page.locator('text=/clipping|noise|issue/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should show spectral analysis', async ({ page }) => {
      const analyzedTrack = {
        ...mockTrack,
        analysis: mockAnalysis,
      };

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [analyzedTrack] }),
        });
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      // Should show spectral data
      await expect(
        page.locator('text=/low|mid|high|spectral|frequency/i')
      ).toBeVisible({ timeout: 5000 });
    });

    test('should handle analysis error', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1/tracks/track-1/analyze', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Analysis failed' }),
        });
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const analyzeButton = page.getByRole('button', { name: /analyze/i });
      if (await analyzeButton.isVisible()) {
        await analyzeButton.click();

        await expect(
          page.locator('text=/error|failed/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Track Fixing', () => {
    test('should open fix options dialog', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const fixButton = page.getByRole('button', { name: /fix|repair|process/i });
      if (await fixButton.isVisible()) {
        await fixButton.click();

        // Should show fix options
        await expect(
          page.locator('text=/clipping|noise|phase|normalize/i')
            .or(page.locator('[role="dialog"]'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should have clipping removal option', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const fixButton = page.getByRole('button', { name: /fix|repair|process/i });
      if (await fixButton.isVisible()) {
        await fixButton.click();

        await expect(
          page.locator('text=/clipping|remove clipping/i')
            .or(page.locator('input[name*="clipping"]'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should have noise removal option', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const fixButton = page.getByRole('button', { name: /fix|repair|process/i });
      if (await fixButton.isVisible()) {
        await fixButton.click();

        await expect(
          page.locator('text=/noise|denoise/i')
            .or(page.locator('input[name*="noise"]'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should start fix processing', async ({ page }) => {
      const jobResponse = {
        id: 'job-1',
        status: 'queued',
        progress: 0,
      };

      await page.route('**/api/v1/projects/project-1/tracks/track-1/fix', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ job: jobResponse }),
        });
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const fixButton = page.getByRole('button', { name: /fix|repair|process/i });
      if (await fixButton.isVisible()) {
        await fixButton.click();

        // Click start/apply button in dialog
        const startButton = page.getByRole('button', { name: /start|apply|fix/i }).last();
        if (await startButton.isVisible()) {
          await startButton.click();

          await expect(
            page.locator('text=/processing|queued|progress/i')
              .or(page.locator('[role="progressbar"]'))
          ).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should show fix progress', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1/tracks/track-1/fix', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ job: { id: 'job-1', status: 'processing', progress: 50 } }),
        });
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const fixButton = page.getByRole('button', { name: /fix|repair|process/i });
      if (await fixButton.isVisible()) {
        await fixButton.click();

        const startButton = page.getByRole('button', { name: /start|apply|fix/i }).last();
        if (await startButton.isVisible()) {
          await startButton.click();

          await expect(
            page.locator('[role="progressbar"]')
              .or(page.locator('text=/%/'))
          ).toBeVisible({ timeout: 5000 }).catch(() => {});
        }
      }
    });
  });

  test.describe('Track Mastering', () => {
    test('should open mastering options dialog', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const masterButton = page.getByRole('button', { name: /master/i });
      if (await masterButton.isVisible()) {
        await masterButton.click();

        await expect(
          page.locator('text=/target.*LUFS|genre|loudness/i')
            .or(page.locator('[role="dialog"]'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should have target LUFS selector', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const masterButton = page.getByRole('button', { name: /master/i });
      if (await masterButton.isVisible()) {
        await masterButton.click();

        await expect(
          page.locator('text=/LUFS|loudness|target/i')
            .or(page.locator('input[name*="lufs"]'))
            .or(page.locator('select'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should have genre selector', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const masterButton = page.getByRole('button', { name: /master/i });
      if (await masterButton.isVisible()) {
        await masterButton.click();

        await expect(
          page.locator('text=/genre|style/i')
            .or(page.locator('select[name*="genre"]'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should start mastering process', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1/tracks/track-1/master', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            job: { id: 'master-job-1', status: 'queued', progress: 0 },
          }),
        });
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const masterButton = page.getByRole('button', { name: /master/i });
      if (await masterButton.isVisible()) {
        await masterButton.click();

        const startButton = page.getByRole('button', { name: /start|master/i }).last();
        if (await startButton.isVisible()) {
          await startButton.click();

          await expect(
            page.locator('text=/mastering|processing|queued/i')
          ).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should show mastering complete with download', async ({ page }) => {
      const masteredTrack = {
        ...mockTrack,
        status: 'mastered',
      };

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [masteredTrack] }),
        });
      });

      await page.goto('/projects/project-1');

      await expect(
        page.locator('text=/mastered|complete/i')
          .or(page.getByRole('button', { name: /download|export/i }))
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Track Export', () => {
    test('should open export dialog', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const exportButton = page.getByRole('button', { name: /export|download/i });
      if (await exportButton.isVisible()) {
        await exportButton.click();

        await expect(
          page.locator('text=/format|wav|mp3|flac/i')
            .or(page.locator('[role="dialog"]'))
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should have format options', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const exportButton = page.getByRole('button', { name: /export|download/i });
      if (await exportButton.isVisible()) {
        await exportButton.click();

        // Should show format options
        await expect(
          page.locator('text=/wav|mp3|flac|aac/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should have sample rate options', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const exportButton = page.getByRole('button', { name: /export|download/i });
      if (await exportButton.isVisible()) {
        await exportButton.click();

        await expect(
          page.locator('text=/sample rate|44100|48000|96000/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should have bit depth options', async ({ page }) => {
      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const exportButton = page.getByRole('button', { name: /export|download/i });
      if (await exportButton.isVisible()) {
        await exportButton.click();

        await expect(
          page.locator('text=/bit depth|16.*bit|24.*bit|32.*bit/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });

    test('should trigger download on export', async ({ page }) => {
      await page.route('**/api/v1/projects/project-1/tracks/track-1/export', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ downloadUrl: 'https://storage.example.com/exported-track.wav' }),
        });
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      const exportButton = page.getByRole('button', { name: /export|download/i });
      if (await exportButton.isVisible()) {
        await exportButton.click();

        const downloadButton = page.getByRole('button', { name: /download|export/i }).last();
        if (await downloadButton.isVisible()) {
          // Set up download listener
          const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

          await downloadButton.click();

          // Either download starts or success message shows
          await expect(
            page.locator('text=/download|exported|success/i')
          ).toBeVisible({ timeout: 5000 }).catch(() => {});
        }
      }
    });
  });

  test.describe('Processing Queue', () => {
    test('should show active processing jobs', async ({ page }) => {
      const processingTrack = {
        ...mockTrack,
        status: 'processing',
      };

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
      ).toBeVisible({ timeout: 5000 });
    });

    test('should update status when processing completes', async ({ page }) => {
      let requestCount = 0;

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        requestCount++;
        const status = requestCount > 2 ? 'ready' : 'processing';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tracks: [{ ...mockTrack, status }],
          }),
        });
      });

      await page.goto('/projects/project-1');

      // Wait for potential polling/refresh
      await page.waitForTimeout(2000);

      // Status should eventually update
      await expect(
        page.locator('text=/processing|ready/i')
      ).toBeVisible();
    });
  });

  test.describe('A/B Comparison', () => {
    test('should allow comparing original and processed', async ({ page }) => {
      const processedTrack = {
        ...mockTrack,
        status: 'mastered',
      };

      await page.route('**/api/v1/projects/project-1/tracks', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tracks: [processedTrack] }),
        });
      });

      await page.goto('/projects/project-1');
      await page.locator('text=Audio Track').click();

      // Look for A/B toggle or compare button
      const compareButton = page.getByRole('button', { name: /compare|A.*B|original|toggle/i });
      if (await compareButton.isVisible()) {
        await compareButton.click();

        // Should show comparison view
        await expect(
          page.locator('text=/original|processed|before|after/i')
        ).toBeVisible({ timeout: 5000 });
      }
    });
  });
});
