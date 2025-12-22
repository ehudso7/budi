# Budi - AI Audio Mastering Platform

## Project Overview

Budi is a professional audio mastering platform that uses AI-powered DSP workers to analyze, fix, and master audio tracks. The platform consists of:

- **Web Frontend**: Next.js 14 App Router application
- **API Backend**: Fastify server (deployed as Vercel serverless function)
- **Rust Workers**: Audio processing workers (DSP and Codec) deployed on Railway
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: Redis for job queuing
- **Storage**: S3-compatible storage (MinIO)
- **Payments**: Stripe integration

## Repository Structure

```text
budi/
├── apps/
│   └── web/              # Next.js frontend
├── services/
│   ├── api/              # Fastify API backend
│   ├── worker-dsp/       # Rust DSP worker
│   └── worker-codec/     # Rust codec worker
├── packages/
│   └── contracts/        # Shared TypeScript types
├── scripts/
│   └── audit/            # Security audit scripts
├── .claude/
│   └── commands/         # Claude Code commands
└── .github/
    └── workflows/        # CI/CD pipelines
```

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- Rust (for workers)
- Docker (for local services)

### Setup

```bash
pnpm install
pnpm run dev
```

### Key Commands

```bash
pnpm run build     # Build all packages
pnpm run lint      # Run linting
pnpm run typecheck # Type checking
pnpm run test      # Run tests
```

## Security Requirements

### CRITICAL - Must Be Set in Production

These environment variables MUST be set in production. The application will fail to start without them:

1. **JWT_SECRET** - Used for signing JWT tokens
2. **WEBHOOK_SECRET** - Used for authenticating worker callbacks
3. **CORS_ORIGIN** - Allowed CORS origins (comma-separated)

### Security Best Practices

- Never commit secrets to the repository
- Use environment variables for all sensitive configuration
- Review AUDIT_REPORT.md for known vulnerabilities
- Run security scans before deploying: `./scripts/audit/security-scan.sh`

## Claude Code Integration

### Available Commands

Use these slash commands when working with Claude Code:

- `/audit` - Run full codebase audit
- `/security-scan` - Run security-focused scan
- `/pre-commit-check` - Run quality checks before committing

### Audit Requirements

**Before any major PR:**
1. Run `/security-scan` to check for vulnerabilities
2. Run `/pre-commit-check` to verify quality gates
3. Review AUDIT_REPORT.md for any new issues

**Weekly:**
1. Run `/audit` for comprehensive codebase analysis
2. Update AUDIT_REPORT.md with findings
3. Address any CRITICAL or HIGH severity issues

### Security Scan Triggers

The following changes MUST trigger a security review:
- Authentication/authorization code
- Token handling
- API endpoints
- Environment variable usage
- Dependency updates

## Deployment

### Vercel (Frontend + API)

The web frontend and API are deployed together on Vercel:

```bash
vercel deploy
```

Required environment variables:
- `DATABASE_URL`
- `JWT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `REDIS_URL`
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`

### Railway (Workers)

Deploy Rust workers to Railway:

```bash
./scripts/deploy-workers.sh
```

Required environment variables for workers:
- `REDIS_URL`
- `MINIO_*` credentials
- `API_URL`
- `WEBHOOK_SECRET`

## Testing

### Running Tests

```bash
pnpm run test           # All tests
pnpm run test:api       # API tests only
pnpm run test:web       # Web tests only
```

### Test Coverage

Current coverage (see AUDIT_REPORT.md for details):
- API: ~24%
- Web: 0% (needs improvement)
- Workers: ~25%

## Contributing

1. Create a feature branch
2. Make changes
3. Run `/pre-commit-check`
4. Submit PR
5. Address any CodeRabbit or CI feedback

## Files to Never Commit

- `.env` files with real secrets
- `credentials.json`
- API keys or tokens
- Private keys

## Monitoring

- Health check: `GET /health`
- Readiness: `GET /ready`
- Metrics: Available at `/observability/metrics`

## Support

For issues, create a GitHub issue or check existing documentation.
