---
title: "ADR-008: Make `canonical_category` a First-Class Editable Record"
description: "Users are shaping the subcontractor-facing structure, not just item placement. Category identity matters, and those edits should not mutate the parsed source category tree."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-008: Make `canonical_category` a First-Class Editable Record

### Context

Users are shaping the subcontractor-facing structure, not just item placement. Category identity matters, and those edits should not mutate the parsed source category tree.

### Decision

Treat `canonical_category` as a first-class editable business record with its own lifecycle fields and metadata.

### Consequences

_Not stated in original TD-008._

### Implementation notes

`canonical_categories` carries its own primary key, status (`canonical_category_status` enum), and editable name/description columns separate from `source_categories` (see `20260408000002`). Review/audit columns are layered on in `20260408000005_review_audit_columns.sql`.
