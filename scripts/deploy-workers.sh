#!/bin/bash
# Budi Workers Deployment Script for Railway
# This script deploys the DSP and Codec workers to Railway

set -e

# Colors for output
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

# Deploy a worker to Railway
# Usage: deploy_worker <worker_dir> <project_name> <step_number>
deploy_worker() {
    local worker_dir="$1"
    local project_name="$2"
    local step_num="$3"

    echo ""
    echo -e "${GREEN}Step ${step_num}: Setting up ${project_name}${NC}"
    echo "--------------------------------"

    cd "$PROJECT_ROOT/services/${worker_dir}"

    # Check if Railway project exists for this worker
    if [ ! -f ".railway/config.json" ]; then
        echo -e "${YELLOW}Creating new Railway project for ${project_name}...${NC}"
        # Note: --name flag creates the project. For fully non-interactive usage,
        # set RAILWAY_TOKEN env var or run 'railway login' first.
        railway init --name "budi-${worker_dir}"
    fi

    echo -e "${GREEN}Deploying ${project_name}...${NC}"
    railway up --detach

    cd "$PROJECT_ROOT"
}

# Deploy workers
deploy_worker "worker-dsp" "DSP Worker" "1"
deploy_worker "worker-codec" "Codec Worker" "2"

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
