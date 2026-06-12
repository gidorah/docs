---
title: "ADR-012: Do Not Support Item-Level Consolidation or Split Allocation in MVP"
description: "This keeps the lineage model simple and keeps the future `A -> B` migration isolated to the item-allocation layer rather than forcing broader redesign."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-012: Do Not Support Item-Level Consolidation or Split Allocation in MVP

### Context

This keeps the lineage model simple and keeps the future `A -> B` migration isolated to the item-allocation layer rather than forcing broader redesign.

### Decision

In MVP, a `canonical_item` is only a moved or renamed version of one `source_item`. Do not support many-source consolidation into one canonical item or splitting one source item across multiple canonical items.

### Consequences

_Not stated in original TD-012._

### Implementation notes

The 1:1 lineage is enforced structurally in `20260408000002` via a single NOT NULL `source_item_id` plus `UNIQUE (document_structure_id, source_item_id)` — schema shape alone makes consolidation and split impossible. `20260408000007_mutation_invariants.sql` is a documentation-only migration (no DDL; ends in `SELECT 1; -- no-op`) that records the service-layer rules surrounding these structural constraints.
