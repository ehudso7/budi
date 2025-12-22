# Pre-Commit Quality Gate

Run before committing changes to ensure code quality and security standards.

## Quick Checks

1. **Type Safety**
   ```bash
   pnpm run typecheck
   ```

2. **Linting**
   ```bash
   pnpm run lint
   ```

3. **Security Scan**
   - No hardcoded secrets
   - No console.log in production code
   - No TODO/FIXME left unaddressed

4. **Test Execution**
   ```bash
   pnpm run test
   ```

## Blocking Issues

Do NOT allow commit if:
- TypeScript errors exist
- ESLint errors (warnings are acceptable)
- Any hardcoded secrets detected
- Tests failing

## Quick Pattern Checks

```bash
# Check for debug statements
grep -rn "console.log\|debugger" --include="*.ts" --include="*.tsx" apps/ services/ | grep -v ".test." | grep -v ".spec."

# Check for TODO/FIXME
grep -rn "TODO\|FIXME\|XXX\|HACK" --include="*.ts" --include="*.tsx" apps/ services/

# Check for hardcoded URLs
grep -rn "http://localhost\|127.0.0.1" --include="*.ts" --include="*.tsx" apps/ services/ | grep -v ".env" | grep -v "config"
```

## Output

- PASS: All checks passed, safe to commit
- FAIL: List specific issues that must be fixed
