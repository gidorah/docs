---
title: "Architecture"
description: "How Catena's runtime pieces fit together. This page is **runtime / data flow only** — it does not cover frontend conventions (React Server Components, route groups, dashboard la..."
---

# Architecture

How Catena's runtime pieces fit together. This page is **runtime / data flow only** — it does not cover frontend conventions (React Server Components, route groups, dashboard layout). For those, see [`frontend-architecture.md`](/explanation/frontend-architecture).

For the one-page entry point, see [`../overview.md`](https://github.com/gidorah/catena/blob/dev/overview.md). For the conceptual data model, see [`data-model.md`](/explanation/data-model).

## High-level picture

```
                ┌──────────────────────┐
                │   Browser            │
                │   (Next.js App)      │
                └──────────┬───────────┘
                           │ HTTPS
                           ▼
            ┌──────────────────────────────┐
            │   apps/dashboard             │
            │   Next.js 16 / React 19      │
            │   port 3002                  │
            │                              │
            │   ┌────────────────────┐     │
            │   │ @catena/gaeb-parser│     │  pure-TS, runs in
            │   │ (in-process)       │     │  the dashboard's
            │   └────────────────────┘     │  Node process
            └──────────────┬───────────────┘
                           │  PostgREST + Storage
                           │  (anon / service role)
                           ▼
            ┌──────────────────────────────┐
            │   Supabase (Docker)          │
            │   ├─ Kong (API gateway)      │
            │   ├─ GoTrue (auth)           │
            │   ├─ PostgREST (data API)    │
            │   ├─ Postgres (RLS, pgTAP)   │
            │   ├─ Storage (project-       │
            │   │           documents)     │
            │   ├─ Vector + Logflare       │
            │   │  (log shipping)          │
            │   └─ Realtime, Edge Functions│
            │      Imgproxy, Studio, Meta, │
            │      Supavisor — present in  │
            │      compose, unused by app  │
            └──────────────────────────────┘
```

The dashboard is the only substantive app. Everything backend lives in Supabase — there is no separate API service.

## Monorepo packages

Turbo monorepo, pnpm workspaces. Node ≥20.19, `packageManager: pnpm@10`.

| Path                         | Kind        | What it is                                                               |
| ---------------------------- | ----------- | ------------------------------------------------------------------------ |
| `apps/dashboard`             | Next.js app | The product. Port 3002. App Router with `[locale]` segment.              |
| `packages/gaeb-parser`       | library     | Standalone GAEB DA XML parser. `.x83` is the regression-tested contract. |
| `packages/eslint-config`     | config      | Shared lint rules.                                                       |
| `packages/typescript-config` | config      | Shared `tsconfig` bases.                                                 |
| `supabase/`                  | backend     | Migrations (plain SQL), pgTAP tests, `seed.sql`, `config.toml`.          |

The dashboard imports `@catena/gaeb-parser` directly. There is no out-of-process parsing service.

## Request flow: document upload

The single most important runtime path in MVP. It crosses three Supabase services (GoTrue for auth, then Storage for the file, then Postgres for the record + parsed BoQ). The Postgres write is atomic in SQL; the Storage write is a separate operation not enrolled in that transaction. A failed `project_documents` insert triggers an explicit `storage.remove` cleanup; an interrupted request between successful storage upload and the DB insert can leave an orphaned object in the bucket — there is no scheduled sweep today.

```
Browser                   Dashboard route                Supabase
   │                          │                              │
   │ POST .x83 file ─────────▶│                              │
   │  (multipart)             │                              │
   │                          │ supabase.auth.getUser() ────▶│ GoTrue
   │                          │ verify project ownership ───▶│ Postgres (RLS)
   │                          │                              │
   │                          │ rawBody = arrayBuffer()      │
   │                          │ bounded multipart parser     │
   │                          │ (Coolify/Traefik-safe)       │
   │                          │                              │
   │                          │ storage.upload() ───────────▶│ Storage
   │                          │                              │   (project-documents/
   │                          │                              │    <user_id>/<ts>_<file>)
   │                          │                              │
   │                          │ insert project_documents ───▶│ Postgres
   │                          │                              │
   │                          │ if extension is .x83:        │
   │                          │ parseGaebXml(text)           │
   │                          │  (in-process, pure TS;       │
   │                          │   other GAEB phases rejected)│
   │                          │                              │
   │                          │ rpc ingest_boq_and_          │
   │                          │     bootstrap(...) ─────────▶│ Postgres
   │                          │                              │   ┌─ insert boq_categories
   │                          │                              │   ├─ insert boq_items
   │                          │                              │   ├─ check orphan rate ≤ 50%
   │                          │                              │   ├─ update parse_status
   │                          │                              │   └─ bootstrap_canonical_…
   │                          │                              │   (one transaction; rolls
   │                          │                              │    back as a unit)
   │                          │                              │
   │ 201 Created ◀────────────│                              │
```

The route lives at `apps/dashboard/src/app/api/projects/[id]/documents/route.ts`. The SQL function lives at `supabase/migrations/20260408000010_ingest_boq_function.sql`.

For the end-to-end pipeline narrative (failure modes, idempotency, why the boundary sits in SQL), see [`document-ingest-pipeline.md`](/explanation/document-ingest-pipeline).

## Key boundaries (and why they're where they are)

These are the seams that shape the rest of the architecture. Treat them as load-bearing.

- **The parser is pure TypeScript and runs in-process.** `@catena/gaeb-parser` has no I/O, no DB calls, no network. It takes XML text, returns metadata + categories + items. That makes it cheap to test (vitest only, no fixtures DB), portable (could move out of process later without rewriting it), and deterministic (ADR-035). The upload route imports it dynamically (`await import("@catena/gaeb-parser")` inside the `maybeParseGaeb` helper) so non-GAEB uploads don't pay the cost of loading it.

- **BoQ ingest is atomic in SQL, not orchestrated in the API layer.** The route hands parsed JSONB to `ingest_boq_and_bootstrap(p_document_id, p_user_id, p_categories, p_items)`. Categories, items, parse-status update, and canonical bootstrap all run in one Postgres transaction. If anything inside fails — orphan rate exceeds 50%, an FK is violated, the bootstrap can't complete — the whole transaction rolls back and the document is left in `parse_status = 'failed'`, never half-ingested. Do not reintroduce multi-statement orchestration in the API route.

- **Three Supabase clients, picked deliberately.** `src/lib/supabase/client.ts` (browser, anon), `server.ts` (SSR + route handlers, anon + user cookies), `admin.ts` (service role, RLS-bypassing, server-only). Mixing them up either ships secrets to the browser or silently bypasses ownership checks. Locked in by [ADR-036](https://github.com/gidorah/catena/blob/dev/decisions/036-three-supabase-clients.md). Picking one: see [`how-to/add-a-supabase-client.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-a-supabase-client.md).

- **`SUPABASE_URL` (server) vs `NEXT_PUBLIC_SUPABASE_URL` (browser) split.** Self-hosted (Coolify) puts Kong on an internal Docker network at `http://kong:8000` that the browser can't reach. The server-side client prefers `SUPABASE_URL` (internal) and falls back to `NEXT_PUBLIC_SUPABASE_URL`. Collapse them and one of two things breaks: setting both to the public URL means SSR pays an extra public-internet round-trip per request; setting both to `kong:8000` means the browser tries to resolve a Docker hostname and login fails before any request reaches Supabase. See [ADR-036](https://github.com/gidorah/catena/blob/dev/decisions/036-three-supabase-clients.md).

- **RLS is the authority for project isolation; the explicit `created_by` check in route handlers is for UX.** Every canonical and source-layer table joins back to `projects.created_by = auth.uid()`. The upload route also runs an explicit ownership query before doing work, but only so a wrong-user / wrong-project request returns a clean 404 fast — RLS would refuse the rows either way. Defense in depth, not redundant logic. See [`auth-and-authorization.md`](/explanation/auth-and-authorization).

- **Source layer is immutable after creation.** Once `boq_categories` and `boq_items` are inserted, they are not edited. All editing happens on the canonical layer (`canonical_categories`, `canonical_items`). This is what makes the parser deterministic claim verifiable (ADR-002, ADR-020). See [`data-model.md`](/explanation/data-model).

## Deployment shape

**Current deployed topology: Coolify (self-hosted).** `docker-compose.yml` + `Dockerfile.self-hosted` + Next.js standalone mode. The full Supabase stack runs in Docker on the same host. The dashboard runs as a single Node process (`CMD ["node", "apps/dashboard/server.js"]` — no cluster mode, no PM2). Scaling is horizontal: more dashboard containers, not more workers per container. The standalone entrypoint (`apps/dashboard/server.js`) is generated by the Next.js build, not committed to the repo.

[ADR-040](https://github.com/gidorah/catena/blob/dev/decisions/040-supabase-cloud-bridge.md) accepts a production topology where Coolify hosts the dashboard and Supabase Cloud hosts DB/Auth/Storage. Phase 0 now has a dashboard-only Cloud Compose artifact, Cloud migration workflow, environment validation, and staging smoke lane; current production remains self-hosted until the Cloud gates in [`supabase-cloud-production-scale-strategy.md`](/explanation/supabase-cloud-production-scale-strategy) pass.

[ADR-034](https://github.com/gidorah/catena/blob/dev/decisions/034-coolify-only-for-mvp.md) records why Vercel + per-PR Supabase preview branches were dropped for MVP and is superseded by ADR-040 for future production topology. Active GitHub Actions workflows are summarized in [`ci-cd-pipeline.md`](/explanation/ci-cd-pipeline).

For CI/CD workflow architecture (PR gates, staging, tag-driven production), see [`ci-cd-pipeline.md`](/explanation/ci-cd-pipeline). For the operational walk-through (PR checklist, staging verification, release steps), see [`how-to/work-with-prs-staging-and-releases.md`](https://github.com/gidorah/catena/blob/dev/how-to/work-with-prs-staging-and-releases.md). For Coolify setup and env vars, see [`how-to/deploy-to-coolify.md`](https://github.com/gidorah/catena/blob/dev/how-to/deploy-to-coolify.md).

## What's _not_ here (intentional gaps)

- **No worker / queue / background-job runtime.** Parsing happens synchronously inside the upload request, on the same Node event loop that serves every other request hitting the same container. The 50 MB validation cap (`MAX_FILE_SIZE` in `src/lib/file-validation.ts`) bounds the worst case; a parse of a near-cap file blocks the event loop for the whole container during that time. Acceptable for MVP traffic; at scale this becomes a queue.
- **No request-ID propagation.** Logs in the dashboard, in Postgres, and in Storage cannot currently be correlated for a single upload. Documented in [`observability-and-incident-response.md`](/explanation/observability-and-incident-response).
- **No subcontractor portal yet.** The outbound boundary (`outbound_requests`) is in place schema-wise so future sends are frozen snapshots ([ADR-031](https://github.com/gidorah/catena/blob/dev/decisions/031-freeze-sent-content-in-outbound-snapshot.md)), but the portal itself is post-MVP.

## Cross-references

- [`overview.md`](https://github.com/gidorah/catena/blob/dev/overview.md) — one-page entry point.
- [`frontend-architecture.md`](/explanation/frontend-architecture) — RSC, route groups, dashboard conventions.
- [`data-model.md`](/explanation/data-model) — source / canonical / outbound layers.
- [`document-ingest-pipeline.md`](/explanation/document-ingest-pipeline) — end-to-end ingest narrative.
- [`auth-and-authorization.md`](/explanation/auth-and-authorization) — auth flow + RLS chain.
- [`ci-cd-pipeline.md`](/explanation/ci-cd-pipeline) — GitHub Actions workflows, branch model, deploy lanes.
- [`../how-to/work-with-prs-staging-and-releases.md`](https://github.com/gidorah/catena/blob/dev/how-to/work-with-prs-staging-and-releases.md) — PR, staging verification, and release checklist.
- [ADR-034: Coolify only for MVP](https://github.com/gidorah/catena/blob/dev/decisions/034-coolify-only-for-mvp.md), [ADR-035: Deterministic parser](https://github.com/gidorah/catena/blob/dev/decisions/035-deterministic-parser.md), [ADR-036: Three Supabase clients](https://github.com/gidorah/catena/blob/dev/decisions/036-three-supabase-clients.md), [ADR-040: Supabase Cloud bridge](https://github.com/gidorah/catena/blob/dev/decisions/040-supabase-cloud-bridge.md).
