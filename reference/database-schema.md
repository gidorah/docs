---
title: "Database Schema"
description: "Tables grouped by layer, with primary keys, foreign keys, and the migration that introduced each artifact. Full column lists live in the migration files; this page is a navigati..."
---

# Database Schema

Tables grouped by layer, with primary keys, foreign keys, and the migration that introduced each artifact. Full column lists live in the migration files; this page is a navigational index.

For the conceptual layering rationale, see [`../explanation/data-model.md`](https://github.com/gidorah/catena/blob/dev/explanation/data-model.md). For the function that writes the source layer, see [`../explanation/document-ingest-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/document-ingest-pipeline.md).

Migration paths are relative to `supabase/migrations/`.

## Identity and projects

| Table                  | Purpose                                                   | Key columns                                                                                                                   | Introduced in                                                                                                     |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `auth.users`           | Supabase-managed identity table                           | `id`                                                                                                                          | (Supabase built-in)                                                                                               |
| `public.user_profiles` | App-side profile mirror, populated by `private.handle_new_user()` | `id` PK → `auth.users(id)`; `email`, `full_name`, `company_name`, `avatar_url`                                                | `20251115000001_create_user_profiles.sql`; trigger function moved to `private` in `20260523130000_cloud_data_api_privileges.sql` |
| `projects`             | Top-level container for tender work                       | `id`, `name`, `description`, `client_name`, `client_address`, `deadline`, `status` (enum `project_status`), `created_by`      | `20251111000002_create_projects.sql`                                                                              |
| `project_documents`    | Uploaded files attached to a project                      | `id`, `project_id` → `projects(id)`, `file_path`, `file_name`, `file_type`, `file_size`, `uploaded_at`, `parse_status` (enum) | `20251111000003_create_project_documents.sql`; `parse_status` added in `20260403000003_document_parse_status.sql` |

`project_status` enum: `draft | active | completed | archived`.
`document_parse_status` enum: `not_applicable | success | partial | failed`.

## Source layer (immutable after creation)

Reflects what the GAEB file said. Written exactly once by `ingest_boq_and_bootstrap()` (see [Functions](#functions)). `BEFORE UPDATE` triggers reject mutation; `DELETE` is prevented by removing the DELETE RLS policies, leaving CASCADE from `project_documents` as the only delete path.

| Table            | Purpose                                             | Key columns                                                                                                                      | Introduced in                                                                                                                                                         |
| ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boq_categories` | Source-of-truth category nodes from the parsed file | `id`, `document_id` → `project_documents(id)`, `gaeb_id`, `r_no_part`, `label`, `level`, `parent_gaeb_id`                        | `20260304000001_create_boq_tables.sql`; identity hardened in `20260403000001_source_identity_hardening.sql`; immutability in `20260403000002_source_immutability.sql` |
| `boq_items`      | Source-of-truth line items from the parsed file     | `id`, `document_id`, `gaeb_id`, `category_gaeb_id`, `r_no_part`, `quantity`, `unit`, `short_text`, `long_text`, `long_text_html` | Same as above                                                                                                                                                         |

Identity-hardening migration adds `UNIQUE (document_id, gaeb_id)` so `source_item_id` / `source_category_id` foreign keys are stable.

## Canonical layer (editable)

The user-facing tree. Bootstrapped from the source layer and edited from there. One `document_structures` row per `project_documents` row (enforced by `UNIQUE (document_id)`).

| Table                       | Purpose                                                                                     | Key columns                                                                                                                                                                                                                                                             | Introduced in                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `document_structures`       | Container for the editable canonical tree per document                                      | `id`, `document_id` (UNIQUE) → `project_documents(id)`, `status` (enum `document_structure_status`), `is_locked`, `finalized_at`, `finalized_by`, `created_by`                                                                                                          | `20260408000001_canonical_enums_and_document_structures.sql`                                                                                                                                                                                                 |
| `canonical_categories`      | Editable category nodes                                                                     | `id`, `document_structure_id`, `parent_category_id` (self-FK), `source_category_id` → `boq_categories(id)` (nullable), `name`, `description`, `sort_order`, `status` (enum `canonical_category_status`), `archived_at`, `archived_by`, `origin` (enum), `ai_confidence` | `20260408000002_canonical_categories_and_items.sql`; `origin` + `ai_confidence` in `20260408000005_review_audit_columns.sql`                                                                                                                                 |
| `canonical_items`           | Editable line items                                                                         | `id`, `document_structure_id`, `parent_category_id` → `canonical_categories(id)`, `source_item_id` (NOT NULL) → `boq_items(id)`, `title`, `description`, `sort_order`, `review_state` (enum), `is_user_modified`, `reviewed_at`, `reviewed_by`                          | Same migration; `reviewed_at` / `reviewed_by` in `20260408000002`. `review_state` was originally a `TEXT` column in `20260408000002`; `20260408000005_review_audit_columns.sql` drops and re-adds it as the `review_state` enum and adds `is_user_modified`. |
| `document_structure_events` | Append-only audit log of structure mutations (the "current state with audit logging" model) | `id`, `document_structure_id`, `actor_id` → `auth.users(id)`, `event_type`, `entity_type`, `entity_id`, `payload` (JSONB)                                                                                                                                               | `20260408000003_document_structure_events.sql`                                                                                                                                                                                                               |

Enum values:

- `document_structure_status`: `active | finalized | reopened`
- `canonical_category_status`: `draft | final`
- `category_origin`: `system | user_created | user_modified`
- `review_state`: `pending | approved | overridden`

`canonical_items` has `UNIQUE (document_structure_id, source_item_id)` — every source item is materialised exactly once per structure.

## Work packages

Scope definitions that group canonical items for outbound bidding. Items belong to many packages.

| Table                | Purpose                                                          | Key columns                                                                                                                             | Introduced in                      |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `work_packages`      | Reusable scope definitions (lifecycle is independent from sends) | `id`, `document_structure_id`, `name`, `description`, `status` (enum `work_package_status`), `archived_at`, `archived_by`, `created_by` | `20260408000008_work_packages.sql` |
| `work_package_items` | Many-to-many membership                                          | `(work_package_id, canonical_item_id)` composite PK; `added_by`, `added_at`                                                             | Same migration                     |

`work_package_status` enum: `draft | ready | archived`.

## Outbound layer (frozen)

Captures what was sent. Snapshot rows are written when an `outbound_request` ships and never mutate; future sends create new requests against the current canonical tree.

| Table                          | Purpose                                                        | Key columns                                                                                                                                              | Introduced in                          |
| ------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `outbound_requests`            | One bid request per send                                       | `id`, `work_package_id`, `subcontractor_id`, `status` (enum `outbound_request_status`), `sent_at`, `sent_by`, `created_by`                               | `20260408000009_outbound_boundary.sql` |
| `outbound_snapshot_categories` | Frozen copy of the category subtree at send time               | `id`, `outbound_request_id`, `canonical_category_id`, `parent_snapshot_category_id` (self-FK), `name`, `description`, `path`, `sort_order`               | Same migration                         |
| `outbound_snapshot_items`      | Frozen copy of items at send time, retaining lineage to source | `id`, `outbound_request_id`, `snapshot_category_id`, `canonical_item_id`, `source_item_id` → `boq_items(id)`, `title`, `description`, `quantity`, `unit` | Same migration                         |

`outbound_request_status` enum: `draft | sent | expired | cancelled`.

## Storage

Single bucket `project-documents` (private, owner-scoped). Defined in `20251111000004_create_storage_bucket.sql`.

## Functions

| Function                                                                    | Purpose                                                                                                                                                                                                                | Defined in                                                                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ingest_boq_and_bootstrap(p_document_id, p_user_id, p_categories, p_items)` | Atomic, idempotent ingest. Inserts source rows, calls `bootstrap_canonical_structure`, sets `parse_status`. Rolls back if orphan-item rate ≥ 50%.                                                                      | `20260408000010_ingest_boq_function.sql`                                                                |
| `bootstrap_canonical_structure(p_document_id, p_user_id)`                   | Eager 1:1 materialisation of the canonical tree from the source layer.                                                                                                                                                 | `20260408000006_canonical_bootstrap.sql`                                                                |
| `check_coverage(p_document_structure_id)`                                   | Returns `total_canonical_items`, `covered_items`, `uncovered_items`, and an `is_fully_covered` boolean (counts canonical items that belong to at least one work package). Used to gate "reply-ready" lifecycle states. | `20260408000009_outbound_boundary.sql`; column rename in `20260408000011_fix_check_coverage_column.sql` |
| `prevent_source_row_update()`                                               | Trigger function on `boq_categories` / `boq_items` enforcing source-layer immutability (raises on `BEFORE UPDATE`).                                                                                                    | `20260403000002_source_immutability.sql`                                                                |
| `check_structure_not_locked()`                                              | Trigger function rejecting canonical mutations when the parent structure is locked.                                                                                                                                    | `20260408000009_outbound_boundary.sql`                                                                  |
| `enforce_event_actor_id()`                                                  | Trigger function ensuring `document_structure_events.actor_id` matches `auth.uid()` when the request is authenticated.                                                                                                 | `20260408000003_document_structure_events.sql`                                                          |
| `update_updated_at_column()`                                                | Generic `BEFORE UPDATE` trigger that refreshes `updated_at`.                                                                                                                                                           | `20251111000001_create_update_timestamp_function.sql`                                                   |
| `private.handle_new_user()`                                                 | Mirrors a new `auth.users` row into `public.user_profiles`. Trigger-only; not callable by `anon` or `authenticated`. Fires from `on_auth_user_created`.                                                               | `20251115000001_create_user_profiles.sql`; moved to `private` in `20260523130000_cloud_data_api_privileges.sql` |

## Triggers

| Trigger                               | On table                    | Action                                                                                      |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `trg_boq_categories_immutable`        | `boq_categories`            | `BEFORE UPDATE` raises (source immutability). `DELETE` is blocked at the RLS layer instead. |
| `trg_boq_items_immutable`             | `boq_items`                 | Same.                                                                                       |
| `trg_canonical_categories_lock_check` | `canonical_categories`      | Reject mutations when parent structure is locked.                                           |
| `trg_canonical_items_lock_check`      | `canonical_items`           | Same.                                                                                       |
| `trg_document_structure_events_actor` | `document_structure_events` | Reject inserts where `auth.uid()` is set and `actor_id ≠ auth.uid()`.                       |
| `set_*_updated_at`                    | (each editable table)       | `BEFORE UPDATE` → `update_updated_at_column()`.                                             |
| `update_user_profiles_updated_at`     | `public.user_profiles`      | Same.                                                                                       |
| `on_auth_user_created`                | `auth.users`                | `AFTER INSERT` → `private.handle_new_user()`.                                               |

## RLS policies

Every table has RLS enabled. The service-role JWT bypasses RLS at the connection level on all tables; one explicit `Service role can do everything` policy exists on `public.user_profiles` to additionally grant operations under the policy-evaluation path. User-role policies follow one of two shapes:

- **Project-owner reachability** — granted when the row's project (or document, structure, work package) traces back to a `projects` row whose `created_by = auth.uid()`. Applied to: `boq_categories`, `boq_items`, `project_documents`, `canonical_categories`, `canonical_items`, `document_structures`, `document_structure_events`, `work_packages`, `work_package_items`, `outbound_requests`, `outbound_snapshot_categories`, `outbound_snapshot_items`.
- **Self-row access** — granted when the row's `created_by` (or `id` for profiles) equals `auth.uid()`. Applied to: `projects` (CRUD on own), `user_profiles` (SELECT and UPDATE on own row only; no broad read-all policy; `anon` has no table access after Cloud privilege hardening).

The full policy list is enumerated across `20251114000001_add_update_policies.sql`, `20251115000001_create_user_profiles.sql`, `20260304000001_create_boq_tables.sql`, `20260408000004_canonical_rls_policies.sql`, and `20260523130000_cloud_data_api_privileges.sql`.

## Indexes

Beyond the primary keys and `UNIQUE` constraints listed above, indexes are added on hot foreign keys and on filterable columns:

| Index                                      | Table                          | Columns                                                   |
| ------------------------------------------ | ------------------------------ | --------------------------------------------------------- |
| `idx_projects_created_by`                  | `projects`                     | `created_by`                                              |
| `idx_projects_status`                      | `projects`                     | `status`                                                  |
| `idx_projects_created_at`                  | `projects`                     | `created_at DESC`                                         |
| `idx_project_documents_project_id`         | `project_documents`            | `project_id`                                              |
| `idx_project_documents_uploaded_at`        | `project_documents`            | `uploaded_at DESC`                                        |
| `idx_project_documents_parse_status`       | `project_documents`            | `parse_status`                                            |
| `idx_user_profiles_email`                  | `user_profiles`                | `email`                                                   |
| `idx_user_profiles_created_at`             | `user_profiles`                | `created_at DESC`                                         |
| `idx_boq_categories_document_id`           | `boq_categories`               | `document_id`                                             |
| `idx_boq_categories_doc_parent`            | `boq_categories`               | `(document_id, parent_gaeb_id)`                           |
| `idx_boq_items_document_id`                | `boq_items`                    | `document_id`                                             |
| `idx_boq_items_category_gaeb_id`           | `boq_items`                    | `category_gaeb_id`                                        |
| `idx_boq_items_doc_category`               | `boq_items`                    | `(document_id, category_gaeb_id)`                         |
| `idx_canonical_categories_tree`            | `canonical_categories`         | `(document_structure_id, parent_category_id, sort_order)` |
| `idx_canonical_items_tree`                 | `canonical_items`              | `(document_structure_id, parent_category_id, sort_order)` |
| `idx_canonical_items_source`               | `canonical_items`              | `source_item_id`                                          |
| `idx_document_structures_created_by`       | `document_structures`          | `created_by`                                              |
| `idx_document_structure_events_timeline`   | `document_structure_events`    | `(document_structure_id, created_at DESC)`                |
| `idx_work_packages_structure_status`       | `work_packages`                | `(document_structure_id, status)`                         |
| `idx_work_package_items_canonical`         | `work_package_items`           | `canonical_item_id`                                       |
| `idx_outbound_requests_work_package`       | `outbound_requests`            | `work_package_id`                                         |
| `idx_outbound_snapshot_categories_request` | `outbound_snapshot_categories` | `outbound_request_id`                                     |
| `idx_outbound_snapshot_items_request`      | `outbound_snapshot_items`      | `outbound_request_id`                                     |

## Seed data

`supabase/seed.sql` provisions test users (`test@catena.example.com`, `test1`–`test4`, password `TestPassword123!`) and a small set of sample projects (with fixed UUIDs for BDD test isolation) owned by the primary test user. Loaded after migrations on `supabase db reset` / `npm run db:seed`. Not run in production.
