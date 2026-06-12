---
title: "ADR-039: Compose Migrator Service for App Migrations"
description: "Coolify deployments were not applying new `supabase/migrations/*.sql` files after the first database volume initialization. The existing `scripts/run-migrations.sh` path only ra..."
status: Accepted
date: 2026-05-05
implementation: shipped
implemented-in: docker-compose.yml + docker/migrations/
---


## ADR-039: Compose Migrator Service for App Migrations

### Context

Coolify deployments were not applying new `supabase/migrations/*.sql` files after the first database volume initialization. The existing `scripts/run-migrations.sh` path only ran in local package scripts and looked for the fixed local container name `catena-supabase-db`; Coolify names containers dynamically, for example `db-<resource-id>-<deployment-id>`, so that script is not a deploy-grade mechanism.

Postgres init scripts under `/docker-entrypoint-initdb.d/` are also first-run only. They are useful for bootstrapping an empty volume, but they do not apply later application migrations on redeploy. This caused production schema drift until the Coolify DB was manually recovered and backfilled into `public.schema_migrations` on 2026-05-04.

Coolify has pre/post deployment commands as platform settings, but the Docker Compose docs describe the Compose file as the source of truth and explicitly mention one-time migration services. For this repository, migrations must be versioned in git and deployable through the canonical Compose file from ADR-038, without requiring UI-only settings, manual SSH, host Docker container-name discovery, or runtime bind mounts of repo files.

### Decision

Application migrations are run by a dedicated one-shot Compose service named `migrator`.

The migrator image bakes in the migration runner from `docker/migrations/` and `supabase/migrations/` at build time. It connects to the database over the Compose network using the stable service DNS name `db`, waits for database readiness, acquires a Postgres advisory lock, and uses the existing `public.schema_migrations` table as the migration history source of truth.

The migrator is the only application-migration path. The Postgres first-init script must stop applying `supabase/migrations`, and local package scripts must stop running a separate host-side migration script after `docker compose up`. Manual migration commands, if retained, should invoke the same migrator path rather than duplicate migration logic.

Each migration file is applied in sorted order. The SQL file and its `public.schema_migrations` insert are committed atomically in one transaction. A failed migration exits non-zero and is not recorded. Schema-dependent services, at minimum `rest` and `dashboard`, depend on `migrator` with `condition: service_completed_successfully`. The migrator has `restart: "no"` and no exposed ports or domain, so its successful exited state is expected.

### Consequences

- **Gained:** migrations are part of the Compose deployment graph and no longer depend on dynamic Coolify container names or manual SSH.
- **Gained:** fresh local databases, existing local databases, and Coolify databases use the same migration mechanism and the same `public.schema_migrations` history table.
- **Gained:** failed migrations block schema-dependent app startup instead of allowing the dashboard to boot against a stale schema.
- **Required discipline:** migrations must remain transaction-compatible unless explicitly reviewed; non-transactional statements such as `CREATE INDEX CONCURRENTLY` need a deliberate exception path.
- **Required validation:** Coolify dev must verify that `service_completed_successfully` behaves as expected for a successful exited migrator and for a failing migration before production rollout. Coolify's documented `exclude_from_hc: true` is not in the canonical Compose file because local Docker Compose rejects the custom key; if the Coolify UI marks the exited migrator as unhealthy, handle that as a Coolify-specific follow-up after deploy validation.
- **Required preflight:** production rollout must compare `public.schema_migrations` with the repository migration filenames and fail investigation on missing, extra, malformed, or duplicate versions before the migrator is enabled.
- **Seed impact:** removing app migrations from Postgres first-init changes fresh-volume seed ordering. Local seed behavior must be made explicit and validated after the migrator becomes authoritative.
- **Operational note:** the deployment now includes one additional service that is expected to exit after applying or skipping migrations. Docs and runbooks must describe that state as healthy.

### Implementation notes

Implemented by adding `docker/migrations/`, the `migrator` service in `docker-compose.yml`, removing the old first-init app migration path, updating package scripts, and updating Coolify/local-development migration docs. ADR-040 accepts the Supabase Cloud production topology, and `.github/workflows/cloud-migrations.yml` is the Cloud migration path for staging and production. This ADR remains authoritative for local/self-hosted mode and the current shipped self-hosted Coolify deployment. ADR-042 supersedes the service dependency detail for Supabase Storage bootstrap while preserving the one-shot Compose migrator decision.
