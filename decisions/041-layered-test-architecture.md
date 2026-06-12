---
title: "ADR-041: Layered Test Architecture and Quality Gates"
description: "Catena's current tests do not provide a dependable green signal. The root"
status: Accepted
date: 2026-05-16
implementation: partial
---


## ADR-041: Layered Test Architecture and Quality Gates

### Context

Catena's current tests do not provide a dependable green signal. The root
`test` command only runs dashboard Playwright tests, skipping parser Vitest and
database pgTAP tests. Dashboard E2E tests contain weak assertions, optional-pass
branches, hardcoded localhost URLs, sleeps, and shared-data flake risks. The
parser suite is valuable but needs a stronger fixture manifest/golden-output
strategy. Database tests cover selected invariants but do not yet prove RLS,
Storage policy, function, cascade, or audit contracts.

ADR-035 makes deterministic parser regression tests meaningful. ADR-040 keeps
local Supabase as the development, migration-test, RLS-test, and
destructive-validation backend while staging and production move toward
Supabase Cloud. The quality system must reflect those boundaries before more
tests are added.

### Decision

Catena will use a layered test architecture instead of a Playwright-heavy suite.
Static gates own TypeScript, lint, build, database lint, and migration rebuilds.
Dashboard Vitest owns pure utilities, validation, small Client Components, and
Route Handler request/response behavior with mocked Supabase boundaries. Parser
Vitest owns deterministic GAEB corpus, malformed-input, and golden-output
regressions. pgTAP owns migrations, SQL functions, triggers, RLS, Storage-object
policies, cascade, and audit invariants. Playwright owns a small set of critical
browser journeys.

The approved command contract is `test:parser`, `test:dashboard:unit`,
`test:e2e`, optional `test:dashboard:e2e`, `test:e2e:release`, `test:db`,
`test:all`, and `ci`. Root `test` is an alias for `ci`. `ci` is the local PR
gate: lint, typecheck, build, parser Vitest, dashboard Vitest, and DB pgTAP
through the Supabase CLI `local-test` runner. `test:e2e:release` is a
release/nightly browser command, not part of the root PR gate. Unimplemented
contract commands must fail clearly instead of passing as placeholders.

Testing targets are separated as `local-dev`, `local-test`, `local-e2e`,
`staging`, and `prod`. `local-dev` is mutable Docker Compose development state,
not a dependable test target. `local-test` is disposable and used for `test:db`.
`local-e2e` is disposable app plus Supabase Auth/Storage/PostgREST state used by
`test:e2e`. Staging is future Supabase Cloud release validation. Production is
never a target for mutating tests.

`test:db` uses disposable reset/apply-migrations/pgTAP validation with
`supabase db reset --no-seed` followed by `supabase test db`. It does not
replace ADR-039's migrator as the app/deployment migration path. pgTAP tests
stay in `supabase/tests/`.

Mutating Playwright tests may not become blocking until `local-e2e`, environment
guards, run-owned data, worker auth fixtures, output-scoped `storageState`, and
deterministic cleanup exist. Current dashboard Playwright specs are prototype
smoke checks, not the `test:e2e` contract. Blocking E2E tests must not use
arbitrary sleeps, `networkidle` as readiness, optional-pass branches, or forced
clicks except for documented browser/tooling bugs. Quarantine, retries,
`test.skip`, and `test.fixme` require owner, reason, expiry or backlog link, and
CI enforcement.

A green local PR check means the current `ci` command passed against the
documented local targets. A green GitHub PR means the required CI lanes passed
and no required lane is skipped, including the separate PR-safe Playwright smoke
lane once enabled. A green local release/nightly run means the guarded
`local-e2e` release command passed with flaky retry-passes treated as failures. A
full green release means the PR gate plus release Playwright validation passed
against a controlled staging or production-like target with retained artifacts.

### Consequences

- **Gained:** clearer ownership for each test layer and fewer false-green runs.
- **Gained:** parser and database correctness fail before browser tests.
- **Gained:** local development, tests, staging, and production have clear targets.
- **Required:** scripts, CI, and `docs/how-to/run-the-test-suite.md` must align.
- **Required:** weak Playwright tests must be rewritten, moved, quarantined, or deleted.
- **Risk:** infrastructure lands before coverage grows; trust comes first.

### Implementation notes

Phase 0 implemented command semantics, docs, CI vocabulary, and informational prototype Playwright. Phase 2 introduced dashboard Vitest as a required CI lane. Phase 3 standardized `test:db` on the Supabase CLI `local-test` runner and expanded pgTAP coverage for RLS, Storage policy shape and behavior, functions, cascade, source identity, and audit invariants. Phase 4 added parser manifests, normalized goldens, malformed fixtures, and an explicit golden update workflow. Phase 5 introduced guarded local-e2e Playwright smoke with run-owned data and cross-user project permission denial. Phase 6 made Playwright retry-passes fail CI through `failOnFlakyTests`, retained failure/flaky artifacts, and added the scheduled/manual Nightly Local E2E Gate for broader guarded local-e2e coverage. Cloud Phase 0 added `test:e2e:cloud-smoke` as the allowlisted staging release validation lane, wired through `.github/workflows/cloud-migrations.yml` after staging migration apply and Coolify deploy. Remaining: responsive coverage and extra browser expansion beyond the current Chromium contract.
