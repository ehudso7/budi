#!/bin/bash
# Budi Workers Deployment Script for Railway
# This script deploys the DSP and Codec workers to Railway

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Budi Workers Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
fi

# Check if logged in to Railway
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}Please log in to Railway:${NC}"
    railway login
fi

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo -e "${GREEN}Step 1: Setting up DSP Worker${NC}"
echo "--------------------------------"

cd "$PROJECT_ROOT/services/worker-dsp"

# Check if Railway project exists for DSP worker
if [ ! -f ".railway/config.json" ]; then
    echo -e "${YELLOW}Creating new Railway project for DSP Worker...${NC}"
    railway init --name budi-worker-dsp
fi

echo -e "${GREEN}Deploying DSP Worker...${NC}"
railway up --detach

echo ""
echo -e "${GREEN}Step 2: Setting up Codec Worker${NC}"
echo "---------------------------------"

cd "$PROJECT_ROOT/services/worker-codec"

# Check if Railway project exists for Codec worker
if [ ! -f ".railway/config.json" ]; then
    echo -e "${YELLOW}Creating new Railway project for Codec Worker...${NC}"
    railway init --name budi-worker-codec
fi

echo -e "${GREEN}Deploying Codec Worker...${NC}"
railway up --detach

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: Configure environment variables in Railway Dashboard:${NC}"
echo ""
echo "For BOTH workers, set these variables:"
echo "  - REDIS_URL          (same as Vercel)"
echo "  - MINIO_ENDPOINT     (same as Vercel)"
echo "  - MINIO_ACCESS_KEY   (same as Vercel)"
echo "  - MINIO_SECRET_KEY   (same as Vercel)"
echo "  - MINIO_BUCKET_AUDIO (same as Vercel)"
echo "  - API_URL            (your Vercel app URL + /api)"
echo "  - WEBHOOK_SECRET     (same as Vercel)"
echo "  - RUST_LOG           (info or debug)"
echo ""
echo "For DSP Worker only:"
echo "  - DSP_QUEUE          (default: dsp-jobs)"
echo ""
echo "For Codec Worker only:"
echo "  - CODEC_QUEUE        (default: codec-jobs)"
echo ""
echo -e "${GREEN}View your deployments:${NC}"
echo "  railway open"
