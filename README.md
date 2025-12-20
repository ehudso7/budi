# MasterForge

This repository contains the monorepo setup for the MasterForge/Budi application. It includes:

- `apps/` — placeholders for the native mobile applications.
- `services/` — backend API and worker services.
- `packages/` — shared libraries and configurations.
- `infra/` — Docker Compose configuration for local development (Postgres, Redis, MinIO).

To get started:

```sh
pnpm install
pnpm infra:up
pnpm dev
```

Then visit `http://localhost:4000/health` to check that the API is running.

### Next steps

This repository now includes a simple job queue and contracts for audio processing:

- `packages/contracts` defines TypeScript interfaces for jobs (analyze, fix, master, codec preview).
- `services/api/src/routes/jobs.ts` exposes HTTP endpoints that enqueue these jobs into Redis.
- `services/worker-dsp` is a Rust crate that listens for jobs from Redis and will eventually perform audio analysis and processing.

You can enqueue a job by POSTing to one of the `/jobs/...` endpoints. The DSP worker will pick it up and process it (currently it just logs the request).