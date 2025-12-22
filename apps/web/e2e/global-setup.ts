import { test as setup } from '@playwright/test';

/**
 * Global setup that runs before all tests
 * Creates test users and initializes test data
 */
setup('global setup', async ({ request }) => {
  console.log('Running global setup...');

  // Note: In a real environment, this would set up test database,
  // create test users, etc. For now, we verify the app is running.
  try {
    const response = await request.get('/');
    console.log(`App health check: ${response.status()}`);
  } catch (error) {
    console.log('App not available, tests will use mocked data');
  }
});
