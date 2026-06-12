---
title: "ADR-011: Keep Canonical Item Text Editable and Separate From Source Text"
description: "Subcontractor-facing wording needs to be editable. Traceability should rely on explicit lineage, not on matching the live business text back to source text."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-011: Keep Canonical Item Text Editable and Separate From Source Text

### Context

Subcontractor-facing wording needs to be editable. Traceability should rely on explicit lineage, not on matching the live business text back to source text.

### Decision

Store editable business-facing title and description on `canonical_item`, while keeping source text immutable in the source layer.

### Consequences

_Not stated in original TD-011._

### Implementation notes

`canonical_items` carries its own editable `title` and `description` columns in `20260408000002`. Source text lives on `boq_items` and is held immutable by ADR-002's `trg_boq_items_immutable` trigger (`20260403000002_source_immutability.sql`).
