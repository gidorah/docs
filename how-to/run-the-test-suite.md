---
title: "Run the test suite"
description: "This is the canonical command reference for Catena tests. Keep scripts, CI, and this document aligned whenever a suite is added or promoted."
---

# Run the test suite

This is the canonical command reference for Catena tests. Keep scripts, CI, and this document aligned whenever a suite is added or promoted.

Catena uses layered quality gates. A green command means only the contract documented for that command passed.

## Command contract

| Command                       | Meaning                                                                                                   | Current status                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test`                | Alias for the non-E2E local CI gate, `npm run ci`.                                                        | Implemented. Does not run the separate PR-safe Playwright lane.                                                                 |
| `npm run ci`                  | Non-E2E local CI gate: governance, lint, typecheck, build, parser Vitest, dashboard Vitest, and DB pgTAP. | Implemented. Requires local Supabase CLI stack for `test:db`.                                                                   |
| `npm run test:parser`         | Run `@catena/gaeb-parser` Vitest only.                                                                    | Implemented.                                                                                                                    |
| `npm run test:dashboard:unit` | Run dashboard Vitest unit/component/Route Handler tests only.                                             | Implemented.                                                                                                                    |
| `npm run test:governance`     | Enforce quarantine, skip, and fixme owner/reason/expiry/backlog metadata.                                 | Implemented. Included in `ci` and the static CI lane.                                                                           |
| `npm run test:db`             | Reset the Supabase CLI `local-test` database without seeds, then run `supabase test db`.                  | Implemented.                                                                                                                    |
| `npm run test:e2e`            | Run PR-safe Playwright E2E smoke against guarded `local-e2e`, Chromium by default.                        | Implemented. Reads current Supabase CLI local keys before Playwright starts.                                                    |
| `npm run test:dashboard:e2e`  | Alias for `test:e2e` while dashboard is the only app.                                                     | Implemented.                                                                                                                    |
| `npm run test:e2e:release`    | Run the broader release/nightly Playwright suite against guarded `local-e2e`.                             | Implemented and wired to the scheduled/manual Nightly Local E2E Gate workflow; currently includes release-tagged storage smoke. |
| `npm run test:e2e:cloud-smoke` | Run the allowlisted staging Supabase Cloud smoke suite.                                                   | Implemented for the Cloud migration workflow. Mutates staging only and requires protected staging credentials.                  |
| `npm run test:e2e:prototype`  | Run the current dashboard Playwright specs.                                                               | Implemented, non-contract prototype suite.                                                                                      |
| `npm run test:all`            | Run the full local suite, including slower checks.                                                        | Implemented. Runs `ci`, resets the local Supabase CLI target with seeds, then runs PR-safe and release/nightly E2E.             |

Do not use unimplemented placeholder commands in required CI. They exist to prevent accidental false-green runs while a contract is being built.

Parser golden updates use the package-local maintenance command `pnpm --filter @catena/gaeb-parser test:update-goldens`; it is intentionally not part of the root PR command contract.

## Which command to run

| Change                                                          | Run                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Parser package or GAEB fixture behavior                         | `npm run test:parser`                                                                 |
| Dashboard app code                                              | `npm run test:dashboard:unit && npm run lint && npm run check-types && npm run build` |
| Migrations, SQL functions, RLS, storage policies, or ingest SQL | `npm run db:start` once, then `npm run test:db`                                       |
| PR-safe browser smoke                                           | `npm run test:e2e` with the Supabase CLI local stack running on port `54321`          |
| Staging Cloud migration/deploy smoke                            | GitHub Cloud migration workflow, or `npm run test:e2e:cloud-smoke` with approved staging env |
| Current dashboard Playwright investigation                      | `npm run test:e2e:prototype`                                                          |
| Pre-PR non-E2E local gate                                       | `npm run ci`                                                                          |

Run narrower commands while iterating, then run `npm run ci` before opening a PR when your machine has the required local DB target available. Run `npm run test:e2e` separately when you need the same browser coverage as the GitHub PR smoke lane.

## CI lanes

Pull requests to `dev` run named lanes instead of one monolithic job. For the full workflow map (PR gate, Cloud staging, tag-driven production, nightly E2E), see [`../explanation/ci-cd-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/ci-cd-pipeline.md).

| Lane             | Command or action                                                                                                | Runtime budget | Required                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------- |
| `static`         | `npm run test:governance`, `npm run lint`, and `npm run check-types`                                             | 15 minutes     | Yes                                                             |
| `parser`         | `npm run test:parser`                                                                                            | 10 minutes     | Yes                                                             |
| `dashboard-unit` | `npm run test:dashboard:unit`                                                                                    | 10 minutes     | Yes                                                             |
| `db`             | `npm run test:db` against the Supabase CLI `local-test` stack                                                    | 25 minutes     | Yes                                                             |
| `build`          | `npm run build`                                                                                                  | 20 minutes     | Yes                                                             |
| `e2e-smoke`      | Build dashboard in the job, start it via Playwright `webServer`, then run `npm run test:e2e` against `local-e2e` | 35 minutes     | Informational only; not required for merge |

The Playwright smoke lane uploads `apps/dashboard/test-results/`, `apps/dashboard/playwright-report/`, and `apps/dashboard/blob-report/` when present, excluding generated auth state. Supabase-backed CI lanes run on GitHub-hosted runners with disposable local Supabase CLI stacks. Mutating smoke tests run only against the guarded `local-e2e` target.

The separate `Database Migration Contract` workflow is intentionally retained as a narrow, path-filtered optional check for migration-only review ergonomics. It duplicates the DB pgTAP validation with a 25-minute timeout, but the required branch-protection DB signal is the `db` lane in `PR Quality Gate`.

Playwright CI runs with one retry only for diagnostics and `failOnFlakyTests` enabled, so a retry-pass is a failed quality signal rather than a clean pass. CI retains failure/flaky traces, screenshots, videos, HTML reports, blob reports, and JUnit output as artifacts. These artifacts may contain local-e2e cookies, Authorization headers or access JWTs, Supabase anon keys, request/response payloads, network metadata, DOM snapshots, screenshots, and run-owned test data. Artifact access follows GitHub repository/artifact permissions, so they must be treated as private CI diagnostics. Generated auth-state files and service-role credentials are not uploaded.

## Release and nightly lane

The `Nightly Local E2E Gate` workflow is defined as a nightly schedule against the `dev` branch and can also be started manually with `workflow_dispatch` from `dev`. GitHub registers scheduled and manual workflows from the repository default branch, so nightly/manual activation requires this workflow file to exist on the default branch. Runs from other refs are skipped. It starts a disposable Supabase CLI stack, resets it from migrations and seed data, builds the dashboard, then runs:

```bash
npm run test:e2e:release
```

This lane is broader than PR smoke but still guarded to `local-e2e`. It retains Playwright test results, HTML/blob/JUnit reports, traces, screenshots, and videos for 14 days while excluding generated auth state. Retained artifacts are private diagnostics and may contain local-e2e session tokens, request payloads, or run data.

The PR Quality Gate only runs repository code for same-repository PRs and trusted pushes. Fork PRs fail the explicit `fork-pr-guard` lane and need maintainer handling before they can receive the same green-PR signal.

## Green PR

A green GitHub PR means the required PR gate passed for the current phase:

- lint;
- typecheck;
- build;
- parser Vitest;
- dashboard Vitest;
- DB pgTAP through `supabase test db` after a clean migration reset;
- no required lane is skipped.

The PR-safe Chromium Playwright smoke lane currently runs as informational CI only; it is not required for merge. When promoted to required, a green GitHub PR will also require that lane to pass against `local-e2e`. Broader browser/device coverage remains a release or nightly concern.

`npm run ci` is the non-E2E local CI gate. Run `npm run test:e2e` separately when you need the current PR-safe browser smoke signal locally.

The current dashboard Playwright specs are prototype smoke checks. They are useful for investigation, but they are not the PR-safe `test:e2e` contract and must not be treated as proof that product journeys are correct.

## Green release

A green local release/nightly run means the guarded `local-e2e` release command passed on a disposable Supabase CLI stack with flaky retry-passes treated as failures.

The full green release target remains stricter: the PR gate must pass and release validation must pass against a controlled staging or production-like target.

Cloud Phase 0 adds an allowlisted staging smoke wrapper through `npm run test:e2e:cloud-smoke`. It is intended to run from the protected Cloud migration workflow after staging migrations and dashboard deploy complete. Do not run it against production.

### Staging Cloud smoke guards

`npm run test:e2e:cloud-smoke` sets `CATENA_E2E_SUITE=cloud-smoke` and refuses to start unless every guard in `apps/dashboard/__tests__/global-setup.ts` and `apps/dashboard/__tests__/e2e/helpers/environment.ts` passes. Mirror the Cloud migration workflow env block when reproducing locally; secret values belong in GitHub Environments or your local shell, not in docs.

Required suite and target:

| Variable | Required value | Role |
| -------- | -------------- | ---- |
| `CATENA_E2E_SUITE` | `cloud-smoke` | Selects the guarded Cloud smoke contract (set by the npm script). |
| `CATENA_E2E_TARGET` | `staging-cloud` | Allowlists the staging Cloud target only. |

Required staging identity and deploy alignment:

| Variable | Role |
| -------- | ---- |
| `CATENA_DEPLOY_ENV` | Must be `staging`. |
| `CATENA_DEPLOY_SHA` | Must match the deployed dashboard commit; global setup reads `/api/health/version` before tests start. |
| `BASE_URL` | Must be `https://dashboard.staging.catena.onur.sh` (hardcoded in smoke guards; same value the workflow passes to Playwright). |
| `CATENA_STAGING_SUPABASE_PROJECT_REF` | Independent allowlist for the staging Supabase project ref. |
| `CATENA_EXPECTED_SUPABASE_PROJECT_REF` | Must equal `CATENA_STAGING_SUPABASE_PROJECT_REF` and match the project ref embedded in the Supabase URL. |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` | Must be the matching `https://<project-ref>.supabase.co` staging URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging anon key for browser and server clients. |
| `NEXT_PUBLIC_SITE_URL` / `SITE_URL` | Staging dashboard public URL (same host as `BASE_URL`). |
| `CATENA_SUPABASE_MODE` | `cloud` when exercising the Cloud dashboard runtime. |

Runner-only credentials (never pass to the dashboard container):

| Variable | Role |
| -------- | ---- |
| `CATENA_E2E_USER_EMAIL` / `CATENA_E2E_USER_PASSWORD` | Primary smoke login user. |
| `CATENA_E2E_SECOND_USER_EMAIL` / `CATENA_E2E_SECOND_USER_PASSWORD` | Secondary user for cross-user denial checks. |
| `CATENA_E2E_SERVICE_ROLE_KEY` | Setup and cleanup only inside the Playwright runner process. |

Optional workflow metadata: `CATENA_E2E_RUN_ID` for run-scoped cleanup labels in CI.

Production must never be a target for mutating tests.

The Cloud smoke suite runs the same `@smoke` Playwright specs as local PR smoke, including `project-upload-x83.spec.ts` — a real browser multipart upload against the staging dashboard and Supabase Cloud. That test uses longer timeouts when `CATENA_E2E_TARGET=staging-cloud` (45s upload response vs 10s locally). A failure here usually means deploy/env mismatch, proxy matcher regression, or the multipart parsing path — not parser unit tests alone.

## Targets

| Target       | Purpose                                                                         | Mutation policy                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `local-dev`  | Docker Compose runtime for day-to-day development.                              | Mutable developer state. Not a dependable test target.                                                                               |
| `local-test` | Disposable local DB for `test:db` and contract tests.                           | Fully disposable. Migrations apply from zero.                                                                                        |
| `local-e2e`  | Local app plus Supabase CLI Auth, Storage, and PostgREST target for `test:e2e`. | Run-owned mutations only. Guard required. Locally, this mutates the currently running CLI stack on port `54321`; CI resets it first. |
| `staging`    | Supabase Cloud release validation target.                                       | Run-owned smoke mutations only through the guarded `staging-cloud` wrapper and protected credentials.                               |
| `prod`       | Production.                                                                     | No test mutation.                                                                                                                    |

## Parser Vitest

Run from the repo root:

```bash
npm run test:parser
pnpm --filter @catena/gaeb-parser test:watch
```

This suite owns deterministic GAEB `.x83` parsing, per-fixture corpus manifests, normalized golden output regressions, malformed-input diagnostics, and deterministic translation-provider cases. The dashboard rejects `.x84`/`.x85` uploads until matching fixtures and support exist.

Run it for changes under `packages/gaeb-parser/` and before opening a PR that touches parser behavior or ingest assumptions.

## Database pgTAP

`npm run test:db` is the canonical DB contract-test entrypoint. It targets the Supabase CLI `local-test` stack only, runs `supabase db reset --no-seed` so migrations apply from zero, then runs pgTAP through `supabase test db`.

Start the local Supabase CLI stack first. Prefer the repo script so the pinned CLI from dependencies is used when available:

```bash
npm run db:start
npm run test:db
```

Seeds are intentionally skipped for DB contract tests. Tests create their own transaction-scoped fixtures and roll them back. `local-dev` Docker Compose remains the development runtime, but it is not the DB contract-test target.

For migration changes, `test:db` already resets before testing, so run:

```bash
npm run test:db
```

The DB layer owns migrations, SQL functions, triggers, RLS behavior, storage-object policy behavior, cascade behavior, and audit invariants. It does not own browser rendering or client-side interaction.

## Dashboard Vitest

Run dashboard unit, component, and Route Handler tests with:

```bash
npm run test:dashboard:unit
pnpm --filter @catena/dashboard test:watch
```

The dashboard Vitest config has separate projects for Node-owned tests and jsdom component tests. Node tests cover pure utilities, feature flags, parser routing, and Route Handler request/response contracts with Supabase mocked at the boundary. jsdom tests are for leaf Client Components that can be asserted through stable user-visible behavior.

This lane does not own real Supabase permissions, cookies, RSC rendering, storage/RLS behavior, or full browser journeys.

## Dashboard Playwright Prototype Suite

Run the current dashboard Playwright specs with:

```bash
npm run test:e2e:prototype
pnpm --filter @catena/dashboard test:debug
pnpm --filter @catena/dashboard test:headed
pnpm --filter @catena/dashboard test:docker
```

These specs live in `apps/dashboard/__tests__/`. They are classified as prototype smoke tests until rewritten or quarantined under the E2E contract. They may contain weak assertions or optional branches, so they must not be used as a PR-safe green signal.

`x83-translation.spec.ts` requires `CATENA_FEATURE_X83_TRANSLATOR=true`.

### Prototype migration table

| Spec                               | Current status                                                                                                                                                             | Target action                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `epic-01-authentication.spec.ts`   | Login, invalid credentials, session, and logout checks still run. Optional remember-me/password-reset and shared-state-sensitive rate-limit checks are `fixme`.            | Keep critical auth/session checks, then rewrite into focused `@critical`/`@smoke` specs with isolated auth fixtures.     |
| `epic-02-dashboard-access.spec.ts` | Basic redirect, protected access, and navigation checks still run. Optional greeting/cards/notifications/empty-state/responsive/performance/broad flow checks are `fixme`. | Keep unauthenticated redirect and protected dashboard access; move cheap UI states to dashboard Vitest where useful.     |
| `epic-03-create-project.spec.ts`   | Entire spec is `fixme` because it does not yet prove durable project creation, upload persistence, parse completion, or BoQ visibility.                                    | Rewrite around run-owned project creation plus real X83 upload/ingest postconditions before it can join `test:e2e`.      |
| `x83-translation.spec.ts`          | Entire spec is `fixme` because the feature/provider path is not deterministic enough for prototype smoke.                                                                  | Keep only if provider behavior is deterministic or mocked at a stable boundary; strengthen translated output assertions. |

## PR-Safe Playwright E2E

Run the contract browser smoke with:

```bash
npm run db:start
npm run db:reset:local
npm run test:e2e
```

The suite lives in `apps/dashboard/__tests__/e2e/`. `test:e2e` is local-only: it fails fast unless the app is local and Supabase is the CLI local API on port `54321`. Reset the local CLI stack before relying on the result, because local E2E mutates the currently running stack. The command reads the current Supabase CLI anon and service-role keys, passes the service-role key only as `CATENA_E2E_SERVICE_ROLE_KEY` to the Playwright runner, and scrubs service-role env from the Next.js app server process. Worker fixtures create run-owned Auth users, write temporary auth state under the Playwright output directory, exclude generated auth state from uploaded artifacts, and clean up user-owned rows and storage objects after the worker finishes.

Current PR smoke flows:

| Flow                      | Proof                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthenticated redirect  | `/en/dashboard` lands on `/en/v1/login`.                                                                                                                                     |
| Login/logout              | UI login works in the auth spec, then logout clears the browser session.                                                                                                     |
| Project creation          | User-visible detail page appears and a matching project row exists for the worker user.                                                                                      |
| Cross-user denial         | A second run-owned user cannot open another user's project detail page or see it in their project list.                                                                      |
| Minimal X83 upload/ingest | Document row exists, storage object exists, parse status reaches the current success state, BoQ counts match the X83 manifest, and BoQ UI shows expected category/item text. |

Release/nightly Playwright uses:

```bash
npm run test:e2e:release
```

The release command currently uses the guarded local-e2e target and explicitly runs `@smoke` plus `@release` tests such as authenticated Storage API upload/read/delete smoke. The scheduled/manual Nightly Local E2E Gate runs this command nightly or on demand. This is local release smoke, not full staging release validation. Responsive coverage, extra browsers, and an allowlisted staging wrapper remain release-suite expansion items as coverage grows.

## Quarantine, Skip, And Fixme

Quarantine is temporary and explicit. A quarantined test must have an owner, reason, expiry date, and linked issue or backlog item. PR-safe Playwright config must exclude `@quarantine` by default when `test:e2e` is implemented.

Use `test.skip` or `test.fixme` only when the missing behavior or environment limitation is documented. Product behavior gaps need an owner, reason, expiry or backlog link, and CI enforcement. Do not write optional-pass branches where a missing feature still passes.

Forbidden in blocking Playwright tests: `waitForTimeout` as readiness, `networkidle` as readiness, optional-pass branches, and undocumented `force: true` clicks.

Required in blocking Playwright tests: web-first assertions, URL assertions, specific response predicates, UI-visible status changes, or bounded database polling when UI success can be misleading. PR and release Playwright CI retain failure/flaky artifacts for diagnostics while excluding generated auth state from uploaded artifacts; retained traces, screenshots, videos, and blob reports may still contain local-e2e cookies, Authorization headers or access JWTs, Supabase anon keys, request/response payloads, session data, and run data.

## ADR compliance note

Phase 1 changes preserve ADR-035 by keeping parser tests deterministic and wired through `test:parser`; ADR-036 and ADR-040 by keeping service-role credentials in CI/test process setup only; ADR-039 by keeping `test:db` as migration-chain plus pgTAP validation without changing the app/deployment migrator; and ADR-037 by not adding component tests that assert shadcn/Radix internals.

Phase 2 changes preserve ADR-035 by testing only dashboard parser routing while leaving GAEB parser semantics in `@catena/gaeb-parser`; ADR-036 by mocking Supabase at the Route Handler boundary and keeping elevated credentials out of browser/component tests; and ADR-037 by limiting component assertions to user-visible status text rather than shadcn/Radix internals.

Phase 3 changes preserve ADR-036 and ADR-040 by keeping service-role behavior inside the local database test process and never exposing elevated credentials to browser code; ADR-039 by making `test:db` validate the migration chain through Supabase CLI reset plus pgTAP while leaving the Compose migrator as the app/deployment migration path; and the data-model ADRs by adding RLS, storage policy, source identity, cascade, audit, and SQL function contract tests.

Phase 4 changes preserve ADR-035 by keeping parser behavior deterministic and reviewable through X83 manifests, normalized goldens, malformed fixtures, and an explicit `test:update-goldens` workflow. No AI, network call, or generated rewrite path is introduced into parsing or CI.

Phase 5 changes preserve ADR-036 and ADR-040 by keeping service-role setup in Node-only Playwright helpers, passing elevated credentials through the runner-only `CATENA_E2E_SERVICE_ROLE_KEY`, guarding mutating browser tests to the local-e2e Supabase CLI target, and avoiding production mutation. They preserve ADR-035 by using the parser manifest as the X83 upload/ingest postcondition source, and preserve ADR-037 by asserting user-visible labels/headings with a `data-testid` only for the hidden file input contract.

Phase 6 changes preserve ADR-036 and ADR-040 by keeping release/nightly E2E on the guarded local-e2e target, retaining private Playwright diagnostics without generated auth state or service-role credentials, and continuing to prohibit production mutation. They preserve ADR-039 by leaving `test:db` as the migration-chain plus pgTAP gate and keeping migration validation in CI. No follow-up ADR is required.
