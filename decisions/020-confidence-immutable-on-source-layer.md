---
title: "ADR-020: Keep Confidence Immutable on the Source Layer"
description: "Source confidence reflects the original system proposal. Rewriting it after manual edits would blur the distinction between machine output and user-approved business changes."
status: Accepted
date: 2026-03-18
implementation: partial
implemented-in: supabase/migrations/20260408000005_review_audit_columns.sql
---


## ADR-020: Keep Confidence Immutable on the Source Layer

### Context

Source confidence reflects the original system proposal. Rewriting it after manual edits would blur the distinction between machine output and user-approved business changes.

### Decision

Preserve original AI confidence on the source layer and do not overwrite or recalculate it after user edits.

### Consequences

_Not stated in original TD-020._

### Implementation notes

The current `ai_confidence DECIMAL` column lives on `canonical_categories` (`20260408000005` lines 76-81), not on the source-layer tables (`boq_categories`, `boq_items` carry no confidence column). The migration's `COMMENT ON COLUMN` cites TD-020/TD-021 and states the value is "Not recalculated after edits" — so the immutability spirit of TD-020 is honored, but the storage location diverges from "source layer." This location mismatch should be reconciled by either (a) moving / mirroring confidence onto the source layer, or (b) superseding TD-020 with an ADR that records the editable-layer-with-immutability decision. Surfaced for SME review.
