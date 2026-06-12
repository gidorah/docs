---
title: "ADR-024: Require Full Coverage at the Reply-Ready End State"
description: "Temporary gaps are acceptable during drafting, but the system cannot safely fill the original invite-to-offer unless all source items have been packaged by the end-state."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000009_outbound_boundary.sql
---


## ADR-024: Require Full Coverage at the Reply-Ready End State

### Context

Temporary gaps are acceptable during drafting, but the system cannot safely fill the original invite-to-offer unless all source items have been packaged by the end-state.

### Decision

Before the source document can be treated as fully packaged and reply-ready, every source item must be covered by at least one work package.

### Consequences

_Not stated in original TD-024._

### Implementation notes

`check_coverage(p_document_structure_id UUID)` is defined in `20260408000009` lines 302-328 and revised in `20260408000011_fix_check_coverage_column.sql` lines 8-36 to rename the misleading column. The function reports per-source-item coverage; the reply-ready gate (callers blocking finalization on uncovered items) is the consuming service-layer surface that builds on this primitive.
