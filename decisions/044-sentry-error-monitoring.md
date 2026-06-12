---
title: "ADR-044: Sentry Error Monitoring for the Dashboard"
description: "Catena had no centralized error tracking. Stack traces appeared only in Coolify"
status: Accepted
date: 2026-05-26
implementation: shipped
implemented-in: apps/dashboard
---


## ADR-044: Sentry Error Monitoring for the Dashboard

### Context

Catena had no centralized error tracking. Stack traces appeared only in Coolify
container logs, which made production incidents hard to detect and correlate.
Phase 3 of the Supabase Cloud production hardening plan requires error monitoring
before first customer data lands. The dashboard already exposes deploy identity
through `CATENA_DEPLOY_ENV`, `CATENA_DEPLOY_SHA`, and `/api/health/version`.

### Decision

Integrate Sentry on the Next.js dashboard using `@sentry/nextjs` with a **single
Sentry project and DSN** across local, staging, and production. Separate traffic
with Sentry tags, not separate projects:

| Deploy surface | Sentry `environment` | Sentry `release` |
| -------------- | -------------------- | ---------------- |
| Local dev (DSN optional) | `local` | `local-dev` or `CATENA_DEPLOY_SHA` |
| Cloud staging | `staging` | `CATENA_DEPLOY_SHA` |
| Cloud production | `production` | `CATENA_DEPLOY_SHA` |

Scope on the Sentry Developer (free) plan:

- Error monitoring on all runtimes when a DSN is present
- Performance tracing (100% locally; 10% in staging/production)
- Session replay on staging/production only (1% session sample; 100% on error)
- Application logs (`enableLogs`)
- Structured ingest signals via `Sentry.logger` (`ingest_stage`, `failure_reason`, …); these appear in Sentry **Logs**, not Issues. Other server `console.warn` / `console.error` lines are bridged into Logs when a DSN is set.
- Unhandled exceptions continue to surface as Sentry **Issues** through the SDK default pipeline
- Source maps uploaded during Coolify Docker builds when `SENTRY_AUTH_TOKEN` is set
- Browser events tunneled through `/monitoring`

Privacy defaults:

- `sendDefaultPii: false`
- scrub `Authorization`, `Cookie`, and Supabase auth headers in `beforeSend`
- mask replay text, media, and inputs in staging/production

Local development **does not require Sentry**. When `NEXT_PUBLIC_SENTRY_DSN` is
unset, the SDK no-ops. When set for local testing, session replay stays disabled.

Self-hosted Coolify deployments are out of scope for MVP Sentry rollout; only Cloud
staging and production Coolify resources should configure Sentry env vars.

CI builds do not upload source maps unless `SENTRY_AUTH_TOKEN` is provided; the
webpack plugin is disabled without it.

### Consequences

- Operators configure Sentry build/runtime vars on both Cloud Coolify resources;
  see [`../how-to/deploy-to-coolify.md`](https://github.com/gidorah/catena/blob/dev/how-to/deploy-to-coolify.md).
- Sentry UI alerts, replay privacy review, and optional uptime monitoring remain
  manual operator steps documented in
  [`../explanation/observability-and-incident-response.md`](https://github.com/gidorah/catena/blob/dev/explanation/observability-and-incident-response.md).
- `console.error` / `console.warn` remain in production builds as a fallback signal.
- Supabase-side observability (SQL, Auth, Storage) stays in Supabase Cloud; Sentry
  covers the dashboard application only.

### Revisit trigger

Reconsider this ADR when any of the following apply:

- the free-tier quotas are exhausted under normal staging/production traffic
- customer data residency or DPA terms require EU-only Sentry hosting review
- a second operator needs Sentry access (Developer plan is single-user)
- backend services outside the Next.js dashboard need unified tracing
