/**
 * Export Worker Entry Point
 *
 * Run with: pnpm --filter @budi/api worker
 */

import { runForever } from './exportWorker.js';

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[Worker] Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM, shutting down...');
  process.exit(0);
});

// Start the worker
console.log('[Worker] Export Worker starting...');
runForever(1000).catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
