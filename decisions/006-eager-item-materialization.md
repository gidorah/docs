---
title: "ADR-006: Materialize the Editable Item Layer Eagerly"
description: "Eager item creation keeps coverage checks, package membership, snapshot generation, and mixed-tree rendering straightforward. Lazy creation would add branching logic everywhere."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000006_canonical_bootstrap.sql
---


## ADR-006: Materialize the Editable Item Layer Eagerly

### Context

Eager item creation keeps coverage checks, package membership, snapshot generation, and mixed-tree rendering straightforward. Lazy creation would add branching logic everywhere.

### Decision

When a `document_structure` is created, eagerly create `canonical_item` records for every `source_item`.

### Consequences

_Not stated in original TD-006._

### Implementation notes

`bootstrap_canonical_structure` in `20260408000006_canonical_bootstrap.sql` inserts one `canonical_item` per `source_item` at structure creation, populating `source_item_id` to satisfy ADR-001 traceability.
