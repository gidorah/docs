---
title: "Document Ingest Pipeline"
description: "What happens end-to-end when a user uploads a GAEB tender file, and **why the transaction boundary lives in SQL** rather than in the API route."
---

# Document Ingest Pipeline

What happens end-to-end when a user uploads a GAEB tender file, and **why the transaction boundary lives in SQL** rather than in the API route.

For the runtime picture in context, see [`architecture.md`](/explanation/architecture). For the data layers this pipeline writes into, see [`data-model.md`](/explanation/data-model).

## Upload route

`POST /api/projects/[id]/documents` is the only active document upload and ingest endpoint.

| Route                               | What it does                                                                                                                               | When to call it                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `POST /api/projects/[id]/documents` | Storage upload **+** `project_documents` row insert **+** GAEB parse **+** atomic ingest into source/canonical layers. The full pipeline.  | After a project exists. This is the path users hit from the project page's "upload document" button.            |
| `POST /api/projects/upload`         | Disabled. Returns `410 Gone` with `errorKey: "projects_upload_disabled"` before auth, Supabase client creation, parsing, or Storage calls. | Do not call it. Issue #6 tracks whether this legacy route is removed or reintroduced with a reviewed lifecycle. |

The rest of this page is about the project-scoped route. Code lives at `apps/dashboard/src/app/api/projects/[id]/documents/route.ts`.

## End-to-end flow

```
Browser                 Dashboard route                    Postgres
   │                          │                               │
   │ POST .x83 (multipart) ──▶│                               │
   │                          │ 1. authenticateAndVerify…()   │
   │                          │    auth.getUser()             │
   │                          │    SELECT projects WHERE      │
   │                          │      created_by = auth.uid()  │
   │                          │    → 401 / 404 short-circuits │
   │                          │                               │
   │                          │ 2. arrayBuffer() + bounded    │
   │                          │    multipart file extraction  │
   │                          │    (Coolify/Traefik fix)      │
   │                          │                               │
   │                          │ 3. validateFile(file)         │
   │                          │    (extension + size)         │
   │                          │                               │
   │                          │ 4. storage.upload(            │
   │                          │      "<user_id>/<ts>_<name>") │
   │                          │    → 500 short-circuits       │
   │                          │                               │
   │                          │ 5. insert project_documents   │
   │                          │    on failure: storage.remove │
   │                          │    → 500 short-circuits       │
   │                          │                               │
   │                          │ 6. parseGaebXml(text)         │
   │                          │    (in-process, pure TS)      │
   │                          │    on throw: UPDATE           │
   │                          │      parse_status='failed',   │
   │                          │      do NOT 500               │
   │                          │                               │
   │                          │ 7. rpc ingest_boq_and_        │
   │                          │       bootstrap(...)  ───────▶│  ┌─ BEGIN
   │                          │                               │  ├─ idempotency check
   │                          │                               │  ├─ INSERT boq_categories
   │                          │                               │  ├─ if no valid items:
   │                          │                               │  │     parse_status='partial'
   │                          │                               │  │     RETURN (skip bootstrap)
   │                          │                               │  ├─ orphan rate ≤ 50% ?
   │                          │                               │  ├─ INSERT boq_items
   │                          │                               │  ├─ parse_status='success'
   │                          │                               │  ├─ bootstrap_canonical_…
   │                          │                               │  └─ COMMIT  (or ROLLBACK)
   │                          │                               │
   │                          │    on RPC error: UPDATE       │
   │                          │      parse_status='failed',   │
   │                          │      do NOT 500               │
   │                          │                               │
   │ 201 Created  ◀───────────│ 8. return document JSON       │
```

Steps 6 and 7 are deliberately wrapped in `try/catch` and treated as **non-fatal**: the document record exists either way, and `parse_status` distinguishes whether the BoQ data is queryable. This matters because two classes of files take this path without ever reaching the parser:

- **Non-GAEB files** (PDFs, DWGs, .docx). They pass `validateFile` but skip steps 6–7.
- **GAEB-adjacent extensions** that the parser doesn't actually handle (`.x84`, `.x85`, `.p83`, `.d83`, `.p93`, etc.). `file-validation.ts` rejects them today. This is a deliberate scope choice: `.x83` is the only accepted GAEB upload until fixture-backed support exists for other phases.

For both, the `project_documents` row is created with `parse_status` left at its column default — `'not_applicable'`, defined in migration `20260403000003_document_parse_status.sql`. That status is distinct from `'failed'`: it means "we never tried to parse," not "we tried and it broke."

## Why the transaction lives in SQL

Earlier iterations orchestrated this in the API layer with multiple Supabase REST calls (insert categories, insert items, update parse_status, bootstrap). Three things broke:

1. **Partial state on failure.** If the items insert failed after categories succeeded, the document was left with categories but no items. There was no clean way to undo the categories from the API layer (PostgREST can't reach across calls in a transaction).
2. **Race against bootstrap.** The bootstrap function eagerly materializes canonical rows from source rows. If bootstrap ran before the items insert finished — or if items had to be retried — the canonical layer would be inconsistent.
3. **No way to enforce an orphan-rate threshold across multiple statements.** A check like "fail if >50% of items reference categories that don't exist" needs both insert results in scope.

Pulling the entire write into one PL/pgSQL function fixes all three: the function either commits a complete, consistent ingest or rolls back to no rows at all.

The function is `ingest_boq_and_bootstrap(p_document_id UUID, p_user_id UUID, p_categories JSONB, p_items JSONB)` and it lives in migration `supabase/migrations/20260408000010_ingest_boq_function.sql`. It returns `(parse_status TEXT, structure_id UUID)`.

### What the function guarantees

- **Idempotency, scoped to a single `document_id`.** If `boq_categories` already exist for the document, the function returns the existing `parse_status` and `structure_id` without re-inserting. Re-running the route on the same document is safe (R7.5). Two important caveats: (a) the guard keys on rows in `boq_categories` — the empty-input `'failed'` path writes no categories, so a retry of an empty-input call goes through fresh, by design; (b) idempotency is per-document, not per-file. Uploading the same `.x83` file twice creates two `project_documents` rows with different `Date.now()` storage paths, two ingests, two canonical structures. There is no content-hash dedup, intentional or otherwise — if dedup is required, it has to be added explicitly upstream.
- **Atomicity on the route success path.** Categories, items, `parse_status`, and the canonical bootstrap commit together or not at all when the dashboard upload route calls the RPC. There is no observable intermediate state for that route where a successfully-ingested document lacks its canonical counterparts. The database still permits owner-scoped direct inserts needed by the current RPC execution model, so this is a route contract, not a universal "only possible write path" invariant.
- **Bootstrap is only called on the success path.** On `partial` (categories committed, no valid items) the function returns before invoking `bootstrap_canonical_structure`. There are no canonical rows to materialize, and the absence of `document_structures` for a `partial` document is intended — but there is no recovery UI in MVP either: a `partial` document is effectively a dead end until re-uploaded.
- **Other-trigger failures during bootstrap.** Bootstrap inserts into `canonical_categories`, `canonical_items`, and `document_structure_events`. Triggers from migrations `20260408000007_mutation_invariants.sql` (mutation invariants) and `20260408000009_outbound_boundary.sql` (lock check on `is_locked = true` structures) fire during these inserts. A failure inside any of those triggers surfaces as an RPC error, the transaction rolls back, and the API layer's `try/catch` writes `parse_status = 'failed'` — indistinguishable from a parser-side rollback in the table below. Read the Postgres log for the specific exception.
- **Auth guard.** If `auth.uid()` is set and doesn't match `p_user_id`, the function raises `insufficient_privilege` and rolls back.
- **Orphan threshold.** Three distinct rules, in order. The `0.5` cutoff is hardcoded in the function (line 137 of the migration); it is not configurable per project or per file. Tuning it requires a schema migration.
  - If 0% of items reference a known category (no valid items at all), `parse_status` is set to `'partial'` and the function returns — no rollback, because the bad items are never inserted.
  - If at least one item is valid but more than 50% are orphans, `RAISE EXCEPTION 'Orphan rate exceeds 50%% threshold'` rolls back the whole transaction.
  - Below 50% (with valid items present), orphans are filtered with a `RAISE NOTICE` and logged.
- **Status-driven success.** `parse_status` is set inside the transaction:
  - `success` — at least one valid item, orphan rate ≤ 50%.
  - `partial` — categories inserted but no items, or no item references a known category.
  - `failed` — empty `categories` input (set inside the function, no rollback), or the transaction rolled back from the API layer's `try/catch` path.

## Failure modes

A note on HTTP status before the table: every row from "Non-GAEB file" downward returns **201 Created**. The HTTP layer says only "the file landed in storage and the document row exists." `parse_status` is the actual state machine the dashboard reads to decide what to render — banners, retry prompts, "no BoQ available" affordances. The decoupling is deliberate: a parse failure is a recoverable UI state, not a transport failure, and the durable `project_documents` row is the handle for any retry the user does later.

| Where it fails                                               | What the user sees            | What ends up in the DB                                                                                               |
| ------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Auth (`getUser` returns null)                                | 401 Unauthorized              | Nothing.                                                                                                             |
| Project ownership (`SELECT` returns nil)                     | 404 Project not found         | Nothing.                                                                                                             |
| Validation (extension / size, including non-X83 GAEB phases) | 400 + errorKey                | Nothing.                                                                                                             |
| Storage upload                                               | 500 + `file.uploadFailed`     | Nothing.                                                                                                             |
| `project_documents` insert                                   | 500 + `database.createFailed` | Storage object is removed in the cleanup path.                                                                       |
| Non-GAEB file (PDF, DWG, .docx, etc.)                        | 201 Created                   | `project_documents` row exists; `parse_status = 'not_applicable'`. No BoQ rows. (Step 6 skipped by extension check.) |
| `parseGaebXml` throws                                        | 201 Created                   | `project_documents` row exists; `parse_status = 'failed'`. No BoQ rows.                                              |
| RPC error (any)                                              | 201 Created                   | `project_documents` row exists; `parse_status = 'failed'`. No BoQ rows.                                              |
| Orphan rate >50% inside RPC                                  | 201 Created                   | `project_documents` row exists; `parse_status = 'failed'`. No BoQ rows (transaction rolled back).                    |
| Empty `categories` JSONB inside RPC                          | 201 Created                   | `parse_status = 'failed'` (set inside the function, no rollback needed because nothing was written yet).             |
| No item references a known category                          | 201 Created                   | `parse_status = 'partial'`. Categories committed; no items inserted; bootstrap skipped.                              |

The pattern is intentional: the **document record always exists**, and `parse_status` is the source of truth for downstream UI ("show parse-failed banner", "offer re-upload"). HTTP status reflects whether the file was _uploaded_, not whether it was _parsed_.

## Coolify / Traefik gotcha

Deployed browser uploads need **two** defenses; either one missing breaks staging/production ingest:

1. **Keep `/api/*` outside `proxy.ts`.** The proxy `config.matcher` excludes `api/`, `auth/`, and `monitoring/` path prefixes so route handlers receive the raw request body. If API routes matched the proxy, Next.js would consume the body during i18n/session handling before `POST /api/projects/[id]/documents` runs — uploads fail with confusing 400s. Regression coverage: `apps/dashboard/src/proxy.test.ts`.
2. **Read multipart with `arrayBuffer()` + bounded parser, not `request.formData()`.** Step 2 in the flow diagram is not idiomatic. `request.formData()` and reconstructed `Request(...).formData()` do not reliably survive the Coolify/Traefik standalone runtime for large browser multipart uploads. Reading the body once and extracting only the `file` part sidesteps the stream/runtime interaction. Never simplify this back to `await request.formData()` without re-testing on Coolify.

Full deployment context: [`how-to/deploy-to-coolify.md`](https://github.com/gidorah/catena/blob/dev/how-to/deploy-to-coolify.md).

## Known gap: no request-ID propagation

Today, structured ingest logs (`Sentry.logger` or `[ingest]` Coolify fallback — see [`how-to/debug-a-failed-ingest.md`](https://github.com/gidorah/catena/blob/dev/how-to/debug-a-failed-ingest.md)), the Postgres log line (`RAISE NOTICE 'Filtered N orphan item(s)…'`), and the Storage upload entry have no shared correlation ID. During an incident, you reconstruct the timeline by timestamp + user ID. This is a known MVP-era gap; it's documented in [`observability-and-incident-response.md`](/explanation/observability-and-incident-response) along with the rest of the observability state.

## Cross-references

- [`architecture.md`](/explanation/architecture) — runtime context for this pipeline.
- [`data-model.md`](/explanation/data-model) — what the source/canonical layers look like after a successful ingest.
- [`how-to/debug-a-failed-ingest.md`](https://github.com/gidorah/catena/blob/dev/how-to/debug-a-failed-ingest.md) — operational counterpart: how to diagnose `parse_status = 'failed'` in the wild.
- [`how-to/deploy-to-coolify.md`](https://github.com/gidorah/catena/blob/dev/how-to/deploy-to-coolify.md) — the multipart workaround in deployment context.
- [`../packages/gaeb-parser.md`](https://github.com/gidorah/catena/blob/dev/packages/gaeb-parser.md) — what `parseGaebXml` actually returns and why.
- Migration: `supabase/migrations/20260408000010_ingest_boq_function.sql`.
- Route: `apps/dashboard/src/app/api/projects/[id]/documents/route.ts`.
