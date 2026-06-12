---
title: "ADR-004: Support One `document_structure` Per Source Document in MVP"
description: "This keeps the model simple while still leaving room for later revisioning or alternate structures through the `document_structure` abstraction."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000001_canonical_enums_and_document_structures.sql
---


## ADR-004: Support One `document_structure` Per Source Document in MVP

### Context

This keeps the model simple while still leaving room for later revisioning or alternate structures through the `document_structure` abstraction.

### Decision

In MVP, a source document has one active editable `document_structure`.

### Consequences

_Not stated in original TD-004._

### Implementation notes

`document_structures` carries `CONSTRAINT uq_document_structures_document UNIQUE (document_id)` (see `20260408000001`), enforcing the MVP one-per-document rule at the database level.
