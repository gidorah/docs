---
title: "ADR-016: Use Current-State Tables With Lightweight Audit Logging"
description: "This is the lowest-complexity design that still supports accountability. It keeps the write model simple while preserving enough history for troubleshooting and review."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000003_document_structure_events.sql
---


## ADR-016: Use Current-State Tables With Lightweight Audit Logging

### Context

This is the lowest-complexity design that still supports accountability. It keeps the write model simple while preserving enough history for troubleshooting and review.

### Decision

Model the live editable state with current-state tables plus lightweight audit or event logging. Do not implement a full revision or event-sourced model in MVP.

### Consequences

_Not stated in original TD-016._

### Implementation notes

The canonical tables (`canonical_categories`, `canonical_items`) hold current state. `canonical_items` carries item-level `reviewed_at` / `reviewed_by` columns in `20260408000002_canonical_categories_and_items.sql`; `canonical_categories` does not have item-level review columns. `20260408000003_document_structure_events.sql` adds a `document_structure_events` table for lightweight event logging; `20260408000005_review_audit_columns.sql` layers in additional review fields (`origin`, `review_state` enum, `is_user_modified`, `ai_confidence`).
