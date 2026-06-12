---
title: "ADR-002: Keep the Parsed Source Layer Immutable"
description: "The source layer is the legal and operational baseline. Mutable business edits should happen in the editable segmentation layer, not in the parsed record of the incoming tender."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260403000002_source_immutability.sql
---


## ADR-002: Keep the Parsed Source Layer Immutable

### Context

The source layer is the legal and operational baseline. Mutable business edits should happen in the editable segmentation layer, not in the parsed record of the incoming tender.

### Decision

Treat parsed source records as immutable after creation. This applies to the source document, source categories, and source items.

### Consequences

_Not stated in original TD-002._

### Implementation notes

`20260403000002_source_immutability.sql` installs `BEFORE UPDATE` triggers (`trg_boq_categories_immutable`, `trg_boq_items_immutable`) on `boq_categories` and `boq_items`, blocking row mutation after creation. DELETE is intentionally not trigger-blocked (to allow CASCADE) and is held back instead by dropping the user DELETE policies on those tables in the same migration.
