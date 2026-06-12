---
title: "Debug a failed GAEB ingest"
description: "A user uploaded a GAEB file and `parse_status` ended up `failed` or `partial` (or never advanced past the default). This doc walks the diagnostic loop."
---

# Debug a failed GAEB ingest

A user uploaded a GAEB file and `parse_status` ended up `failed` or `partial` (or never advanced past the default). This doc walks the diagnostic loop.

This is a **how-to**, not a primer:

- It does not teach the GAEB DA XML format — that lives in [`explanation/gaeb-domain-primer.md`](https://github.com/gidorah/catena/blob/dev/explanation/gaeb-domain-primer.md) (forthcoming).
- It is not a guide for adding new parser extractors.
- It does not cover the upload UI itself; failures here mean the file reached the server.

## Two diagnostic shapes

The same pipeline fails in two very different debugging contexts. Read the section that matches your situation.

**Dev-loop (you have the file in hand).** Local Supabase + the corpus in `test-fixtures/invitation-to-offer/` + the parser's vitest suite. You can re-run the parser standalone, you can drop the file into the wizard, you can `psql` into the local DB. Most of this doc is written from this shape.

**Production-incident (a customer reported it).** No local repro. You have: Sentry Logs (when DSN is configured), the production Coolify container logs, Supabase Studio against the production project, the customer's filename, and a rough timestamp. There is **no request-ID propagation** through the pipeline today — a known observability gap, see [`explanation/observability-and-incident-response.md`](https://github.com/gidorah/catena/blob/dev/explanation/observability-and-incident-response.md). Triangulate to a row in `project_documents` like this:

1. Find the customer's user id in Studio: `auth.users` → filter by email; copy `id`.
2. Find their projects: `SELECT id FROM projects WHERE created_by = '<user-id>';`.
3. Find the failing document: `SELECT id, file_name, parse_status, uploaded_at, file_path FROM project_documents WHERE project_id = ANY(ARRAY['<id>', ...]) ORDER BY uploaded_at DESC LIMIT 20;`. `file_name` is the customer's original filename (the route stores it unmodified; only the storage path is sanitized).

Once you've identified the row, **download the blob from Supabase Storage at `file_path`** (Studio → Storage → `project-documents` bucket) rather than re-engaging the customer. Then drop into the dev-loop shape.

## Pipeline recap (what actually runs)

`POST /api/projects/[id]/documents` (`apps/dashboard/src/app/api/projects/[id]/documents/route.ts`) does, in order:

1. **Auth + project ownership check** — fails ⇒ 401/404 before reading the upload body.
2. **Read raw body** — `request.arrayBuffer()` feeds bounded multipart parsing in the Coolify/Traefik runtime (a deliberate workaround; see the deploy doc).
3. **Extract the multipart `file` part** from the buffered body — missing ⇒ 400.
4. **`validateFile`** — type, size, sanitized filename — fails ⇒ 400.
5. **Storage upload** — `supabase.storage.from("project-documents").upload(...)` — fails ⇒ 500, no DB row.
6. **`project_documents` row insert** — fails ⇒ uploaded blob is removed, 500.
7. **`maybeParseGaeb`** (only for `.x83`) — calls `parseGaebXml`, then RPCs into the SQL function `ingest_boq_and_bootstrap` (`supabase/migrations/20260408000010_ingest_boq_function.sql`). **Non-fatal**: any error returned to the API layer is logged and `parse_status` is set to `failed`, but the document row stays.

The 50% orphan threshold and atomicity are enforced **inside the SQL function**, not in the API. Don't go looking for orphan logic in TypeScript.

**Zero-category path:** when the parser returns no categories, the API route logs `failure_reason: zero_categories` before calling the RPC. The SQL function would also mark `failed` if called with an empty category array.

**Ingest logging channels:** structured ingest events use `Sentry.logger` when `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` is set; otherwise the route emits a one-line `[ingest]` line to Coolify via `console.error` / `console.warn` only. The two channels are mutually exclusive so console bridging does not duplicate Sentry log entries.

## Failure mode 0 — No `project_documents` row at all

**Symptom:** "Nothing happened" — the customer's upload spinner finished but no row exists for that filename in `project_documents`.

The request failed at pipeline step 2, 3, 4, 5, or 6 — before the document row was inserted (or it was inserted and rolled back). The dashboard shows a generic error toast; container logs carry the real story.

Diagnose:

1. When a DSN is configured: Sentry → **Logs**, filter by `ingest_stage` (`storage_upload`, `db_insert`, `gaeb_parse`, `boq_ingest`, `unexpected`), `project_id`, or `file_name`. Failures use message `Document ingest failed`; warnings use `Document ingest warning` (e.g. `warning_reason: partial_parse`).
2. When no DSN is configured, or as a cross-check: grep Coolify for `[ingest] <stage> <project_id> <file_name>`. For non-ingest API errors with a DSN, use console-bridge logs from `console.warn` / `console.error`.
3. If the log shows an auth/ownership failure (401/404), the customer hit the wrong project URL — not an ingest bug.
4. If the log shows a Storage upload error, check Supabase Storage quota / `project-documents` bucket health.

If a row _does_ exist for the filename, you're in modes 1–4 below.

## Failure mode 1 — Parser error (before SQL)

**Symptom:** `parse_status = 'failed'`, Sentry Logs or Coolify show `ingest_stage: gaeb_parse`.

The parser threw before any RPC call. The file likely has a structural quirk the parser doesn't handle yet.

Diagnose:

1. Get the file (download from Storage, or ask the customer).
2. Run the parser standalone:
   ```bash
   pnpm --filter @catena/gaeb-parser test
   ```
   then add a one-off test that loads the failing file and asserts on the bit that broke.
3. Check the existing edge-case suite (`packages/gaeb-parser/__tests__/edge-cases.test.ts`) for a similar shape — many real-world quirks already have a regression there.

If it's a new variant: extend the parser, add the file (or a redacted copy) as a fixture, add an assertion, re-run. The corpus sweep (`corpus-sweep.test.ts`) must stay zero-red.

## Failure mode 2 — Ingest rolled back (>50% orphans)

**Symptom:** `parse_status = 'failed'`, Sentry Logs or Coolify show `ingest_stage: boq_ingest` with an orphan-threshold message.

The parser succeeded but more than half of the parsed items reference a `category_gaeb_id` that doesn't exist in the parsed category set. The SQL function raised, the whole transaction rolled back, no `boq_categories` or `boq_items` were written.

Diagnose:

1. Either the parser dropped categories it should have kept, or it mis-extracted `category_gaeb_id` on items. Re-run the parser locally and inspect both arrays before they go into the RPC.
2. Compare against a working file from the corpus to spot the structural difference.

Fix the parser (this is almost never an SQL bug). Re-uploading the same file after the parser fix produces a clean ingest because the function is idempotent only when `boq_categories` already exist for the document — and they don't, since the rollback wiped them.

## Failure mode 3 — Partial success

**Symptom:** `parse_status = 'partial'`. Two distinct sub-paths:

- **3a — Items existed, all were orphans.** The parser produced items but none referenced a category that also got parsed (`v_valid_count = 0`). Same root cause as mode 2 (parser-side mis-extraction or dropped categories), but the threshold check sees zero valid items as graceful degradation rather than as a malformed file. Fix path is the same as mode 2.
- **3b — No items in the file.** The parsed `items` array was empty (`v_item_count = 0`). Possibly a categories-only file or a parser bug that lost all items. Inspect the parser output to confirm which.

In both sub-paths the categories landed (inspect `boq_categories` for the document — they'll be present) and no rollback happened. Check Sentry Logs for `warning_reason: partial_parse` at `ingest_stage: boq_ingest`, or Coolify for `[ingest]` with `console.warn` when no DSN is set.

## Failure mode 4 — Bootstrap failure

**Symptom:** `parse_status = 'failed'` after a clean parse, container logs show an error from `bootstrap_canonical_structure` rather than `ingest_boq_and_bootstrap`.

The SQL function calls `bootstrap_canonical_structure(p_document_id, p_user_id)` in the same transaction after writing the BoQ rows. A failure there rolls everything back too.

Diagnose:

1. Run the pgTAP suite with `npm run test:db`. It rebuilds the Supabase CLI `local-test` database from migrations and runs the ingest, bootstrap, work-package, RLS, and storage contract tests. A red test here is the strongest signal.
2. Look for trigger-fired errors (RLS denials, CHECK constraint violations) in the SQL log. The bootstrap function inserts into `document_structures`, `canonical_categories`, `canonical_items`, and emits an audit event — any one can fail.

## Diagnostic queries

Run these against the local Postgres container — or against production via Studio's SQL editor for read-only inspection. Do not run `UPDATE`/`DELETE` against production from the SQL editor; route mutations through a migration.

```sql
-- Find the row for the failing upload. file_name is the customer's
-- original filename, unmodified; the storage path is sanitized separately.
SELECT id, project_id, file_name, parse_status, uploaded_at, file_path
FROM project_documents
WHERE project_id = '<project-uuid>'
ORDER BY uploaded_at DESC
LIMIT 10;

-- Did categories land?
SELECT count(*) FROM boq_categories WHERE document_id = '<doc-uuid>';

-- Did items land? Any orphans?
SELECT
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM boq_categories bc
    WHERE bc.document_id = i.document_id AND bc.gaeb_id = i.category_gaeb_id
  )) AS valid_items,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM boq_categories bc
    WHERE bc.document_id = i.document_id AND bc.gaeb_id = i.category_gaeb_id
  )) AS orphan_items
FROM boq_items i WHERE i.document_id = '<doc-uuid>';

-- Did bootstrap succeed?
SELECT id, document_id, created_at FROM document_structures WHERE document_id = '<doc-uuid>';
```

## Adding a regression fixture (dev-loop only)

When a new failure mode is fixed, prevent re-regressions:

1. Drop the failing file (or a redacted version) into `packages/gaeb-parser/__tests__/fixtures/` if the bug is parser-side, or `test-fixtures/invitation-to-offer/` if it's a corpus-shape coverage gap.
2. Add an assertion to the relevant test file.
3. Confirm `corpus-sweep.test.ts` still passes with zero red findings.
