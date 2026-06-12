---
title: "ADR-005: Materialize the Editable Category Tree Eagerly"
description: "Starting from a full editable working copy simplifies rendering, movement, merge behavior, and future package derivation. A sparse overlay would complicate almost every write path."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000006_canonical_bootstrap.sql
---


## ADR-005: Materialize the Editable Category Tree Eagerly

### Context

Starting from a full editable working copy simplifies rendering, movement, merge behavior, and future package derivation. A sparse overlay would complicate almost every write path.

### Decision

When a `document_structure` is created, eagerly create `canonical_category` records by copying the parsed source category hierarchy.

### Consequences

_Not stated in original TD-005._

### Implementation notes

`bootstrap_canonical_structure` in `20260408000006_canonical_bootstrap.sql` walks the source category tree at structure creation and inserts a `canonical_category` row for each source node, preserving the parent/child relationships and recording `source_category_id` provenance.
