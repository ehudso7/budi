#!/bin/bash
# Dependency Vulnerability Check
# Run: ./scripts/audit/dependency-check.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "========================================"
echo "  Budi Dependency Check"
echo "  $(date)"
echo "========================================"
echo ""

cd "$PROJECT_ROOT"

echo "1. Running pnpm audit..."
echo "-----------------------------------"
pnpm audit 2>&1 || true
echo ""

echo "2. Checking for outdated packages..."
echo "-----------------------------------"
pnpm outdated 2>&1 || true
echo ""

echo "3. Checking Rust dependencies (if cargo available)..."
echo "-----------------------------------"
if command -v cargo &> /dev/null; then
    for worker in services/worker-codec services/worker-dsp; do
        if [ -f "$worker/Cargo.toml" ]; then
            echo "Checking $worker..."
            cd "$PROJECT_ROOT/$worker"
            cargo audit 2>/dev/null || echo "Run 'cargo install cargo-audit' for Rust auditing"
            cd "$PROJECT_ROOT"
        fi
    done
else
    echo "Cargo not available, skipping Rust audit"
fi
echo ""

echo "4. License check..."
echo "-----------------------------------"
if command -v license-checker &> /dev/null; then
    license-checker --summary
else
    echo "Install license-checker for license auditing: npm install -g license-checker"
fi
echo ""

echo "========================================"
echo "  DEPENDENCY CHECK COMPLETE"
echo "========================================"
