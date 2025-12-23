#!/bin/bash
# Vercel install script - runs during the install phase

echo "=== Starting Vercel install script ==="

# Install dependencies
echo "Installing dependencies..."
pnpm install --no-frozen-lockfile --prod=false
if [ $? -ne 0 ]; then
  echo "ERROR: pnpm install failed"
  exit 1
fi

# Build contracts (shared types)
echo "Building contracts..."
pnpm --filter @budi/contracts run build
if [ $? -ne 0 ]; then
  echo "ERROR: contracts build failed"
  exit 1
fi

# Push database schema (skip if DATABASE_URL not set or fails)
echo "Attempting Prisma db push..."
cd services/api
if pnpm prisma db push --skip-generate; then
  echo "Prisma db push succeeded"
else
  echo "Prisma db push skipped (DATABASE_URL may not be configured)"
fi
cd ../..

# Build API
echo "Building API..."
pnpm --filter @budi/api run build
if [ $? -ne 0 ]; then
  echo "ERROR: API build failed"
  exit 1
fi

echo "=== Vercel install script completed ==="
