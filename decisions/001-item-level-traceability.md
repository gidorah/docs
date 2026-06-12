---
title: "ADR-001: Treat Item-Level Traceability as a Hard Constraint"
description: "The core feature depends on taking subcontractor responses and mapping them back into the original invite-to-offer structure. If item-level lineage is lost, the main workflow fa..."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-001: Treat Item-Level Traceability as a Hard Constraint

### Context

The core feature depends on taking subcontractor responses and mapping them back into the original invite-to-offer structure. If item-level lineage is lost, the main workflow fails even if package editing is otherwise usable.

### Decision

Preserve explicit lineage from every subcontractor-facing scope item back to the original tender source item throughout segmentation, package creation, sending, and later response reconciliation.

### Consequences

_Not stated in original TD-001._

### Implementation notes

`canonical_items.source_item_id` is a NOT NULL foreign key to `boq_items` in `20260408000002_canonical_categories_and_items.sql`, enforcing 1:1 lineage at the schema level.
