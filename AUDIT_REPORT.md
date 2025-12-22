# Budi Security & Code Quality Audit Report

**Audit Date:** 2025-12-22
**Auditor:** Claude Code Security Auditor
**Codebase Version:** d2164fe

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 2 | Requires immediate fix |
| HIGH | 3 | Fix before production |
| MEDIUM | 5 | Fix in next sprint |
| LOW | 8 | Technical debt |

**Overall Security Posture:** MODERATE RISK
**Production Readiness:** NOT READY - Critical issues must be resolved

---

## CRITICAL Vulnerabilities

### CRIT-001: Auth Tokens Stored in localStorage (XSS Vulnerable)

**File:** `apps/web/src/lib/api.ts:21,31`
**CVSS Score:** 8.1 (High)
**CWE:** CWE-922 (Insecure Storage of Sensitive Information)

**Description:**
Authentication tokens are stored in `localStorage`, which is accessible to any JavaScript running on the page. If an XSS vulnerability exists anywhere in the application, attackers can steal user tokens.

```typescript
// Line 21 - VULNERABLE
localStorage.setItem("auth_token", token);

// Line 31 - VULNERABLE
this.token = localStorage.getItem("auth_token");
```

**Impact:**
- Complete account takeover via XSS
- Session hijacking
- Persistent access even after password change

**Remediation:**
Use `httpOnly` cookies for token storage. Implement:
1. Server-side session management with secure cookies
2. CSRF protection with SameSite=Strict
3. Token rotation on sensitive actions

---

### CRIT-002: Default JWT Secret in Source Code

**File:** `services/api/src/lib/auth.ts:26`
**CVSS Score:** 9.8 (Critical)
**CWE:** CWE-798 (Use of Hard-coded Credentials)

**Description:**
A default JWT secret is embedded in source code and used if environment variable is not set.

```typescript
// Line 26 - CRITICAL
secret: process.env.JWT_SECRET || "budi-dev-secret",
```

**Impact:**
- Token forgery if default is used in production
- Complete authentication bypass
- All user accounts compromised

**Remediation:**
1. Remove default fallback entirely
2. Fail fast if JWT_SECRET is not set in production
3. Add startup validation for required env vars

---

## HIGH Severity Issues

### HIGH-001: Missing HTTPS Enforcement

**File:** `apps/web/next.config.js`
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)

**Description:**
No HSTS headers configured. API URL defaults to HTTP.

**Remediation:**
Add security headers in Next.js config and Vercel settings.

---

### HIGH-002: Webhook Secret Fallback

**File:** `services/api/src/routes/webhooks.ts:16`
**CWE:** CWE-798 (Use of Hard-coded Credentials)

```typescript
const webhookSecret = process.env.WEBHOOK_SECRET || "budi-webhook-secret";
```

**Remediation:**
Remove default, require explicit configuration.

---

### HIGH-003: Unvalidated Redirect URLs

**File:** `apps/web/src/lib/api.ts`
**CWE:** CWE-601 (URL Redirection to Untrusted Site)

**Description:**
No validation of redirect URLs after authentication.

---

## MEDIUM Severity Issues

### MED-001: Console.log in Production Code

**Files:**
- `api/index.ts:52`
- `services/api/src/worker/exportWorker.ts` (multiple)
- `services/api/src/lib/dlq.ts:35,277,283,286`

**Description:**
Production code contains console.log statements that may leak sensitive information.

**Remediation:**
Replace with structured logging (already have `request.log`).

---

### MED-002: Missing Rate Limiting on Auth Endpoints

**File:** `services/api/src/routes/v1.ts`
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)

**Description:**
`/v1/auth/register` and auth endpoints lack specific rate limiting beyond global limits.

---

### MED-003: Error Messages Expose Internal Details

**Files:** Multiple API route handlers

**Description:**
Some error messages return stack traces or internal paths in development mode.

---

### MED-004: Missing Input Length Validation

**File:** `services/api/src/lib/validation.ts`

**Description:**
Some string inputs lack maximum length constraints.

---

### MED-005: CORS Allows Wildcard in Dev

**File:** `services/api/src/app.ts:28`

```typescript
origin: process.env.CORS_ORIGIN || true,
```

**Description:**
CORS defaults to allow all origins if not configured.

---

## LOW Severity Issues

### LOW-001: Unused Variables in Components

**Files:**
- `apps/web/src/app/(app)/billing/page.tsx:26` - unused `Plan`
- `apps/web/src/app/(app)/settings/page.tsx:26` - unused `cn`
- Multiple component files with unused imports

**Remediation:**
Run ESLint with `--fix` and enable stricter unused-vars rule.

---

### LOW-002: Missing TypeScript Strict Mode

**Files:** Some tsconfig.json files

**Description:**
Not all TypeScript configurations use strict mode.

---

### LOW-003: Deprecated Dependencies

**Dependencies:**
- `eslint@8.57.1` - deprecated
- `@humanwhocodes/config-array@0.13.0` - deprecated
- `glob@7.2.3` - deprecated
- `inflight@1.0.6` - deprecated

---

### LOW-004: Missing Error Boundaries

**File:** `apps/web/src/app/`

**Description:**
React error boundaries not implemented for graceful failure handling.

---

### LOW-005: No CSP Headers

**Description:**
Content Security Policy headers not configured.

---

### LOW-006: Session Timeout Not Configured

**File:** `services/api/src/lib/auth.ts:119`

**Description:**
JWT expiry defaults to 7 days which may be too long for sensitive applications.

---

### LOW-007: No Audit Logging for Auth Events

**Description:**
Failed login attempts and password changes not logged to audit trail.

---

### LOW-008: Missing Health Check Timeouts

**File:** `services/api/src/app.ts:73-82`

**Description:**
Health check endpoints lack timeout handling.

---

## Test Coverage Analysis

| Module | Files | Test Files | Coverage |
|--------|-------|------------|----------|
| API Core | 25 | 6 | ~24% |
| Web Frontend | 35 | 0 | 0% |
| Rust Workers | 8 | 2 | ~25% |
| Contracts | 1 | 0 | 0% |

**Critical Gap:** Frontend has zero test coverage.

---

## Dependency Audit

### Outdated Packages
- `next`: 14.2.35 (latest: 15.x - major upgrade available)
- `eslint`: 8.57.1 (deprecated, v9 available)
- `prisma`: 5.22.0 (7.x available)

### Security Advisories
Run `pnpm audit` for current vulnerabilities.

---

## Architecture Concerns

1. **Monolith Frontend:** All state in single Zustand stores, consider splitting
2. **No Message Queue Visibility:** Redis queue lacks observability
3. **Missing Circuit Breakers:** External service calls (Stripe, S3) lack circuit breakers
4. **No Request Tracing:** Distributed tracing not implemented

---

## Recommendations Priority Matrix

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Fix localStorage token storage | Medium | Critical |
| P0 | Remove default JWT secret | Low | Critical |
| P1 | Add HTTPS enforcement | Low | High |
| P1 | Remove webhook secret default | Low | High |
| P2 | Replace console.log with logger | Medium | Medium |
| P2 | Add frontend tests | High | Medium |
| P3 | Update deprecated deps | Medium | Low |

---

## Compliance Checklist

- [x] GDPR: Data export/deletion implemented
- [x] Input Validation: Zod schemas in place
- [ ] OWASP Top 10: Partial compliance (see findings)
- [ ] SOC 2: Not assessed
- [ ] PCI-DSS: N/A (uses Stripe)

---

## Next Audit Schedule

- **Daily:** Automated dependency scan (GitHub Actions)
- **Weekly:** Security scan on PRs
- **Monthly:** Full manual audit
- **Quarterly:** Penetration testing

---

*This report was generated automatically. For questions, invoke `/audit` command.*
