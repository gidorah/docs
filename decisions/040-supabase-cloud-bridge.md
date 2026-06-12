---
title: "ADR-040: Supabase Cloud Bridge for Production Scale"
description: "> **Status:** Accepted target, partially implemented. Current production remains the Coolify/self-hosted Supabase topology until Cloud migration, staging smoke, and an immutable..."
status: Accepted
date: 2026-05-11
implementation: partial
---


## ADR-040: Supabase Cloud Bridge for Production Scale

> **Status:** Accepted target, partially implemented. Current production remains the Coolify/self-hosted Supabase topology until Cloud migration, staging smoke, and an immutable production deploy path pass.

### Context

ADR-034 chose Coolify-only, self-hosted Supabase for the MVP because PR preview infrastructure was too expensive before Catena had customers. The project no longer needs PR preview deployments: local development plus staging and production are enough for the sole developer workflow. The self-hosted Supabase stack now carries meaningful operational cost in local development, deployment, migrations, storage, and incident handling.

Catena is also coupled to Supabase Auth, `auth.uid()` RLS, Storage policies, and `supabase-js`/PostgREST. Removing Supabase before MVP would be a security-sensitive rewrite, but deepening the coupling before `project_members`, organizations, project sharing, and subcontractor access would make a later exit much harder.

### Decision

Catena will use Supabase Cloud as a stabilizing bridge for staging and production while deliberately reducing provider coupling through validation, service boundaries, storage abstraction, and explicit exit gates.

The target production topology is Coolify for the dashboard and required app-side services, plus Supabase Cloud for managed database, Auth, Storage, and RLS. Current local/self-hosted data is disposable and will not be migrated. Production customer data must not land on Supabase Free; production moves to Supabase Pro before first customer onboarding.

Local Supabase remains the development, migration-test, RLS-test, and destructive-validation backend unless a later ADR replaces it.

Direct ORM/Drizzle access is not allowed as a casual replacement for `supabase-js`. It requires validated route contracts, service boundaries, and a documented authorization spike that either preserves RLS with transaction-local actor context or moves authorization fully into app-owned services.

The detailed execution plan lives in [`../explanation/supabase-cloud-production-scale-strategy.md`](https://github.com/gidorah/catena/blob/dev/explanation/supabase-cloud-production-scale-strategy.md).

### Consequences

- **Gained:** lower production ops burden than self-hosting the full Supabase stack; clearer staging/production separation; managed backups/observability options; faster first-customer readiness.
- **Gained:** a deliberate path away from Supabase before collaborative authorization hardens.
- **Required:** ADR-034 is superseded for production topology; deployment docs and Compose/Coolify artifacts must be updated before Cloud production cutover.
- **Required:** ADR-038's single-canonical-Compose commitment and ADR-039's Compose migrator commitment remain authoritative for local/self-hosted mode until a follow-up implementation decision scopes or supersedes them for Cloud mode.
- **Required:** unsafe service-role-backed user routes must be disabled or secured before any shared Cloud environment is used.
- **Required:** validation and service boundaries precede ORM migration.
- **Required:** first-customer readiness includes Pro production, restore drill, storage recovery posture, monitoring, quota alerts, and Cloud auth/storage/RLS smoke tests.
- **Risk:** a permanent hybrid can become worse than either a clean Supabase commitment or a clean composable Postgres stack. The exit/commit decision must happen before collaborative authorization features.

### Implementation notes

Phase 0 implementation has started. The first slice adds the Cloud-mode Compose artifact, Cloud migration workflow, seed safety, environment validation, Cloud Data API grants, disabled legacy upload route, and staging smoke lane. Production Cloud deployment is triggered automatically by `v*` SemVer tag pushes; the workflow applies protected production migrations and triggers a post-verified Coolify dashboard deploy. During Phase 0, `dev` remains the integration and staging branch, while production migration runs must target a protected production tag whose peeled commit equals `origin/main` and the staging-validated commit. See [`../explanation/ci-cd-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/ci-cd-pipeline.md) for the live workflow map.
