---
title: "Your first GAEB upload"
description: "Goal: in five steps, prove your local stack works end-to-end. You will register a user, create a project, upload a real GAEB tender file, and confirm the parsed Bill of Quantiti..."
---

# Your first GAEB upload

Goal: in five steps, prove your local stack works end-to-end. You will register a user, create a project, upload a real GAEB tender file, and confirm the parsed Bill of Quantities ("BoQ") landed in Postgres with `parse_status = 'success'`.

This is a smoke test. If it works, the dashboard, the Supabase stack, and the GAEB parser are all wired correctly. If a step fails, the doc to read next is [`how-to/debug-a-failed-ingest.md`](https://github.com/gidorah/catena/blob/dev/how-to/debug-a-failed-ingest.md) — not this one.

**Prerequisite:** [`local-development.md`](/getting-started/local-development) — the dashboard is running on http://localhost:3002 and Supabase Studio is reachable on http://localhost:8000.

## Step 1 — Register and log in

1. Open http://localhost:3002. You'll be redirected to `/[locale]/v1/login`.
2. Click **Sign up** (the link below the login form, route `/v1/register`).
3. Use any email and a password ≥ 8 chars. Local Supabase is configured with `ENABLE_EMAIL_AUTOCONFIRM=true` (see root `.env.example`), so you skip the confirmation email entirely and land logged-in on the dashboard.

> **Local-only.** Email auto-confirm is a dev shortcut. Cloud and self-hosted environments use real SMTP.

You should now see the dashboard home page (`/[locale]/dashboard/default`) with a **New Project** entry point.

## Step 2 — Create a new project

The "New Project" flow is a wizard at `/[locale]/dashboard/projects/new` (`apps/dashboard/src/app/[locale]/(main)/dashboard/projects/new/page.tsx`). It has four steps: **Upload → Review → Edit → Confirm**.

In Step 2 below, you'll upload the GAEB file as part of the wizard's first step — project metadata is **prefilled from the parsed file** (project name, client info, deadlines), so you don't need to type them in.

Click **New Project**. You'll land on the Upload step of the wizard.

## Step 3 — Upload a GAEB file

The repo includes a regression corpus of real-world tender files at `test-fixtures/invitation-to-offer/`. Pick any `.X83`:

- `LV Rohbauarbeiten.X83`
- `Joh12_Ausschreibung_Rohbau_211229.X83`
- `BL0131_LV_Rohbau_GS.X83`
- `2021-12 LV Rohbau Westhof TK_V32.X83`

Drop one onto the wizard's upload zone. The dashboard parses it client-side via `@catena/gaeb-parser` (see `src/lib/document-parser.ts`) and prefills the next steps.

Walk through **Review** → **Edit** → **Confirm**, accepting the prefilled values. Submitting the final step:

1. Calls `POST /api/projects` to create the project row.
2. Calls `POST /api/projects/[id]/documents` with the original file as multipart form data (`apps/dashboard/src/app/api/projects/[id]/documents/route.ts`).
3. The route uploads the file to Supabase Storage, re-parses it server-side, and calls the SQL function `ingest_boq_and_bootstrap(...)` — which atomically inserts categories + items, updates `parse_status`, and bootstraps the canonical structure inside a single transaction.

When the wizard closes, you're redirected to the project detail page at `/[locale]/dashboard/projects/[id]`.

## Step 4 — Inspect the parsed BoQ

Open Supabase Studio at http://localhost:8000 (`supabase` / `supabase`) and use the **SQL Editor**. Find your project and the document you just uploaded:

```sql
select p.id as project_id, pd.id as document_id, p.name, pd.file_name, pd.parse_status
from public.projects p
join public.project_documents pd on pd.project_id = p.id
order by pd.uploaded_at desc
limit 1;
```

You should see one row. Copy the `document_id` UUID — the BoQ tables hang off `project_documents`, not `projects`. Paste it in place of every `<doc_id>` placeholder below. (Studio's SQL Editor doesn't support `psql` variable bindings, so the queries use a literal placeholder rather than `:doc_id`.)

```sql
-- Categories ingested from the GAEB file
-- (boq_* tables are scoped by document_id, not project_id)
select id, label, level, parent_gaeb_id
from public.boq_categories
where document_id = '<doc_id>'
limit 10;

-- Items (line entries with quantity, unit, short text)
select id, r_no_part, quantity, unit, left(short_text, 80) as short_text
from public.boq_items
where document_id = '<doc_id>'
limit 10;

-- The canonical structure bootstrapped from the BoQ
-- (canonical_* tables are scoped by document_structure_id; one structure per document)
select count(*) as canonical_categories
from public.canonical_categories cc
join public.document_structures ds on ds.id = cc.document_structure_id
where ds.document_id = '<doc_id>';

select count(*) as canonical_items
from public.canonical_items ci
join public.document_structures ds on ds.id = ci.document_structure_id
where ds.document_id = '<doc_id>';
```

A successful ingest yields non-zero counts on all four queries.

> **What's actually in here?** The `boq_*` tables are the **immutable parsed source layer** (ADR-002): a faithful snapshot of what came out of the GAEB XML. The `canonical_*` tables are the **editable canonical layer**, bootstrapped from the source in the same transaction (ADR-008) and addressed via a `document_structures` row that links the two. When the platform later supports work-package splits, that work happens against canonical, not source.

## Step 5 — Confirm `parse_status = 'success'`

The first query in Step 4 already returned `parse_status` for your document. You're looking for `success`.

| Status           | Meaning                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `success`        | Parser ran, items ingested (orphan rate ≤ 50%), canonical bootstrapped. You're done.                      |
| `partial`        | Categories inserted but no usable items — either an empty item set, or **every** item was orphaned.       |
| `failed`         | Parsing threw, or orphan rate exceeded 50% (`ingest_boq_and_bootstrap` rolls the whole transaction back). |
| `not_applicable` | Non-GAEB upload (e.g. PDF). The default — no BoQ parsing was attempted.                                   |

If anything other than `success` appears, that's the cue to walk through [`how-to/debug-a-failed-ingest.md`](https://github.com/gidorah/catena/blob/dev/how-to/debug-a-failed-ingest.md). The 50% orphan threshold and rollback semantics are enforced by `ingest_boq_and_bootstrap` in `supabase/migrations/20260408000010_ingest_boq_function.sql` — not by the API route.

You've now exercised the whole loop: auth → upload → parse → ingest → canonical bootstrap. Anything more elaborate is a how-to or an explanation, not a tutorial.
