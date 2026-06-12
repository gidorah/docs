---
title: "ADR-014: Make `canonical_item` Non-Deletable in MVP"
description: "Each canonical item is the editable counterpart of a source item. Deleting it would weaken the one-source-item, one-canonical-item traceability invariant and complicate coverage..."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000007_mutation_invariants.sql
---


## ADR-014: Make `canonical_item` Non-Deletable in MVP

### Context

Each canonical item is the editable counterpart of a source item. Deleting it would weaken the one-source-item, one-canonical-item traceability invariant and complicate coverage logic.

### Decision

Do not allow deletion of `canonical_item` rows in MVP.

### Consequences

_Not stated in original TD-014._

### Implementation notes

`20260408000007_mutation_invariants.sql` documents that no DELETE RLS policy is granted on `canonical_items`, blocking item deletion at the policy layer (RLS in `20260408000004_canonical_rls_policies.sql`).
