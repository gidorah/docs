---
title: "Add a Supabase migration"
description: "How to add a new schema migration to Catena and verify it locally before it hits production. The Supabase stack is plain SQL files applied in timestamp order — no DSL, no ORM-ma..."
---

# Add a Supabase migration

How to add a new schema migration to Catena and verify it locally before it hits production. The Supabase stack is plain SQL files applied in timestamp order — no DSL, no ORM-managed migrations.

This is a **how-to**, not a SQL tutorial. It assumes you already know what schema change you want to make.

- It does not cover seed-data changes — that's `supabase/seed.sql` and `npm run db:seed`.
- It does not cover manually pushing Supabase Cloud migrations from a developer machine. Local/self-hosted mode uses Docker and the Compose migrator; Cloud staging/production uses the protected GitHub workflow described below.
- It does not cover the canonical data model itself — for that, read the migrations `20260408000001_*` through `20260408000011_*` and the design notes in [`docs/archive/plans/`](https://github.com/gidorah/catena/blob/dev/archive/plans/).

## Naming convention

Migration filenames follow `YYYYMMDDHHMMSS_<short_description>.sql`, with the timestamp as the sort key:

```
supabase/migrations/
├── 20251111000001_create_update_timestamp_function.sql
├── 20251111000002_create_projects.sql
├── ...
└── 20260408000011_fix_check_coverage_column.sql
```

Conventions:

- **14-digit timestamp** — keeps lexicographic and chronological order aligned. The trailing digits act as a tiebreaker (`…000001`, `…000002`, `…000003`, …) so multiple migrations on the same day stay deterministic; pick the next unused suffix for that date.
- **Snake-case description**, verb-first (`create_`, `add_`, `alter_`, `fix_`, `drop_`). Past tense is fine but uncommon — the corpus uses imperatives.
- **One migration = one logical change.** Don't bundle "create projects" and "create documents" into one file unless they're a single conceptual unit (e.g. an enum + the table that uses it).

## Where to put it

Always `supabase/migrations/<timestamp>_<name>.sql`. Nothing else in the repo runs migrations, so files outside that directory are inert.

## Rules

- **Transaction-compatible by default.** The Compose migrator applies each SQL file and its `public.schema_migrations` record atomically. Do not use statements that cannot run inside a transaction, such as `CREATE INDEX CONCURRENTLY`, unless the migration path is explicitly reviewed first.
- **Idempotency-friendly where free.** `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP X IF EXISTS` cost nothing, but non-repeatable SQL is acceptable because `public.schema_migrations` tracks applied versions. Don't contort the SQL to be idempotent if it isn't naturally — `ALTER TABLE ... ADD COLUMN` will fail if forced to re-run, and that's fine; `npm run db:reset` exists for a reason.
- **Additive preferred.** Add columns / tables / policies; avoid `DROP COLUMN` and renames on tables that already have data in production. If you must, write a follow-up migration that backfills then drops, so each step is reversible.
- **Update RLS.** Every new table needs RLS enabled and policies that match the existing pattern (`created_by = auth.uid()` for owner-scoped, or join through `projects` for project-scoped). Missing RLS is a security bug, not an oversight.
- **Update pgTAP** when you change schema invariants — see "Testing" below. Tests in `supabase/tests/` are the regression net for the canonical model; merging a migration that breaks them silently is worse than the original bug.
- **Never edit a merged migration.** Once a migration has run in any shared or production database, treat it as immutable history. Mistakes get fixed in a follow-up migration with a higher timestamp.

## Workflow

Cloud note: Cloud staging and production migrations apply through `.github/workflows/cloud-migrations.yml` only — see [`../explanation/ci-cd-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/ci-cd-pipeline.md). `.github/workflows/migrations.yml` remains local validation only. The Compose migrator ([ADR-039](https://github.com/gidorah/catena/blob/dev/decisions/039-compose-migrator-service.md), [ADR-042](https://github.com/gidorah/catena/blob/dev/decisions/042-storage-bootstrap-before-app-migrator.md)) and `public.schema_migrations` apply only to local/self-hosted mode.

1. **Write the SQL** in a new `supabase/migrations/<timestamp>_<name>.sql`.
2. **Apply against local development if needed.** `npm run db:reset` wipes and re-applies all migrations through the Docker Compose migrator used by local-dev and Coolify. Use this when you need to exercise the app against Compose state. For an incremental check on the running Compose container without losing data, `npm run db:migrate` runs the same migrator.
3. **Run pgTAP against `local-test`.** Start the Supabase CLI stack, then use the canonical DB test command:
   ```bash
   npm run db:start
   npm run test:db
   ```
   `test:db` resets the Supabase CLI database with `supabase db reset --no-seed`, applies migrations from zero, and runs `supabase test db`. Seeds are skipped; pgTAP tests create transaction-scoped fixtures.
4. **Optionally run the dashboard prototype Playwright tests** if the migration touches anything user-visible and you want extra smoke coverage:
   ```bash
   npm run test:e2e:prototype
   ```
   These are informational prototype smoke checks, not the PR-safe `test:e2e` contract or a merge requirement.
5. **Commit** the migration alongside any related code changes (route handlers, types). Never ship a migration in one PR and the code that depends on it in another. In the current self-hosted Compose path, the production DB runs migrations before the new container is healthy, and the old container will hit columns it doesn't know about. In Cloud mode, `.github/workflows/cloud-migrations.yml` keeps migration apply, exact-SHA deploy, and staging smoke ordered.

## Cloud migration path

Cloud staging and production use Supabase CLI remote migration history (`supabase migration list --linked`), not the Compose `public.schema_migrations` table. Local/self-hosted Coolify and Docker Compose still record applied files in `public.schema_migrations` through the one-shot migrator service.

```bash
pnpm exec supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
pnpm exec supabase migration list --linked
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked --yes
pnpm exec supabase migration list --linked
```

Guardrails:

- Run this through `.github/workflows/cloud-migrations.yml`; do not run it ad hoc against production. Pipeline details: [`../explanation/ci-cd-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/ci-cd-pipeline.md).
- Never run `supabase db reset --linked`, `supabase/seed.sql`, or `supabase db push --include-seed` against staging or production.
- Use `--include-all` only for an explicit one-time empty-project bootstrap. The Cloud workflow refuses it for production.
- Keep staging and production project refs, DB passwords, anon keys, Coolify API credentials, and Coolify resource UUIDs in separate GitHub Environments.

## Testing checklist

Before opening a PR with a new migration:

- [ ] `npm run test:db` applies migrations from zero through the Supabase CLI `local-test` stack and passes.
- [ ] If the migration adds a table, RLS is enabled and policies exist.
- [ ] If the migration adds a column to an existing table, dependent inserts (in API routes, in `seed.sql`) handle it (default value, nullable, or explicit value).
- [ ] Consider `npm run test:e2e:prototype` for user-visible behavior, but do not treat it as the PR-safe E2E contract.

If you find yourself writing a migration that violates one of the rules above (e.g. dropping a column with production data, editing a merged migration), stop and ask — there's almost always a less-destructive path.
