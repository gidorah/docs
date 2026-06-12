---
title: "Data Model"
description: "Catena's editable data sits in three layers: a **source** layer reflecting what the GAEB file said, a **canonical** layer the user edits, and an **outbound** layer that freezes ..."
---

# Data Model

Catena's editable data sits in three layers: a **source** layer reflecting what the GAEB file said, a **canonical** layer the user edits, and an **outbound** layer that freezes what was sent to subcontractors. The split is the load-bearing decision in Epic 4.1; it is what makes the editing experience safe to evolve without ever changing the parsed source of truth.

This page is conceptual. For column-level types and indexes, see [`../reference/database-schema.md`](https://github.com/gidorah/catena/blob/dev/reference/database-schema.md). For the runtime path that _creates_ this state, see [`document-ingest-pipeline.md`](/explanation/document-ingest-pipeline).

## The three layers

```
┌──────────────────────────────────────────────────────────────────┐
│  SOURCE LAYER — what the file said. Immutable after creation.    │
│                                                                  │
│   project_documents ──< boq_categories                           │
│           └──────────< boq_items                                 │
│                                                                  │
│   Written once by ingest_boq_and_bootstrap(). No app-level UPDATE│
│   path. parse_status is the only field that changes after create.│
└────────────────────────────────┬─────────────────────────────────┘
                                 │  bootstrap (eager mat'n)
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  CANONICAL LAYER — what the user is working on. Editable.        │
│                                                                  │
│   document_structures (1:1 with project_documents in MVP)        │
│        ├──< canonical_categories  (archive, never DELETE)        │
│        ├──< canonical_items       (non-deletable, ADR-014)       │
│        ├──< work_packages ──< work_package_items                 │
│        └──< document_structure_events  (append-only audit)       │
│                                                                  │
│   When a structure is finalized (is_locked = true), DB triggers  │
│   block INSERT/UPDATE on canonical_categories and canonical_items│
│   until it's reopened.                                           │
└────────────────────────────────┬─────────────────────────────────┘
                                 │  send (freeze snapshot)
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│  OUTBOUND LAYER — what was sent. Frozen at send time.            │
│                                                                  │
│   work_packages ──< outbound_requests                            │
│                         ├──< outbound_snapshot_categories        │
│                         └──< outbound_snapshot_items             │
│                                                                  │
│   Each send creates a new outbound_request plus a copy of the    │
│   relevant categories/items into the snapshot tables. Snapshot   │
│   rows are SELECT + INSERT only. Future sends never mutate past  │
│   snapshots — they create new ones against the current tree.    │
└──────────────────────────────────────────────────────────────────┘
```

## Layer-by-layer

### Source layer

Tables: `project_documents`, `boq_categories`, `boq_items`.

The source layer is what the file said. It is created once per upload by the SQL function `ingest_boq_and_bootstrap` (migration `20260408000010`), and after that the BoQ rows are **read-only against UPDATE — enforced by the database itself**. Migration `20260403000002_source_immutability.sql` installs `BEFORE UPDATE` triggers on `boq_categories` and `boq_items` that always raise `restrict_violation`, so even service-role clients (which bypass RLS) cannot mutate parsed rows. The migration deliberately omits `BEFORE DELETE` triggers so that `ON DELETE CASCADE` from `project_documents` keeps working — deletion via the cascade chain is the only delete path, not via the application. Re-uploading the same file creates a _new_ `project_documents` row with its own structure tree; canonical edits on the prior document remain on the prior structure (they are not migrated forward).

This immutability is what makes [ADR-001 (item-level traceability)](https://github.com/gidorah/catena/blob/dev/decisions/001-item-level-traceability.md) and [ADR-002 (immutable parsed source layer)](https://github.com/gidorah/catena/blob/dev/decisions/002-immutable-source-layer.md) believable. If a customer disputes a quote in six months, the parsed BoQ rows are still byte-identical to what arrived from the GAEB file.

The one field on `project_documents` that legitimately changes after creation is `parse_status` (`success` / `partial` / `failed`). `project_documents` is part of the source layer but is not under the immutability trigger; the BoQ rows themselves are.

### Canonical layer

Tables: `document_structures`, `canonical_categories`, `canonical_items`, `work_packages`, `work_package_items`, `document_structure_events`.

This is where editing happens. A `document_structure` is the editable container for one document. In MVP there is exactly one structure per `project_document` ([ADR-004](https://github.com/gidorah/catena/blob/dev/decisions/004-one-document-structure-per-source-document.md), enforced by a UNIQUE constraint).

`canonical_categories` and `canonical_items` are **eagerly materialized** at bootstrap time from the source rows ([ADR-005](https://github.com/gidorah/catena/blob/dev/decisions/005-eager-category-materialization.md), [ADR-006](https://github.com/gidorah/catena/blob/dev/decisions/006-eager-item-materialization.md)). The dashboard reads from canonical, not from source. Edits write to canonical and never touch source.

A few invariants worth knowing:

- **No application-level DELETE on canonical items.** [ADR-014](https://github.com/gidorah/catena/blob/dev/decisions/014-canonical-item-non-deletable-mvp.md). The schema has no DELETE policy on `canonical_items`, so a user can never remove an item from the tree — removal is via archive flags ([ADR-015](https://github.com/gidorah/catena/blob/dev/decisions/015-archive-instead-of-hard-delete.md)). Rows still vanish if the parent `project_document` is deleted (cascade through `document_structures`), but that's a project-scope operation, not row-level editing.
- **Quantity and unit are derived from source.** [ADR-022](https://github.com/gidorah/catena/blob/dev/decisions/022-quantity-and-unit-derived-from-source.md). The columns aren't on `canonical_items` at all — readers `JOIN canonical_items.source_item_id → boq_items` to get them. The user edits text, structure, and package membership — not quantities. That keeps the parsed numbers verifiable against the original tender.
- **`document_structure_events` is append-only and actor-pinned.** Mechanism described in [`auth-and-authorization.md`](/explanation/auth-and-authorization); the policy intent is [ADR-016](https://github.com/gidorah/catena/blob/dev/decisions/016-current-state-with-audit-logging.md).
- **Lifecycle is enforced at the DB layer.** When `document_structures.is_locked = true`, BEFORE INSERT/UPDATE triggers on `canonical_categories` and `canonical_items` raise `restrict_violation`. Reopening the structure clears the lock ([ADR-018](https://github.com/gidorah/catena/blob/dev/decisions/018-editable-structure-lifecycle-and-locking.md)).

`work_packages` group canonical items into scopes that can be sent to a subcontractor. They are scoped to one `document_structure` (FK on `work_packages.document_structure_id`) — there are no cross-document packages in MVP. `work_package_items` is a pure membership table (composite PK `(work_package_id, canonical_item_id)`, no per-package columns); an item can belong to multiple packages ([ADR-028](https://github.com/gidorah/catena/blob/dev/decisions/028-canonical-item-may-belong-to-many-packages.md)) but every package sees the same canonical text and quantity. Package categories are derived from item membership rather than stored independently ([ADR-027](https://github.com/gidorah/catena/blob/dev/decisions/027-derive-package-categories-from-items.md)).

### Outbound layer

Tables: `outbound_requests`, `outbound_snapshot_categories`, `outbound_snapshot_items`.

When a work package is sent to a subcontractor, an `outbound_request` row is created and a self-contained tree is **copied** into `outbound_snapshot_categories` and `outbound_snapshot_items`: every item in the package, every ancestor category needed to give those items a path, with denormalized columns (`name`, `description`, `path`, `quantity`, `unit`, `title`) so the snapshot can be read without joining back to canonical. The snapshot rows still keep `canonical_*_id` and `source_item_id` lineage FKs (DEFERRABLE) for traceability, but they're independent of any future canonical edit. The snapshot tables are SELECT + INSERT only by RLS, so once a send is recorded its content is locked — the freeze happens because the snapshot is a separate copy, not because the canonical rows are made immutable ([ADR-031](https://github.com/gidorah/catena/blob/dev/decisions/031-freeze-sent-content-in-outbound-snapshot.md)). Subsequent edits to the canonical tree never retroactively change what was sent. If you send the same package again later, that's a _new_ `outbound_request` with its own snapshot rows ([ADR-032](https://github.com/gidorah/catena/blob/dev/decisions/032-future-sends-live-against-current-tree.md)).

In MVP, there is no UI for "send" — the schema is in place so that future sends are correctly frozen from day one, but `outbound_requests` rows are not created by any current code path. The subcontractor portal that will write them is post-MVP.

`work_packages` and `outbound_requests` have **independent lifecycles** ([ADR-029](https://github.com/gidorah/catena/blob/dev/decisions/029-separate-work-package-from-outbound-request.md), [ADR-030](https://github.com/gidorah/catena/blob/dev/decisions/030-work-package-reusable-lifecycle.md)). A package can be reused across many sends; finalizing the document structure does not finalize past sends.

## Bootstrap flow

The transition from source → canonical happens once per document, inside the `ingest_boq_and_bootstrap` transaction. The path branches early if there is nothing worth bootstrapping:

1. **Idempotency guard.** If `boq_categories` already exist for the document, the function returns the existing `parse_status` and `structure_id` without re-inserting or re-bootstrapping (R7.5). Re-running the route on the same document is safe.
2. `boq_categories` are inserted from the parsed JSONB.
3. **Branch on items.** If there are no parsed items, or no item references a category that was inserted, `parse_status` is set to `partial` and the function returns. Bootstrap does **not** run on the partial path — there are no items to materialize.
4. **Orphan-rate check.** With some valid items present, if more than 50% of items reference unknown categories the function `RAISE EXCEPTION`s and the entire transaction rolls back. Below 50%, orphans are filtered (and logged).
5. Valid items are inserted; `parse_status` is set to `success`.
6. `bootstrap_canonical_structure(p_document_id, p_user_id)` runs in the same transaction. It creates the `document_structure`, materializes `canonical_categories` and `canonical_items` from the just-inserted source rows, and emits a `document_structure_events` row.

Because bootstrap runs in the same transaction as ingest, there is no observable state where successfully-parsed source rows exist without their canonical counterparts. (On the `partial` path, source categories exist without canonical rows by design — there's nothing to canonicalize.)

## Why not edit the source rows directly?

Two reasons that came up repeatedly during Epic 4.1 design:

1. **Auditability.** "What did the file actually say?" must be answerable years later. If editing wrote back to `boq_*`, the answer becomes "what someone last typed." [ADR-002](https://github.com/gidorah/catena/blob/dev/decisions/002-immutable-source-layer.md).
2. **Lineage.** Every `canonical_items.source_item_id` is `NOT NULL` and unique within its structure (`UNIQUE(document_structure_id, source_item_id)`) — every canonical item points to exactly one source item, no exceptions. Category lineage (`canonical_categories.source_category_id`) is nullable and advisory: a user-added canonical category has no source counterpart. Edits change canonical text but never touch the lineage pointer, so item-level traceability ([ADR-001](https://github.com/gidorah/catena/blob/dev/decisions/001-item-level-traceability.md)) survives any amount of editing. Confidence scores ([ADR-020](https://github.com/gidorah/catena/blob/dev/decisions/020-confidence-immutable-on-source-layer.md), on `canonical_categories.ai_confidence` only) and review state ([ADR-021](https://github.com/gidorah/catena/blob/dev/decisions/021-review-state-without-recalculating-confidence.md), on `canonical_items.review_state`) live cleanly on whichever side they belong on.

The user-facing consequence: if the parser misread some text, the fix is to edit the canonical row. The source row stays "wrong" — but it stays faithful to the file the customer sent, which is the whole point. The combination of immutability + lineage means the wrong parse is still recoverable months later, even after several rounds of editing.

## Cross-references

- [`document-ingest-pipeline.md`](/explanation/document-ingest-pipeline) — the runtime path that creates this state.
- [`auth-and-authorization.md`](/explanation/auth-and-authorization) — the RLS chain that protects all three layers.
- [`../reference/database-schema.md`](https://github.com/gidorah/catena/blob/dev/reference/database-schema.md) — column-level reference.
- ADRs governing this model: [001](https://github.com/gidorah/catena/blob/dev/decisions/001-item-level-traceability.md), [002](https://github.com/gidorah/catena/blob/dev/decisions/002-immutable-source-layer.md), [004](https://github.com/gidorah/catena/blob/dev/decisions/004-one-document-structure-per-source-document.md)–[007](https://github.com/gidorah/catena/blob/dev/decisions/007-separate-canonical-category-and-item-tables.md), [014](https://github.com/gidorah/catena/blob/dev/decisions/014-canonical-item-non-deletable-mvp.md)–[018](https://github.com/gidorah/catena/blob/dev/decisions/018-editable-structure-lifecycle-and-locking.md), [020](https://github.com/gidorah/catena/blob/dev/decisions/020-confidence-immutable-on-source-layer.md)–[022](https://github.com/gidorah/catena/blob/dev/decisions/022-quantity-and-unit-derived-from-source.md), [027](https://github.com/gidorah/catena/blob/dev/decisions/027-derive-package-categories-from-items.md)–[032](https://github.com/gidorah/catena/blob/dev/decisions/032-future-sends-live-against-current-tree.md).
