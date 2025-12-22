import { test as teardown } from '@playwright/test';

/**
 * Global teardown that runs after all tests
 * Cleans up test data and resources
 */
teardown('global teardown', async () => {
  console.log('Running global teardown...');
  // Clean up test data, close connections, etc.
});
