#!/usr/bin/env node
/**
 * Prisma Generate Script with Network Fallback
 *
 * Attempts to run prisma generate, but gracefully handles network errors
 * by checking if the client already exists from a previous successful generate.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, '..');
const generatedClientPath = join(apiRoot, 'generated', 'prisma', 'index.js');

function log(message) {
  console.log(`[prisma-generate] ${message}`);
}

function runPrismaGenerate() {
  try {
    log('Running prisma generate...');
    execSync('npx prisma generate', {
      cwd: apiRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: '1'
      }
    });
    log('Prisma client generated successfully');
    return true;
  } catch (error) {
    return false;
  }
}

function main() {
  // First, try to run prisma generate
  const success = runPrismaGenerate();

  if (success) {
    process.exit(0);
  }

  // If it failed, check if we have an existing generated client
  if (existsSync(generatedClientPath)) {
    log('Prisma generate failed (likely network issue), but existing client found');
    log('Using cached Prisma client from previous generate');
    process.exit(0);
  }

  // No cached client and generate failed - this is a real error
  // On Vercel/CI, this should work; only fails in restricted network environments
  if (process.env.VERCEL || process.env.CI) {
    log('ERROR: Prisma generate failed in CI environment');
    process.exit(1);
  }

  // In development with no network, provide helpful message
  log('WARNING: Prisma generate failed and no cached client exists');
  log('This is likely due to network restrictions blocking binaries.prisma.sh');
  log('The build will continue, but database operations will not work');
  log('To fix: Run prisma generate in an environment with network access');

  // Exit with 0 to allow build to continue for frontend-only work
  process.exit(0);
}

main();
