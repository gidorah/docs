---
title: "ADR-018: Give the Editable Structure Its Own Lifecycle and Locking Semantics"
description: "Final approval must have operational meaning. If finalization does not change editability, it does not support accountability or controlled handoff."
status: Accepted
date: 2026-03-18
implementation: partial
implemented-in: supabase/migrations/20260408000001_canonical_enums_and_document_structures.sql
---


## ADR-018: Give the Editable Structure Its Own Lifecycle and Locking Semantics

### Context

Final approval must have operational meaning. If finalization does not change editability, it does not support accountability or controlled handoff.

### Decision

The editable structure has its own lifecycle state, and when it is finalized it becomes structurally locked until explicitly reopened.

### Consequences

_Not stated in original TD-018._

### Implementation notes

The `document_structures` table (`20260408000001` lines 50-53) ships the lifecycle columns: `status document_structure_status NOT NULL DEFAULT 'active'`, `is_locked BOOLEAN NOT NULL DEFAULT FALSE`, plus `finalized_at` / `finalized_by`. The enum (`active`, `finalized`, `reopened`) is defined at lines 13-15 of the same migration. The "FINALIZED-STRUCTURE EDIT BLOCKING" service-layer guard documented in `20260408000007_mutation_invariants.sql` (item 3, lines 36-39) is not yet implemented — the schema carries the lock flag but no trigger or service operation enforces edit rejection when `is_locked = true`.
