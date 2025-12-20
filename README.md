# MasterForge

This repository contains the monorepo setup for the MasterForge application. It includes:

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