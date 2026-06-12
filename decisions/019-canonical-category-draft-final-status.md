---
title: "ADR-019: Give `canonical_category` a `draft` and `final` Status"
description: "The user stories explicitly mention category status, and category-level readiness is useful even when item-level status is not yet modeled."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-019: Give `canonical_category` a `draft` and `final` Status

### Context

The user stories explicitly mention category status, and category-level readiness is useful even when item-level status is not yet modeled.

### Decision

`canonical_category` records carry their own `draft` or `final` status in MVP.

### Consequences

_Not stated in original TD-019._

### Implementation notes

`canonical_categories.status canonical_category_status NOT NULL DEFAULT 'draft'` is declared at line 39 of `20260408000002_canonical_categories_and_items.sql`. The enum (`draft`, `final`) is defined in `20260408000001_canonical_enums_and_document_structures.sql` lines 24-26.
