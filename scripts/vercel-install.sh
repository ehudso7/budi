#!/bin/bash
# Vercel install script - runs during the install phase

echo "=== Starting Vercel install script ==="
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "PNPM version: $(pnpm --version || echo 'pnpm not found')"

# Install dependencies
echo "Installing dependencies..."
pnpm install --no-frozen-lockfile --prod=false || {
  echo "ERROR: pnpm install failed"
  exit 1
}

# Build contracts (shared types)
echo "Building contracts..."
pnpm --filter @budi/contracts run build || {
  echo "ERROR: contracts build failed"
  exit 1
}

# Push database schema (skip if DATABASE_URL not set or fails)
echo "Attempting Prisma db push..."
cd services/api || {
  echo "ERROR: Could not change to services/api directory"
  exit 1
}
pnpm prisma db push --skip-generate || echo "Prisma db push skipped or failed (non-critical)"
cd ../.. || {
  echo "ERROR: Could not return to root directory"
  exit 1
}

# Build API
echo "Building API..."
pnpm --filter @budi/api run build || {
  echo "ERROR: API build failed"
  exit 1
}

echo "=== Vercel install script completed ==="
