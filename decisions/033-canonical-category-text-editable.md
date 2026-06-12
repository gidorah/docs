---
title: "ADR-033: Keep Canonical Category Text Editable and Separate From Source Text"
description: "Users reshape category meaning through rename, merge, move, and manual category creation. Canonical categories therefore need their own editable business text without mutating t..."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-033: Keep Canonical Category Text Editable and Separate From Source Text

### Context

Users reshape category meaning through rename, merge, move, and manual category creation. Canonical categories therefore need their own editable business text without mutating the parsed source hierarchy.

### Decision

Store editable business-facing name and description on `canonical_category`, while keeping any parsed source category text immutable in the source layer.

### Consequences

_Not stated in original TD-033._

### Implementation notes

`canonical_categories` carries its own `name TEXT NOT NULL` and `description TEXT` columns (`20260408000002` lines 37-38), independent of any source-layer text. Source-layer immutability is enforced by the `trg_boq_categories_immutable` and `trg_boq_items_immutable` triggers in `20260403000002_source_immutability.sql` (lines 25 and 30), which call `prevent_source_row_update()` BEFORE UPDATE on the source tables.
