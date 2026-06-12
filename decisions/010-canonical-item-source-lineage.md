---
title: "ADR-010: Make `canonical_item` a First-Class Editable Record With 1:1 Source Lineage"
description: "This gives the system a stable editable counterpart for every source line while keeping item-level traceability trivial and explicit."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-010: Make `canonical_item` a First-Class Editable Record With 1:1 Source Lineage

### Context

This gives the system a stable editable counterpart for every source line while keeping item-level traceability trivial and explicit.

### Decision

Each `canonical_item` is a first-class editable record that maps to exactly one `source_item`.

### Consequences

_Not stated in original TD-010._

### Implementation notes

`canonical_items.source_item_id` is NOT NULL and references `boq_items` in `20260408000002`. A `UNIQUE (document_structure_id, source_item_id)` constraint in the same file enforces the 1:1 invariant per structure (no two canonical items in one structure can share a source item).
