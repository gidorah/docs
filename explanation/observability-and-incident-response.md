---
title: "Observability and incident response"
description: "What observability exists in Catena today, and where to look first when something breaks."
---

# Observability and incident response

What observability exists in Catena today, and where to look first when something breaks.

For the step-by-step debug flow on an actual incident, see [`../how-to/debug-a-failed-ingest.md`](https://github.com/gidorah/catena/blob/dev/how-to/debug-a-failed-ingest.md).

[ADR-040](https://github.com/gidorah/catena/blob/dev/decisions/040-supabase-cloud-bridge.md) turns some remaining gaps into first-customer blockers: uptime checks, quota/spend alerts, production smoke tests, and restore drills must exist before customer data lands. See [`supabase-cloud-production-scale-strategy.md`](/explanation/supabase-cloud-production-scale-strategy) Phase 3.

## What exists today

### Sentry (dashboard errors, traces, replays, logs)

The Next.js dashboard integrates Sentry via `@sentry/nextjs` ([ADR-044](https://github.com/gidorah/catena/blob/dev/decisions/044-sentry-error-monitoring.md)). One Sentry project covers local, staging, and production; events are separated by the `environment` tag (`local`, `staging`, `production`) and by `release` (`CATENA_DEPLOY_SHA` in Cloud deploys).

Capabilities enabled when a DSN is configured:

- Error monitoring for client, server, and edge runtimes
- Performance tracing (100% sample rate locally; 10% in staging/production)
- Session replay on staging/production only (1% of sessions; 100% of error sessions)
- Sentry Logs: `console.warn` / `console.error` on server and edge (via `consoleLoggingIntegration`), plus structured ingest events (`ingest_stage`, `failure_reason`, …) via `Sentry.logger` when a DSN is set. Without a DSN, ingest failures and warnings fall back to JSON `[ingest]` lines in Coolify container logs.
- Source maps uploaded during Coolify Docker builds when `SENTRY_AUTH_TOKEN` is set
- Browser events tunneled through `/monitoring` to reduce ad-blocker drops

Local development disables Sentry unless `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` are set in `apps/dashboard/.env.local` (use the same DSN for both). Omit both for normal local work. Filter Sentry Logs with `environment:local` for host or Compose `next dev`.

**Local verification:** with `pnpm --filter @catena/dashboard dev` running, `GET /api/health/sentry` (development only) returns `{ dsnConfigured, sdkInitialized, environment, release, debugEnabled }`. Upload a document or trigger a handled ingest failure to confirm structured ingest entries in Sentry **Logs** (not Issues) when a DSN is set. Unhandled exceptions still surface as Sentry Issues via the SDK default. The SDK runs with `debug: true` in the `local` environment so the Next.js terminal prints send/drop diagnostics.

**Compose `npm run docker:up` note:** the dashboard dev container must reach `*.ingest.us.sentry.io` over HTTPS. If container logs show `Failed to proxy … ingest.sentry.io … socket hang up` or `fetch failed`, events never leave the machine — use host `pnpm --filter @catena/dashboard dev` (stop the Compose dashboard service first) or fix Docker outbound DNS/firewall. The `/monitoring` tunnel is disabled in `NODE_ENV=development` so the SDK talks to Sentry directly.

**Host `pnpm dev` TLS / proxy note:** when `HTTP_PROXY` or `HTTPS_PROXY` point at a local MITM proxy (common in Cursor: `127.0.0.1:38193`), the Sentry SDK may log `DEPTH_ZERO_SELF_SIGNED_CERT` and drop envelopes even though `debug: true` shows spans flushing. Logs never reach Sentry **Logs** until ingest HTTPS succeeds. Fix by adding Sentry hosts to `NO_PROXY` (for example `.ingest.us.sentry.io,.ingest.sentry.io,sentry.io`) or by starting the dev server with proxy env vars unset for that shell.

After the first Cloud deploy with Sentry configured, finish operator setup in the Sentry UI — see [Sentry project operator checklist](#sentry-project-operator-checklist) below.

### Coolify container stdout / stderr

Cloud and self-hosted deployments stream container logs to Coolify's operator console:

- The Next.js dashboard process (`apps/dashboard`) — anything emitted via `console.log`, `console.error`, `console.warn`.
- In self-hosted mode, the Supabase services from `docker-compose.yml` — Kong, GoTrue, PostgREST, Postgres, Storage, and the rest.

`console.error` and `console.warn` are kept in production builds **on purpose** — they remain a useful fallback during incidents. They must not be stripped.

### Supabase Studio / Cloud Dashboard

Studio (or the Supabase Cloud Dashboard for Cloud mode) surfaces:

- Recent SQL queries and their execution time.
- Auth events (sign-in success/failure, password reset).
- Storage events (uploads, signed-URL access).
- Postgres logs.

Retention depends on the Supabase project tier — assume short.

### Application-level structured logging

Beyond Sentry logs and `console.error` / `console.warn`, there is no custom JSON logging layer, no request IDs, and no trace context propagation through the ingest pipeline.

## What is monitored

| Signal | Status |
| ------ | ------ |
| Dashboard errors (Sentry) | Active when DSN is configured |
| Dashboard performance traces (Sentry) | Active when DSN is configured |
| Session replay (Sentry) | Staging/production only |
| Structured ingest logs (Sentry Logs) | Active when DSN is configured |
| Uptime | Manual / optional Sentry uptime monitor (see checklist below) |
| Grafana / metrics dashboards | Not configured |
| Automated alert routing beyond Sentry email | Not configured |

## What to check first when a customer reports an issue

Check in this order:

1. **Sentry** — filter by `environment:production`, then by `release` matching `/api/health/version` commit. Look for new or regressed issues near the report window. For upload/parse reports, also check **Logs** filtered by `project_id` or `file_name`.
2. **Coolify container logs** for the dashboard service at the reported timestamp. Look for stack traces or `console.error` lines near the report window.
3. **Supabase Cloud Dashboard** on the production project at the same timestamp:
   - SQL query log for failures or unusually slow queries.
   - Auth events if the report is sign-in or session related.
   - Storage events if the report involves an upload.
4. **`project_documents.parse_status`** for the customer's project, if the report is upload-related. The column is a `document_parse_status` enum with values `not_applicable` (default; non-GAEB file), `success`, `partial`, or `failed` — see [`document-ingest-pipeline.md`](/explanation/document-ingest-pipeline).

The detailed playbook lives in [`../how-to/debug-a-failed-ingest.md`](https://github.com/gidorah/catena/blob/dev/how-to/debug-a-failed-ingest.md).

## Sentry project operator checklist

Complete these steps in the Sentry UI after the first staging or production events arrive:

1. **Verify org/project slugs** match `SENTRY_ORG` / `SENTRY_PROJECT` in Coolify build vars (defaults: `catena` / `dashboard`).
2. **Alerts** — create an email alert for new issues where `environment equals production`. Add a separate, lower-priority alert for `environment equals staging`.
3. **Replay privacy** — confirm text, media, and inputs stay masked (configured in code). Block or mask sensitive routes such as `/auth/*` if replay volume grows.
4. **Uptime monitor** (optional; free tier includes one) — point at `https://dashboard.prod.catena.onur.sh/api/health/version`.
5. **Dashboards** (optional) — chart error rate by environment and watch for release regressions after deploys.

### Post-deploy verification

After configuring Coolify build/runtime vars and deploying:

1. Confirm `/api/health/version` returns the expected commit SHA.
2. In Sentry, filter issues by that `release` value and the target `environment` (`staging` or `production`).
3. Trigger a harmless test error in the target environment (for example a temporary dev-only route or controlled server error during staging validation) and confirm one issue arrives with the expected tags.
4. Open the issue stack trace and confirm frames are symbolicated when `SENTRY_AUTH_TOKEN` was present at build time.

## Known gaps

- **No request-ID propagation** through the ingest pipeline. `proxy.ts` handles locale-prefixed pages only (`/api/*`, `/auth/*`, and `/monitoring` are excluded from its matcher) and does not attach a request-scoped correlation ID. Route handlers and Postgres calls likewise have no shared ID. To reproduce a customer bug from logs alone, you currently need three correlated facts: the report timestamp, the `project_id`, and the document filename. Without those, container logs, Postgres logs, and Sentry events cannot be joined automatically.
- **No log aggregation across services.** Coolify shows the dashboard logs; Supabase shows the database logs; Sentry holds dashboard errors/traces; nothing automatically correlates all three.
- **No metrics / no Grafana.** No latency histograms, no error-rate graphs, no resource dashboards beyond Coolify's host view and optional Sentry dashboards.
- **No quota/spend alerting** for Supabase Cloud usage yet.

When any gap is closed, an ADR records the decision and this page is updated.
