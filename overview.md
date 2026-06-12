---
title: "System Overview"
description: "Current-tense snapshot of what Catena does today. For where the system is going, see [`explanation/product-arc.md`](./explanation/product-arc.md)."
---

# System Overview

Current-tense snapshot of what Catena does today. For where the system is going, see [`explanation/product-arc.md`](/explanation/product-arc).

## Core capability

Catena ingests German GAEB tender documents and stores parsed Bill-of-Quantities (BoQ) in a 3-layer data model (immutable parsed source → editable canonical structure → outbound boundary). The regression-tested upload/parser contract is `.x83`; `.x84`/`.x85` remain product-relevant GAEB XML phases, but uploads are rejected until fixture-backed support exists. The dashboard is the contractor-facing surface for projects, documents, and the canonical structure. Subcontractor packaging, comparison, award, and main-offer compilation are not yet shipped.

## What's shipped

- **Auth.** Email + password, Google OAuth, "remember me" cookie behavior, user profiles. Routes under `apps/dashboard/src/app/[locale]/(auth)/`.
- **Projects.** CRUD, list view, detail view. API routes at `/api/projects`, `/api/projects/[id]`.
- **Document upload.** `/api/projects/[id]/documents` is the canonical project-scoped GAEB upload route. It uploads to storage, records `project_documents`, and triggers atomic parse + BoQ ingest via `ingest_boq_and_bootstrap`. The older generic `/api/projects/upload` route is disabled with `410 Gone`.
- **GAEB parser** ([`packages/gaeb-parser`](https://github.com/gidorah/catena/blob/dev/packages/gaeb-parser/)). Standalone library; parses GAEB DA XML into metadata + BoQ + items, with an X83 translation engine. The regression-tested upload/parser contract is `.x83`; `.x84`/`.x85` remain product-relevant but are rejected until fixtures and support exist. Hardened against real-world tender quirks (mixed `TERMINE` deadlines, nested stop-nodes, `OWN.Address.Name1` client addresses, flat hierarchy variants).
- **3-layer data model in SQL.** Migrations `20260403*` and `20260408*` implement the canonical editable model: source layer (immutable after creation), canonical categories/items, work-package tables, review/audit columns, RLS, atomic ingest function, mutation invariants, outbound boundary. See [`explanation/data-model.md`](/explanation/data-model).
- **Feature-flag system.** `CATENA_FEATURE_X83_TRANSLATOR` gates the X83 translation tool. See [`reference/feature-flags.md`](/reference/feature-flags).
- **Dashboard pages** under `apps/dashboard/src/app/[locale]/(main)/dashboard/`:
  - `default/` — landing/home with new-project entry.
  - `projects/` — list + detail (uses the data-table component).
  - `x83-translation/` — feature-flagged translator tool.
- **Current deployment** remains self-hosted via Coolify using `Dockerfile.self-hosted` + `docker-compose.yml` + Next.js standalone mode. Cloud staging/production mode is implemented as a dashboard-only artifact in `docker-compose.cloud.yml` and is governed by [ADR-040](/decisions/040-supabase-cloud-bridge) and [ADR-043](/decisions/043-cloud-mode-compose-artifact). Local dev layers `docker-compose.local.yml` on top via `npm run docker:up`. See [`how-to/deploy-to-coolify.md`](/how-to/deploy-to-coolify), [`decisions/034-coolify-only-for-mvp.md`](/decisions/034-coolify-only-for-mvp), and [`decisions/038-single-canonical-compose-with-local-overlay.md`](/decisions/038-single-canonical-compose-with-local-overlay).
- **Local Supabase stack** via Docker Compose with timestamp-prefixed plain-SQL migrations and a pgTAP test suite (`supabase/tests/`).

## What's in progress

- **Editable canonical structure UI** — data model is in place (Phases 1–7 of Epic 4.1, see [archive plans on GitHub](https://github.com/gidorah/catena/tree/dev/docs/archive/plans) and [`decisions/`](/decisions)); UI to rename/move/merge categories is the next surface.

## What's scoped but not started

- Work-package creation UI (Phase 6 migrations exist; UI does not).
- Subcontractor packaging / export bundle.
- Offer ingest, Preisspiegel, award flow, main-offer compilation, submission. These are the right-half of Layer 1 Stage 1; provisioned doc paths exist in [`README.md`](/engineering-docs).

## What's aspirational (not in repo)

- Email integration (Layer 1 Stage 2).
- Subcontractor portal (Layer 1 Stage 3).
- AI agent implementation (Layer 3).
- Marketplace (Layer 4).
- Kubernetes, Grafana, dedicated observability stack — not in repo. Operational logging today is `console.error`/`console.warn` to container stdout.

## Stack summary

- **Monorepo:** Turbo + pnpm workspaces (pnpm 10, Node ≥20.19).
- **App:** `apps/dashboard` — Next.js 16 + React 19 on port **3002**.
- **Backend:** Local/current production use self-hosted Supabase via Docker. Cloud staging/production mode uses Supabase Cloud for Postgres, Auth, Storage, and PostgREST.
- **Internal packages:** `@catena/gaeb-parser`, `@repo/eslint-config`, `@repo/typescript-config`.
- **Testing:** Layered gates: static checks, parser Vitest, dashboard Vitest, pgTAP SQL contracts, and thin Playwright smoke.
- **CI/CD:** PRs target `dev`; merge triggers Cloud staging; SemVer tags on `main` trigger the Cloud production **pipeline** (customer-facing production **deployment** remains self-hosted until Phase 3 cutover). See [`explanation/ci-cd-pipeline.md`](/explanation/ci-cd-pipeline) and [`how-to/work-with-prs-staging-and-releases.md`](/how-to/work-with-prs-staging-and-releases).
- **Deploy:** Coolify self-hosts the full stack in self-hosted mode. In Cloud mode, Coolify deploys only the dashboard from `docker-compose.cloud.yml`.

For the strategic arc and forthcoming layers, continue to [`explanation/product-arc.md`](/explanation/product-arc).
