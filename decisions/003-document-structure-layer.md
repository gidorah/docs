---
title: "ADR-003: Introduce a `document_structure` Layer Between Source Data and the Editable Tree"
description: "This gives the system a clean place for lifecycle, lock/finalization state, future revisions, and processing metadata without overloading the raw source document record."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000001_canonical_enums_and_document_structures.sql
---


## ADR-003: Introduce a `document_structure` Layer Between Source Data and the Editable Tree

### Context

This gives the system a clean place for lifecycle, lock/finalization state, future revisions, and processing metadata without overloading the raw source document record.

### Decision

Add an intermediate `document_structure` entity between the source document and the editable canonical tree.

### Consequences

_Not stated in original TD-003._

### Implementation notes

`document_structures` table is created in `20260408000001_canonical_enums_and_document_structures.sql` with `document_structure_status` enum (`active` / `finalized` / `reopened`) and lifecycle columns (`status`, `is_locked`, `finalized_at`, `finalized_by`).
