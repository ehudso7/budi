# Security-Focused Scan

Perform a targeted security scan of the codebase focusing on common vulnerabilities.

## Checklist

### Authentication & Authorization
- [ ] JWT secret configuration (no defaults)
- [ ] Token storage (no localStorage for sensitive tokens)
- [ ] Session management
- [ ] Password hashing (bcrypt/argon2)
- [ ] Rate limiting on auth endpoints

### Input Validation
- [ ] All user inputs validated with Zod/similar
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] Path traversal prevention
- [ ] File upload restrictions

### Secrets Management
- [ ] No hardcoded credentials
- [ ] Environment variables validated at startup
- [ ] Secrets not logged

### Transport Security
- [ ] HTTPS enforcement
- [ ] HSTS headers
- [ ] Secure cookies (httpOnly, secure, sameSite)
- [ ] CORS properly configured

### API Security
- [ ] Authentication on all protected routes
- [ ] Authorization checks (ownership validation)
- [ ] Rate limiting
- [ ] Input size limits

## Search Patterns

```bash
# Hardcoded secrets
grep -rn "password.*=.*[\"']" --include="*.ts" | grep -v ".env" | grep -v "test"

# localStorage usage
grep -rn "localStorage" --include="*.ts" --include="*.tsx"

# Default fallbacks
grep -rn "|| \"" --include="*.ts" | grep -i "secret\|key\|password\|token"

# Console.log in production
grep -rn "console.log" --include="*.ts" --include="*.tsx" | grep -v "test" | grep -v "spec"
```

## Output

Report findings with CVSS scores and CWE references where applicable.
