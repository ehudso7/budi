#!/bin/bash
# Security-Focused Scan Script
# Run: ./scripts/audit/security-scan.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "========================================"
echo "  Budi Security Scan"
echo "  $(date)"
echo "========================================"
echo ""

cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ISSUES=0

echo "1. Scanning for Hardcoded Secrets..."
echo "-----------------------------------"

# Check for default secrets in code
DEFAULTS=$(grep -rn '|| "' --include="*.ts" . 2>/dev/null | grep -v node_modules | grep -iE "secret|key|password|token" | grep -v ".d.ts" | grep -v "test" || true)
if [ -n "$DEFAULTS" ]; then
    echo -e "${RED}[CRITICAL] Default secret fallbacks found:${NC}"
    echo "$DEFAULTS"
    ((ISSUES++))
fi

# Check for hardcoded passwords
PASSWORDS=$(grep -rn "password.*=.*['\"]" --include="*.ts" . 2>/dev/null | grep -v node_modules | grep -v ".env" | grep -v "test" | grep -v "type\|interface" || true)
if [ -n "$PASSWORDS" ]; then
    echo -e "${RED}[CRITICAL] Hardcoded passwords:${NC}"
    echo "$PASSWORDS"
    ((ISSUES++))
fi

echo ""
echo "2. Scanning for Insecure Storage..."
echo "-----------------------------------"

# localStorage for tokens
STORAGE=$(grep -rn "localStorage.*token\|localStorage.*auth\|localStorage.*session" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules || true)
if [ -n "$STORAGE" ]; then
    echo -e "${RED}[CRITICAL] Tokens stored in localStorage:${NC}"
    echo "$STORAGE"
    ((ISSUES++))
fi

echo ""
echo "3. Scanning for SQL Injection Risks..."
echo "-----------------------------------"

# Raw SQL with string concatenation
SQLI=$(grep -rn "sql\`.*\${" --include="*.ts" . 2>/dev/null | grep -v node_modules | grep -v "test" || true)
if [ -n "$SQLI" ]; then
    echo -e "${YELLOW}[HIGH] Potential SQL injection (review manually):${NC}"
    echo "$SQLI"
    ((ISSUES++))
fi

echo ""
echo "4. Scanning for XSS Risks..."
echo "-----------------------------------"

# dangerouslySetInnerHTML usage
XSS=$(grep -rn "dangerouslySetInnerHTML" --include="*.tsx" . 2>/dev/null | grep -v node_modules || true)
if [ -n "$XSS" ]; then
    echo -e "${YELLOW}[HIGH] dangerouslySetInnerHTML usage:${NC}"
    echo "$XSS"
    ((ISSUES++))
fi

echo ""
echo "5. Scanning for Missing Auth Checks..."
echo "-----------------------------------"

# Routes without auth middleware
NOAUTH=$(grep -rn "app\.\(get\|post\|put\|delete\)" --include="*.ts" services/ 2>/dev/null | grep -v "authenticate\|auth\|public\|health" | head -10 || true)
if [ -n "$NOAUTH" ]; then
    echo -e "${YELLOW}[MEDIUM] Routes to review for auth:${NC}"
    echo "$NOAUTH"
    ((ISSUES++))
fi

echo ""
echo "6. Scanning for Debug Code..."
echo "-----------------------------------"

# console.log and debugger statements
DEBUG=$(grep -rn "console.log\|debugger" --include="*.ts" --include="*.tsx" apps/ services/ 2>/dev/null | grep -v ".test." | grep -v ".spec." | head -20 || true)
if [ -n "$DEBUG" ]; then
    echo -e "${YELLOW}[MEDIUM] Debug code in production:${NC}"
    echo "$DEBUG"
    ((ISSUES++))
fi

echo ""
echo "7. Scanning for CORS Issues..."
echo "-----------------------------------"

# CORS with wildcard
CORS=$(grep -rn "origin.*:\s*true\|origin.*:\s*\*" --include="*.ts" . 2>/dev/null | grep -v node_modules | grep -v test || true)
if [ -n "$CORS" ]; then
    echo -e "${YELLOW}[MEDIUM] Permissive CORS configuration:${NC}"
    echo "$CORS"
    ((ISSUES++))
fi

echo ""
echo "========================================"
echo "  SECURITY SCAN COMPLETE"
echo "========================================"
echo ""
if [ $ISSUES -gt 0 ]; then
    echo -e "${RED}Found $ISSUES security concerns${NC}"
    echo "Review AUDIT_REPORT.md for details"
    exit 1
else
    echo -e "${GREEN}No critical security issues detected${NC}"
    exit 0
fi
