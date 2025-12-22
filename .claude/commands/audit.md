# Full Codebase Audit

Perform a comprehensive security, code quality, and architecture audit of this codebase.

## Scope

1. **Security Vulnerabilities**
   - Authentication/authorization flaws
   - Injection vulnerabilities (SQL, XSS, command)
   - Hardcoded secrets or credentials
   - Insecure data storage
   - OWASP Top 10 compliance

2. **Code Quality**
   - Unused variables and imports
   - Dead code paths
   - Error handling coverage
   - Test coverage gaps
   - TypeScript strict mode compliance

3. **Architecture**
   - Separation of concerns
   - Dependency management
   - API design patterns
   - State management
   - Performance concerns

4. **Dependencies**
   - Outdated packages
   - Known vulnerabilities
   - Deprecated libraries
   - License compliance

## Output

Update `AUDIT_REPORT.md` with:
- Executive summary with severity counts
- Detailed findings by severity (CRITICAL, HIGH, MEDIUM, LOW)
- Specific file:line references
- Remediation recommendations
- Priority matrix

## Commands to Run

```bash
# Dependency audit
pnpm audit

# Type checking
pnpm run typecheck

# Linting
pnpm run lint

# Check for secrets
grep -r "password\|secret\|api_key\|token" --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules | grep -v ".env"
```

## After Audit

Ask if the user wants critical issues fixed immediately.
