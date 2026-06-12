---
title: "ADR-009: Allow Optional Category Provenance via `source_category_id`"
description: "Category provenance is useful for seeding, audit, and context. It is not stable enough to be the main traceability mechanism once categories are merged, moved, or custom categor..."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-009: Allow Optional Category Provenance via `source_category_id`

### Context

Category provenance is useful for seeding, audit, and context. It is not stable enough to be the main traceability mechanism once categories are merged, moved, or custom categories are added.

### Decision

Let `canonical_category` optionally reference an originating `source_category_id`, but do not make category-to-category lineage a hard invariant.

### Consequences

_Not stated in original TD-009._

### Implementation notes

`canonical_categories.source_category_id` is a nullable foreign key in `20260408000002`, allowing user-created categories to have no source provenance while bootstrapped ones retain the link.
