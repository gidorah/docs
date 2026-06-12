---
title: "ADR-027: Derive Work Package Categories From Selected Items and Their Ancestors"
description: "This matches the intended user workflow while keeping package structure consistent with the live canonical tree."
status: Accepted
date: 2026-03-18
implementation: partial
implemented-in: supabase/migrations/20260408000008_work_packages.sql
---


## ADR-027: Derive Work Package Categories From Selected Items and Their Ancestors

### Context

This matches the intended user workflow while keeping package structure consistent with the live canonical tree.

### Decision

The package tree shown to a subcontractor is derived by taking selected canonical items and including the ancestor categories needed to render the subset tree.

### Consequences

_Not stated in original TD-027._

### Implementation notes

The architectural commitment is locked in by the absence of a `work_package_categories` table (see ADR-026) and is documented in the design comments at `20260408000008` lines 22-26 and 56-58. No derivation function (e.g. `get_work_package_tree`) exists yet in `supabase/migrations/` or `apps/dashboard/src/`; consumers will compute the ancestor walk when the split UI lands.
