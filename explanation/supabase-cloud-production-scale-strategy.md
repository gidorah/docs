---
title: "Supabase Cloud Bridge With Validation, Service Boundaries, And Exit Gates"
description: "Date: 2026-05-11"
---

# Supabase Cloud Bridge With Validation, Service Boundaries, And Exit Gates

Date: 2026-05-11

Decision authority: [ADR-040](https://github.com/gidorah/catena/blob/dev/decisions/040-supabase-cloud-bridge.md).

This document answers: how Catena moves from self-hosted Supabase toward Supabase Cloud for staging/production while keeping a controlled exit path before collaborative authorization hardens.

> **Status:** accepted target with Phase 0 implementation in progress. Current production remains the Coolify/self-hosted Supabase deployment; Cloud staging/production now has a dashboard-only Compose artifact, migration/deploy workflow, and staging smoke lane pending live environment execution.

## Decision Summary

Use Supabase Cloud as a stabilizing bridge while deliberately reducing Supabase coupling before collaborative authorization becomes real.

This is not a commitment to keep Catena Supabase-locked forever. It is a controlled path that keeps MVP and first-customer risk low while preserving an exit before the expensive lock-in point: `project_members`, organizations, role-based access, project sharing, and subcontractor access.

## Core Strategy

| Horizon           | Strategy                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP               | Move staging/demo/prod-like deployments to Supabase Cloud, keep Supabase Auth/RLS/Storage initially, and stop expanding direct Supabase surface area. |
| First customer    | Upgrade production to Supabase Pro before onboarding. Focus on reliability, not a full rewrite.                                                       |
| Scaled production | Decide whether to commit to Supabase Cloud or finish migration to a composable stack before collaborative authorization lands.                        |

## Target Direction

Short term:

- Supabase Cloud for managed DB/Auth/Storage.
- Existing SQL migrations remain the schema source of truth.
- Existing RLS remains the primary authorization boundary.
- Validation and service boundaries are introduced before ORM migration.

Long-term preferred exit target if Supabase is not retained:

```text
Next.js server routes/actions
+ managed Postgres
+ Drizzle
+ app-owned service authorization
+ Better Auth or Clerk
+ S3-compatible storage such as Cloudflare R2 or AWS S3
```

## Key Repository Constraints

Catena is currently coupled to Supabase in these areas:

| Coupling                                | Severity            | Notes                                                                                                  |
| --------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| Supabase Auth                           | High                | Login, OAuth, reset flows, cookies, `auth.users`, profile triggers, and session handling depend on it. |
| RLS via `auth.uid()`                    | High                | Project isolation and audit actor checks use Supabase Auth context.                                    |
| Supabase Storage                        | Medium-high         | Bucket policies and object keys are currently user-path based.                                         |
| PostgREST / `supabase-js` DB operations | Medium              | Easier to replace than Auth/RLS/Storage, but currently scattered through routes.                       |
| Self-hosted Supabase ops                | High current burden | Current self-hosted stack has many services and known local/deploy fragility.                          |

## Phase Plan

### Phase 0A: Deployment Topology Decision

Goal: make the Cloud bridge an explicit deployment architecture change instead of only changing Supabase URLs.

Actions:

- ADR-034 has been superseded by ADR-040; update deployment docs and artifacts to match the new accepted target.
- Define the target production topology as `Coolify dashboard + Supabase Cloud backend`.
- Use the dedicated Cloud-mode deploy artifact `docker-compose.cloud.yml`, which starts only the dashboard and required app-side services, not the self-hosted Supabase stack.
- ADR-043 records the ADR-038 follow-up allowing the second Cloud-mode Compose artifact while keeping the self-hosted Compose path authoritative for local/self-hosted mode.
- Remove self-hosted Supabase services from the production deploy path unless intentionally retained.
- Keep local Supabase for development, migration tests, RLS tests, and destructive validation.
- Document Cloud-mode environment variables and how they differ from self-hosted mode.
- Verify browser and server Supabase clients target the expected Cloud project in staging and production.

Gate:

- Production deploy no longer depends on self-hosted Supabase containers unless explicitly intended.
- The Cloud-mode rendered config contains only the dashboard and required app-side services; it excludes `db`, `kong`, `auth`, `rest`, `storage`, Studio, Logflare/Vector, Supavisor, and the self-hosted Compose `migrator`.
- In Cloud production, dashboard build-time and runtime env vars use the Cloud project URL and anon key.
- In Cloud production, server-side `SUPABASE_URL` does not point at `http://kong:8000`, Docker service names, localhost, or demo infrastructure.
- Dashboard server and browser clients both target the expected Supabase Cloud project.
- Local/self-hosted mode remains available for development and tests.
- Deployment docs and ADRs no longer contradict the selected topology.

### Phase 0B: Cloud Cutover Runbook

Goal: make Cloud migration repeatable, reversible, and safe before any customer data lands.

Actions:

- Create a clean staging Cloud project and apply all migrations from zero.
- Reconcile migration history between local/self-hosted databases and Supabase Cloud.
- Use `.github/workflows/cloud-migrations.yml` for Cloud migration and staging deploy ordering. `.github/workflows/migrations.yml` remains local validation only. Workflow architecture: [`ci-cd-pipeline.md`](/explanation/ci-cd-pipeline). Release checklist: [`../how-to/work-with-prs-staging-and-releases.md`](https://github.com/gidorah/catena/blob/dev/how-to/work-with-prs-staging-and-releases.md).
- Use separate staging and production secret names for project refs, DB URLs, and access tokens. Staging and production project refs/DB URLs must not be the same.
- Add migration workflow concurrency groups so only one migration job can target staging or production at a time.
- Ensure workflow logs never print DB URLs, access tokens, anon keys, service-role keys, or secret keys.
- Confirm `supabase/seed.sql` is never applied to staging or production unless the target is explicitly disposable demo infrastructure.
- Record that all current environments are disposable and no existing DB/Auth/Storage data migration is required.
- Discard existing data intentionally instead of attempting partial preservation.
- Verify `user_profiles` trigger behavior on Cloud through fresh signup, not migrated Auth users.
- Rotate all production secrets and remove local/demo keys.
- Define write-freeze, rollback, app rollback, schema rollback, and restore procedures.

Gate:

- Clean Cloud migration, fresh auth login/signup, storage object access, and core smoke tests pass.
- Rollback path is documented before production cutover.
- Known-password seed users are absent from staging and production.
- Staging and production Supabase project refs, keys, OAuth apps, and SMTP settings are separate.
- Production releases come from `main`, not directly from `dev`: the protected production tag's peeled commit, `origin/main`, and the staging-validated SHA must be identical.
- Production dashboard deploy is triggered automatically by `v*` tag pushes through the CI/CD pipeline ([`ci-cd-pipeline.md`](/explanation/ci-cd-pipeline), [`../how-to/work-with-prs-staging-and-releases.md`](https://github.com/gidorah/catena/blob/dev/how-to/work-with-prs-staging-and-releases.md)). The workflow pins the target SHA in the Coolify resource environment, triggers the deploy, and post-verifies both the Coolify deployment commit and the live `/api/health/version` endpoint. This post-verification is the current Coolify safety boundary; the release fails if the deployed commit or live app SHA does not match the immutable release target.
- The plan explicitly records that existing local/self-hosted data is disposable and will not be migrated.

### First Implementation Milestones

Goal: keep the first implementation path small, deployable, and reversible by splitting it into independently shippable slices.

Milestones:

1. Phase 0A slice: update topology docs/artifacts, create the Cloud-mode deploy artifact proposed as `docker-compose.cloud.yml`, and record the ADR-038 follow-up.
2. Phase 0B slice: replace or repair the migration workflow with staging-first promotion, confirm seed safety, and record the disposable-environment decision.
3. Phase 0C slice: fix or disable unsafe users/admin routes, add environment validation, prove clean staging Cloud migration and smoke tests, and dry-run the production cutover runbook without customer data.

Constraint:

- Do not combine Cloud cutover, validation-contract introduction, service extraction, storage adapter, and Drizzle migration in one pull request. Each phase should land as independently deployable PRs with rollback notes.

### Phase 0C: Cloud Bridge Preparation

Goal: make Supabase Cloud viable for staging/prod-like use without changing application architecture yet.

Actions:

- Create separate Supabase Cloud projects for staging, demo if needed, and production.
- Keep Free only while there is no customer data and limits fit.
- Prove all SQL migrations apply cleanly to Cloud from a clean project and through the chosen migration workflow.
- Run migrations staging-first and promote to production only through an explicit release action. On plans with GitHub Environment required reviewers, use an explicit approval step; on private Free repositories, the `v*` tag push is the release action.
- Keep `dev` as integration/staging and `main` as the production release line. For Phase 0, release only the current `dev` head after staging validates it, fast-forward `main` to that commit, and tag that same commit for production.
- Verify storage bucket creation and storage policies.
- Configure and test auth redirect allowlists, site URL, OAuth credentials, SMTP, password reset, email confirmation, and staging/prod separation.
- Maintain a per-environment Supabase Cloud configuration checklist covering Site URL, redirect allowlist, OAuth app IDs/secrets, email confirmation mode, SMTP, rate limits, JWT/session settings, and signup policy.
- Add environment validation before production deploys, including production bans for localhost URLs and demo secrets.
- Disable or secure `/api/users` and `/api/users/[id]` before any shared Cloud environment is used.
- Audit all `supabaseAdmin` imports and document the allowed privileged operations.
- `/api/projects/upload` is disabled with `410 Gone`; `/api/projects/[id]/documents` remains the canonical Storage, metadata, parse, and ingest path. Issue #6 tracks removal or a future reviewed reintroduction.
- Keep local Supabase for migration/RLS/destructive testing until a lighter local path is available.

Gate:

- Cloud migrations work from a clean project.
- RLS tests pass against a Cloud-like environment.
- Storage policies are verified.
- Auth settings are tested end-to-end, including OAuth, password reset, email confirmation, and redirect behavior.
- Browser and server Supabase clients use compatible cookie settings in Cloud mode.
- Auth cookies are environment-isolated across local, staging, demo, and production domains.
- Cookie `secure`, `sameSite`, domain, and name behavior is tested for login, refresh, logout, password reset, and OAuth callback.
- Production does not use local/demo secrets.
- `/api/users` and `/api/users/[id]` are disabled, self-only, or protected by a real admin role.
- Service-role keys are never exposed to browser bundles or public environment variables.
- Production env validation rejects localhost Supabase URLs, demo keys, localhost site URLs, and local auth-cookie fallbacks.

### Phase 1: Validation And Contract Layer

Goal: make input boundaries explicit before service/ORM migration.

Actions:

- Add app-local validation modules under `apps/dashboard/src/server/validation/` and `apps/dashboard/src/server/contracts/`.
- Use existing `zod` dependency.
- Validate route params, query params, JSON bodies, FormData, files, and environment variables.
- Share schemas between forms and APIs where practical.
- Add focused contract tests separate from Playwright flows.
- Introduce dashboard contract tests for pure validation schemas and stable error-shape contracts using Vitest or an equivalent non-E2E runner.
- Update `docs/how-to/run-the-test-suite.md` and `docs/explanation/testing-philosophy.md` when the contract test suite is introduced.
- Split environment validation into build-safe public env, runtime server env, and production-only safety checks.
- Keep database constraints and RLS as the final guardrail, not the only validation layer.

Recommended modules:

| Module                              | Purpose                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `src/server/env.ts`                 | Runtime environment validation.                          |
| `src/server/validation/`            | Shared parse helpers and validation error formatting.    |
| `src/server/contracts/projects.ts`  | Project route params, query, create, and update schemas. |
| `src/server/contracts/documents.ts` | Upload and document metadata schemas.                    |
| `src/server/contracts/users.ts`     | User profile schemas.                                    |
| `src/server/contracts/auth.ts`      | Server-side auth FormData schemas.                       |

Validation requirements:

| Boundary      | Validation                                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route params  | UUID validation for project/user/document/category IDs.                                                                                                                                                          |
| Query params  | Enum validation for status, bounded search length, normalized empty strings, and escaping or rejection of PostgREST filter syntax before `.or(...)`.                                                             |
| JSON bodies   | Required fields, enum values, trimmed strings, nullable versus optional semantics, date coercion, invalid JSON handling, and explicit unknown-field behavior.                                                    |
| FormData      | File presence, `File` instance checks, exact file-count rules, and auth email/password validation.                                                                                                               |
| Files         | `Content-Length` and max total request-size guards before buffering, max per-file size, max count, supported extension, sanitized filename nonempty, filename/path length limits, and future XML content checks. |
| Parser output | DTO validation before calling SQL RPC, including nonempty IDs, finite quantities, nullable semantics, max text lengths, max counts, and category/item reference expectations.                                    |
| Services      | Actor context present, project ownership checked, structure unlocked where relevant.                                                                                                                             |
| Env           | Required URLs/keys, valid site URL, no local/demo secrets in production, no public service-role exposure, redirect URL sanity, and feature flags parsed.                                                         |

Gate:

- No route moves to Drizzle until its params, query, and body are validated by shared schemas.
- Service functions do not accept raw `Request`, raw `FormData`, or `any` request payloads.
- Invalid payloads return stable `{ error, errorKey }` responses.
- Invalid UUID route params return `400` before any database query.
- Invalid JSON returns `400`, not `500`.
- Search inputs are safely escaped or rejected before PostgREST filter construction.
- New or changed `errorKey` values have locale entries in both `en` and `de`.

### Phase 2: Service Boundaries

Goal: stop route handlers from owning business logic and provider-specific details.

Actions:

- Add server-only service modules while still using Supabase underneath.
- Route handlers authenticate, validate, then call services.
- Services receive explicit actor context such as `{ userId }`.
- Keep Supabase RLS as the primary authorization boundary during this phase.

Likely modules:

| Module                                        | Purpose                                                |
| --------------------------------------------- | ------------------------------------------------------ |
| `src/server/auth/require-user.ts`             | Resolve authenticated actor.                           |
| `src/server/projects/project-service.ts`      | Project use cases.                                     |
| `src/server/projects/project-repository.ts`   | Project persistence abstraction.                       |
| `src/server/documents/document-service.ts`    | Document use cases.                                    |
| `src/server/documents/document-repository.ts` | Document persistence abstraction.                      |
| `src/server/ingest/ingest-service.ts`         | GAEB parse and SQL ingest boundary.                    |
| `src/server/storage/document-storage.ts`      | Storage adapter interface and Supabase implementation. |

Gate:

- New route logic calls services instead of direct `.from()`, `.rpc()`, or `.storage` calls.
- `supabaseAdmin` is import-allowlisted, marked server-only, covered by static checks where practical, and only used for explicit privileged operations.
- `src/lib/supabase/admin.ts` imports `server-only` before service-role usage expands.
- ESLint or an equivalent static check forbids importing `@/lib/supabase/admin` from Client Components and non-allowlisted modules.
- Any service-role operation names its privilege reason and has authorization tests.
- User-scoped services never silently bypass RLS.

### Phase 3: First Customer Production Hardening

Goal: onboard first customer on reliable managed infrastructure without doing a risky rewrite during onboarding.

Actions:

- Upgrade production to Supabase Pro before customer data lands.
- Keep staging and production separate.
- Decide whether staging also needs Pro based on always-on and upload-size needs.
- Configure custom SMTP and production OAuth credentials.
- Define RPO/RTO, select backup/PITR configuration, and perform a restore drill.
- Backup/restore drill covers both Postgres and Supabase Storage objects. Restored `project_documents.file_path` rows must point to existing restored objects, and restored files must download successfully.
- If Storage object backup is not automated, first-customer onboarding is blocked or the accepted RPO/data-loss risk is explicitly signed off.
- Add quota, usage, and spend alerts for DB size, storage, egress, auth email usage, and project spend.
- Document warn/page/stop-onboarding thresholds and response actions for DB size, storage, egress, auth email usage, and paid add-ons such as PITR.
- Add error monitoring, uptime monitoring, alert routing, and production smoke tests.
- Add incident runbooks for auth failure, upload failure, parse failure, migration failure, storage quota, and restore.
- Configure production access controls for Supabase Dashboard, customer file access, service-role key handling, and emergency access.
- Confirm Supabase project region, DPA/commercial terms, and customer data-residency requirements before customer data lands.
- Complete the `/api/projects/upload` lifecycle decision before customer data lands.

First customer checklist:

- Production is Supabase Pro, not Free.
- Production and staging have separate credentials.
- Migrations are tested against staging before production.
- No manual schema edits in Supabase Dashboard.
- Auth redirects, password reset, email confirmation, and OAuth are tested.
- Realistic document uploads are tested against selected plan limits.
- RLS isolation and storage policies are tested.
- Backup restore procedure is tested at least once.
- PITR decision is explicit.
- Login, project creation, upload, parse/ingest, storage cleanup, and unauthorized access smoke tests pass.
- Error monitoring and uptime monitoring alert a real operator.
- Billing/quota alerts are configured.
- Customer-facing UI clearly shows `success`, `failed`, `partial`, and `not_applicable` parse states, with retry or re-upload guidance.
- Document list/detail UI and API responses expose parse status and user guidance; failed/partial states do not look like successful ingestion.
- `/api/projects/upload` remains disabled unless a later reviewed lifecycle decision reintroduces it.

Gate:

- First customer is not onboarded on Supabase Free production.
- Backend rewrite is not performed during onboarding unless required by the customer.
- Restore drill, staging Cloud RLS/storage isolation tests, and production smoke tests pass before customer data lands.
- `/api/projects/upload` cannot create unbounded orphaned Cloud Storage objects because it returns before auth, Supabase client creation, parsing, or Storage calls.

### Phase 4: Storage Adapter And Storage Decoupling

Goal: prevent storage authorization from remaining tied to Supabase path conventions.

Actions:

- Add a `DocumentStorage` adapter.
- Initially back it with Supabase Storage.
- Move path generation, upload, delete, and signed URL behavior behind the adapter.
- Keep Postgres document metadata as the source of truth.
- Avoid new business rules that depend on object path semantics.
- Implement the Phase 0C/Phase 3 `/api/projects/upload` lifecycle decision inside the storage boundary.

Important constraint:

- Current storage authorization is user-path based, e.g. object path starts with `user_id/`. Current policies use first-path-segment checks such as `split_part(name, '/', 1)` rather than project-table membership.
- Storage policies are separate from table RLS and must be tested separately.
- This will not survive project sharing, project transfer, organizations, or subcontractor access cleanly.

Gate:

- No direct `supabase.storage.from(...).upload/remove` in route handlers.
- Storage access model is redesigned before `project_members` or external access.
- Same-user and cross-user storage behavior is tested for upload, read/download, update/replace, and delete.

### Phase 4A: Drizzle Authorization Spike

Goal: decide whether direct DB access preserves RLS or moves authorization fully into app services before any route ships on Drizzle.

Choose exactly one execution model:

| Model                    | Requirements                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS-preserving direct DB | Use a dedicated non-owner, non-service-role DB role. Set actor identity transaction-locally for every request, e.g. via `SET LOCAL request.jwt.claim.sub = <userId>` or an equivalent reviewed mechanism compatible with `auth.uid()`. Use transaction-scoped settings only; never session-scoped settings that can leak through pooling. Add tests proving `auth.uid()` is populated for the Drizzle path and resets between requests/users. |
| App-owned authorization  | Do not rely on existing `auth.uid()` RLS policies for migrated routes. Implement explicit service-layer ownership/membership checks before every repository query. Add equivalent cross-user denial tests before moving any route.                                                                                                                                                                                                            |

Gate:

- The selected model is documented before Phase 5 implementation.
- Pooling and transaction-boundary behavior is tested.
- User-scoped repositories cannot use privileged credentials.
- Cross-user denial tests cover the actual Drizzle repository path.

### Phase 5: ORM Migration Behind Repositories

Goal: reduce PostgREST/`supabase-js` database coupling without losing authorization safety.

Actions:

- Add Drizzle only behind repositories.
- Do not introduce Drizzle directly into route handlers.
- Add Drizzle dependencies, schema mapping strategy, direct DB URL env validation, connection/pooler decision, and migration ownership decision before moving routes.
- Complete the Drizzle authorization spike before adding route-facing Drizzle repositories.
- Start with read-only, low-risk routes.
- Keep Supabase Auth as the session source.
- Pass `userId` explicitly into repositories/services.
- Preserve existing SQL functions for transaction-critical operations.

Suggested order:

1. `GET /api/projects`
2. `GET /api/projects/[id]`
3. `GET /api/projects/[id]/documents`
4. `GET /api/projects/[id]/categories`
5. `POST /api/projects`
6. `PATCH /api/projects/[id]`
7. Destructive and storage-coupled flows
8. Upload and ingest routes
9. Users/admin routes separately
10. Auth last

Authorization rule:

| Path                   | Rule                                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase/RLS path      | User-bound Supabase client may rely on RLS.                                                                                                                                                                          |
| Drizzle/direct DB path | Repositories must use a non-bypass app DB role with RLS preserved, or must pass through a reviewed app-owned authorization layer. Service-role, owner, or superuser credentials are forbidden for user-scoped paths. |

Gate:

- A Drizzle route cannot ship until the selected direct-DB authorization model is implemented, tested under pooling, and documented.
- Every migrated route has equivalent or stricter authorization tests.
- Drizzle does not receive unvalidated request data.
- Direct DB credentials do not accidentally bypass user-scoped authorization.
- The DB role used by Drizzle is documented and tested for RLS behavior.
- Cross-user denial tests run against the actual repository path, not only Supabase/PostgREST paths.
- Supabase SQL migrations remain the schema source of truth unless a later ADR changes migration ownership.
- Connecting as `postgres`, table owner, service-role-equivalent, or any `BYPASSRLS` role is forbidden for user-scoped paths.
- `ingest_boq_and_bootstrap` remains the atomic ingest boundary.

### Phase 6: Final Backend Decision Before Collaboration

Goal: make the Supabase stay/exit decision before authorization complexity expands.

Decision must happen before:

- `project_members`
- organizations
- role-based access
- shared projects
- project transfer
- subcontractor portal
- external recipient identity
- customer-specific audit requirements

Options:

| Option             | Meaning                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Commit to Supabase | Keep Supabase Auth/RLS/Storage as the core backend platform.                              |
| Exit Supabase      | Move to managed Postgres + Drizzle + app-owned authorization + Better Auth/Clerk + S3/R2. |
| Continue hybrid    | Only acceptable with explicit gates and short timeline; risky if permanent.               |

Gate:

- No collaborative authorization feature is built until the final authorization model is chosen.
- If exiting Supabase Auth, introduce an internal `Actor`/`User` identity model and decide whether existing `auth.users.id` values remain permanent before `project_members` or organizations.

Decision inputs:

- Supabase cost, add-ons, and projected customer growth.
- Customer compliance, region, DPA, audit, and deployment requirements.
- Engineering capacity to own auth, authorization, storage, and backups.
- Storage access model needed for sharing and external users.
- Whether RLS remains DB-owned or authorization moves fully into app services.

### Phase 7: Auth Decoupling If Exiting Supabase

Goal: replace the deepest Supabase coupling last.

Actions:

- Choose Better Auth or Clerk.
- Map provider identity to an internal `Actor` model.
- Decide whether current `auth.users.id` UUIDs remain permanent user IDs.
- Replace profile triggers, seeds, tests, auth callbacks, password reset, OAuth, cookies, and middleware/proxy logic.
- Rewrite or remove `auth.uid()`-based RLS depending on chosen authorization model.

Gate:

- Auth migration is treated as a security rewrite, not a refactor.
- Cross-user/project access denial tests pass before production cutover.

## Validation Layer Details

### Current Gaps

| Area           | Current State                            | Gap                                                                                |
| -------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| UI forms       | Zod exists in components.                | Schemas are component-local, not shared with APIs.                                 |
| API bodies     | Manual validation exists in some routes. | Weak type/value validation and inconsistent errors.                                |
| Params         | IDs are used directly.                   | No UUID validation before DB queries.                                              |
| Query params   | Status is cast.                          | Invalid status values can reach query construction.                                |
| Files          | Central `validateFile` exists.           | No total-size, max-count, filename length, content sniffing.                       |
| Parser output  | Parser throws on malformed XML.          | Parsed DTO is not validated before SQL RPC.                                        |
| DB             | Strong RLS/enums/FKs.                    | Some simple checks can be hardened, such as nonblank names and positive file size. |
| Env            | Uses non-null assertions and fallbacks.  | No fail-fast production validation.                                                |
| Error contract | Documented convention exists.            | Some routes do not consistently include `errorKey`.                                |

### Recommended DB Hardening Before First Customer Where Cheap

Candidates for migration-level constraints after route validation is stable and before customer data where feasible:

- Nonblank `projects.name`.
- Positive `project_documents.file_size`.
- Unique `project_documents.file_path`.
- Future constraints for project membership and role state once designed.

## Implementation Order

Recommended remaining implementation sequence:

1. Prove clean staging Cloud migration, post-verified branch deploy, live SHA check, and Cloud smoke tests; production releases use `v*` SemVer tags with post-verified Coolify deploy.
2. Confirm `supabase/seed.sql` is never applied to non-disposable Cloud environments.
3. Record all current environments as disposable and no existing data migration required.
4. Fix or disable unsafe users/admin routes before connecting any shared Cloud dashboard.
5. Add broader fail-fast environment validation with build/runtime separation.
6. Add project route schemas and validation helpers.
7. Refactor `/api/projects` and `/api/projects/[id]` to use shared contracts.
8. Add document/file contracts and upload size guards.
9. Extract document service boundaries while still using Supabase internally.
10. Introduce `DocumentStorage` inside the document service boundary, backed by Supabase Storage.
11. Complete the Drizzle authorization spike.
12. Add Drizzle prerequisites and read paths behind repositories only if still justified.
13. Migrate simple writes.
14. Migrate storage/destructive flows later.
15. Decide final Supabase stay/exit before collaborative authorization.

Before first customer:

1. Upgrade production to Supabase Pro.
2. Complete restore drill, including Storage object recovery.
3. Configure monitoring, uptime checks, and quota/spend alerts.
4. Confirm region, DPA/commercial terms, and data-residency expectations.
5. Pass staging Cloud auth, RLS, storage, upload, parse, ingest, and unauthorized-access smoke tests.

## Test Strategy

Validation tests:

- Invalid UUID route params return 400 before any DB query.
- Route handlers parse params before constructing Supabase or repository queries, verified by contract tests, static checks, or code review.
- Invalid project status query returns 400.
- Invalid JSON returns 400.
- Empty or whitespace-only project name returns 400.
- Invalid PATCH body returns 400.
- Unknown PATCH fields are rejected or ignored according to explicit contract.
- Search inputs are length-bounded and escaped or rejected before PostgREST `.or(...)` construction.
- Missing file returns 400.
- Non-`File` `formData.get("file")` values return 400.
- Unsupported file extension returns 400.
- Empty file returns 400.
- Oversized file returns 400.
- Oversized multipart requests are rejected before buffering.
- Upload routes check `Content-Length` against a configured max request size before calling `arrayBuffer()` or `formData()`; test with an oversized `Content-Length` header without sending a huge body.
- Sanitized filename basename cannot be empty and path length is bounded.
- Malformed GAEB XML produces parse failure state without losing the document row.
- Parser DTO validation failure sets `parse_status = 'failed'` without losing the document row.

Authorization tests:

- Anonymous requests return 401.
- User A cannot read/update/delete User B's project.
- User A cannot access User B's project documents.
- Storage access follows the documented model.
- Service-role/admin paths are explicitly tested or disabled.
- `/api/users` and `/api/users/[id]` are disabled, self-only, or admin-role protected.
- Storage policy tests cover same-user upload/read/update/delete, cross-user denial, flat-name denial, and wrong-prefix denial.
- Drizzle repository authorization tests prove cross-user denial before each migrated route ships.

Migration tests:

- Local pgTAP tests pass against a reset local Supabase stack.
- A clean Supabase Cloud project can apply all migrations from zero without seeds.
- Migration history reconciliation is documented before Cloud production migration.
- pgTAP RLS and ingest tests pass.
- Storage bucket existence, privacy, and policies are verified against staging Cloud.
- Staging Cloud smoke tests verify auth login, profile trigger creation, RLS isolation through the app/API path, and storage upload/read/delete behavior.
- Destructive pgTAP-style tests are not run against production.
- Auth signup creates `user_profiles` through the Cloud trigger.
- Backup restore drill succeeds against a non-production Cloud project before first customer and includes restored Storage object download checks.
- Existing Playwright auth/project/upload flows pass.
- GAEB parser corpus tests pass when touching ingest/parser behavior.

Operational tests:

- Error monitoring captures an intentional server error in staging.
- Uptime monitoring alerts a real recipient.
- Billing/quota alerts are configured.
- Production env validation rejects localhost/demo config.
- Upload, parse, ingest, cleanup, and unauthorized-access smoke tests pass against staging and production.

## Decision Triggers

Revisit the backend strategy when any of these happen:

- First paying customer is ready to onboard.
- Project sharing or `project_members` becomes next work.
- Storage authorization must become project/org based.
- Supabase cost, limits, retention, performance, or compliance becomes material.
- A customer requires private/on-prem deployment that Supabase Cloud cannot satisfy.
- RLS/PostgREST boundaries repeatedly slow product delivery.
- Direct DB/ORM migration reaches auth-sensitive flows.

## Final Recommendation

Adopt this plan with the following name and constraint:

```text
Supabase Cloud Bridge With Validation, Service Boundaries, And Exit Gates
```

The strategy is acceptable only if the bridge is managed deliberately. The danger is not Supabase Cloud itself. The danger is drifting into a permanent half-decoupled architecture where validation, authorization, RLS, app services, and storage paths each enforce different parts of the model.

The near-term priority is:

1. Stabilize deployment on Supabase Cloud.
2. Add validation and service boundaries.
3. Upgrade production before first customer.
4. Continue decoupling in small safe increments.
5. Decide final Supabase stay/exit before collaborative authorization hardens.
