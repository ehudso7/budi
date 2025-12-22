#!/bin/bash
# Full Codebase Audit Script
# Run: ./scripts/audit/full-audit.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "========================================"
echo "  Budi Full Codebase Audit"
echo "  $(date)"
echo "========================================"
echo ""

cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0

echo "1. Running TypeScript Type Check..."
echo "-----------------------------------"
if pnpm run typecheck 2>&1; then
    echo -e "${GREEN}Type check passed${NC}"
else
    echo -e "${RED}Type check failed${NC}"
    ((HIGH_COUNT++))
fi
echo ""

echo "2. Running ESLint..."
echo "-----------------------------------"
if pnpm run lint 2>&1; then
    echo -e "${GREEN}Lint passed${NC}"
else
    echo -e "${YELLOW}Lint warnings/errors found${NC}"
    ((MEDIUM_COUNT++))
fi
echo ""

echo "3. Checking for Hardcoded Secrets..."
echo "-----------------------------------"
SECRETS=$(grep -rn "password\|secret\|api_key" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | grep -v ".env" | grep -v "test" | grep -v "\.d\.ts" | grep "=" | head -20 || true)
if [ -n "$SECRETS" ]; then
    echo -e "${RED}Potential hardcoded secrets found:${NC}"
    echo "$SECRETS"
    ((CRITICAL_COUNT++))
else
    echo -e "${GREEN}No obvious hardcoded secrets${NC}"
fi
echo ""

echo "4. Checking localStorage Usage..."
echo "-----------------------------------"
LOCALSTORAGE=$(grep -rn "localStorage" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | grep -v ".d.ts" || true)
if [ -n "$LOCALSTORAGE" ]; then
    echo -e "${YELLOW}localStorage usage found (review for sensitive data):${NC}"
    echo "$LOCALSTORAGE"
    ((HIGH_COUNT++))
else
    echo -e "${GREEN}No localStorage usage${NC}"
fi
echo ""

echo "5. Checking for Console.log..."
echo "-----------------------------------"
CONSOLE=$(grep -rn "console.log" --include="*.ts" --include="*.tsx" apps/ services/ 2>/dev/null | grep -v ".test." | grep -v ".spec." | head -10 || true)
if [ -n "$CONSOLE" ]; then
    echo -e "${YELLOW}console.log found in production code:${NC}"
    echo "$CONSOLE"
    ((MEDIUM_COUNT++))
else
    echo -e "${GREEN}No console.log in production code${NC}"
fi
echo ""

echo "6. Running Dependency Audit..."
echo "-----------------------------------"
pnpm audit 2>&1 || ((HIGH_COUNT++))
echo ""

echo "7. Checking for Deprecated Dependencies..."
echo "-----------------------------------"
DEPRECATED=$(pnpm list --depth=0 2>&1 | grep -i "deprecated" || true)
if [ -n "$DEPRECATED" ]; then
    echo -e "${YELLOW}Deprecated dependencies:${NC}"
    echo "$DEPRECATED"
    ((LOW_COUNT++))
else
    echo -e "${GREEN}No deprecated dependencies at top level${NC}"
fi
echo ""

echo "========================================"
echo "  AUDIT SUMMARY"
echo "========================================"
echo -e "CRITICAL: ${RED}$CRITICAL_COUNT${NC}"
echo -e "HIGH:     ${YELLOW}$HIGH_COUNT${NC}"
echo -e "MEDIUM:   ${YELLOW}$MEDIUM_COUNT${NC}"
echo -e "LOW:      ${GREEN}$LOW_COUNT${NC}"
echo ""

if [ $CRITICAL_COUNT -gt 0 ]; then
    echo -e "${RED}AUDIT FAILED: Critical issues found${NC}"
    exit 1
elif [ $HIGH_COUNT -gt 0 ]; then
    echo -e "${YELLOW}AUDIT WARNING: High severity issues found${NC}"
    exit 0
else
    echo -e "${GREEN}AUDIT PASSED${NC}"
    exit 0
fi
