---
title: "ADR-043: Cloud-Mode Dashboard Compose Artifact"
description: "ADR-038 made `docker-compose.yml` the single canonical Compose artifact for"
status: Accepted
date: 2026-05-23
implementation: partial
implemented-in: docker-compose.cloud.yml
---


## ADR-043: Cloud-Mode Dashboard Compose Artifact

### Context

ADR-038 made `docker-compose.yml` the single canonical Compose artifact for
the shipped self-hosted Catena stack. That remains correct for local
development and the currently active Coolify/self-hosted Supabase deployment:
the dashboard, Supabase services, and one-shot Compose migrator start together.

ADR-040 changes the staging and production target topology. In Cloud mode,
Coolify hosts only the dashboard while Supabase Cloud owns database, Auth,
Storage, PostgREST, Realtime, and migration history. Reusing the self-hosted
Compose file for that topology would keep unnecessary Supabase containers in
Cloud environments and would preserve local-only dependencies such as the
Compose `migrator`.

### Decision

Add a second top-level Compose file, `docker-compose.cloud.yml`, scoped only to
Cloud dashboard deployments.

`docker-compose.yml` remains the authoritative self-hosted/local artifact. The
Cloud artifact is intentionally not a replacement for it and must not be used by
`npm run docker:up`.

The Cloud artifact:

- starts only the `dashboard` service;
- excludes self-hosted Supabase services and the Compose `migrator`;
- avoids a top-level Compose `name:` and fixed `container_name` values so
  Coolify can namespace staging and production resources independently;
- keeps `NEXT_PUBLIC_*` Supabase values as build arguments because Next.js
  inlines those values during `next build`;
- requires `CATENA_DEPLOY_SHA` at build and runtime so the deployed dashboard can
  expose a non-secret commit check at `/api/health/version`;
- keeps `SUPABASE_URL` runtime-only so server code can target the intended
  Supabase Cloud project without baking private runtime configuration into the
  client bundle;
- does not pass a service-role key to the dashboard runtime.

### Consequences

Staging and production Cloud dashboards must be built separately from the same
immutable commit SHA, with each environment's own `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` values.

Cloud migration ordering moves out of Compose. GitHub Actions must apply and
verify Supabase Cloud migrations before triggering the matching Coolify
dashboard deploy.

The self-hosted path keeps its existing Compose migrator dependency and remains
covered by ADR-038, ADR-039, and ADR-042.
