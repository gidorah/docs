---
title: "ADR-034: Coolify-Only Deployment Target for the MVP"
description: "> **Scope:** This decision is MVP-scoped, not a permanent architectural commitment. The revisit trigger is named explicitly below."
status: Superseded
date: 2026-05-01
implementation: shipped
implemented-in: docker-compose.yml
superseded-by: 040
---


## ADR-034: Coolify-Only Deployment Target for the MVP

> **Scope:** This decision is MVP-scoped, not a permanent architectural commitment. The revisit trigger is named explicitly below.

### Context

The pre-MVP topology used Vercel for the dashboard and per-PR Supabase Cloud preview branches for review environments. Combined PR-preview infrastructure cost (Vercel build minutes + Supabase Cloud branch projects) exceeded the MVP budget set by the sole technical contributor. The product has no paying customers yet, so PR-preview convenience does not yet justify the recurring spend.

### Decision

Coolify (self-hosted) is the **only** active production deployment target for the MVP. The Vercel-related GitHub Actions workflows (`supabase-preview-branch.yml`, `supabase-preview-cleanup.yml`, and the `workflows-backup-20251125-002735/` snapshot containing `vercel-deploy-preview.yml` and `vercel-deploy-production.yml`) have been deleted. The dashboard runs in Next.js standalone mode under `Dockerfile.self-hosted` + `docker-compose.yml` (see [ADR-038](/decisions/038-single-canonical-compose-with-local-overlay) for the consolidation that removed the legacy `docker-compose.self-hosted.yml`).

### Consequences

- **Lost:** PR preview deploys, isolated per-PR Supabase preview databases.
- **Gained:** Predictable monthly hosting cost; one deployment target to reason about; full control over the runtime.
- **Carried:** Self-hosted operational gotchas (swap, multipart upload reconstruction, `MaxStartups`) — see [`../how-to/deploy-to-coolify.md`](https://github.com/gidorah/catena/blob/dev/how-to/deploy-to-coolify.md) Operational gotchas.

### Revisit trigger

Reconsider this ADR when **either** condition fires:

1. The first paying customer is onboarded — at that point the cost equation changes and PR-preview convenience may become worth re-paying for.
2. CI/CD friction (lack of preview environments, slow iteration on schema changes) starts visibly outweighing the monthly hosting savings.

### Implementation notes

Phase A of the v3 documentation reconstruction removed the Vercel/Supabase preview workflows. `migrations.yml` now validates migration PRs against a disposable local Supabase CLI database and pgTAP; it does not apply migrations to Coolify or Supabase Cloud.

[ADR-040](/decisions/040-supabase-cloud-bridge) supersedes the backend target for Cloud mode. The tag-driven Cloud production **pipeline** is live in GitHub Actions, but customer-facing production **deployment** remains self-hosted until Phase 3 cutover — see [`../explanation/ci-cd-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/ci-cd-pipeline.md).
