---
title: "ADR-021: Store Review or Override State in the Editable Layer Without Recalculating Confidence"
description: "This keeps transparency without inventing a weak recalculation model. It also matches the unresolved product discussions around post-edit confidence."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000005_review_audit_columns.sql
---


## ADR-021: Store Review or Override State in the Editable Layer Without Recalculating Confidence

### Context

This keeps transparency without inventing a weak recalculation model. It also matches the unresolved product discussions around post-edit confidence.

### Decision

Store review and override state on editable records, but do not generate a new confidence score after structural edits in MVP.

### Consequences

_Not stated in original TD-021._

### Implementation notes

`canonical_items.review_state` (enum `pending | approved | overridden`) is added in `20260408000005` lines 39-52 (replacing the placeholder `TEXT` column from `20260408000002`). `canonical_items.is_user_modified BOOLEAN NOT NULL DEFAULT false` lands at line 64 of the same migration. No recalculation logic exists; the COMMENT at lines 80-81 explicitly states confidence is "Not recalculated after edits."
