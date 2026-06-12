---
title: "ADR-022: Keep Quantity and Unit Derived From the Source Item in MVP"
description: "Without true allocation or split behavior, editable quantity and unit would create misleading semantics and complicate reconciliation back to the source tender."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-022: Keep Quantity and Unit Derived From the Source Item in MVP

### Context

Without true allocation or split behavior, editable quantity and unit would create misleading semantics and complicate reconciliation back to the source tender.

### Decision

Do not make quantity or unit freely editable in MVP. Derive them from the linked source item.

### Consequences

_Not stated in original TD-022._

### Implementation notes

`canonical_items` (`20260408000002` lines 86-110) has no `quantity` or `unit` columns; consumers must read those values through `canonical_items.source_item_id` → `boq_items`. The NOT NULL FK at line 94 enforces the lineage that makes derivation total.
