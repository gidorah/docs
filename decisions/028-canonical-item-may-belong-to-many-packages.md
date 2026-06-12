---
title: "ADR-028: Allow a Canonical Item to Belong to Multiple Work Packages"
description: "The same scope may need to be sent to multiple subcontractors or reused across package definitions. Restricting it to one package would not match the intended bidding workflow."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000008_work_packages.sql
---


## ADR-028: Allow a Canonical Item to Belong to Multiple Work Packages

### Context

The same scope may need to be sent to multiple subcontractors or reused across package definitions. Restricting it to one package would not match the intended bidding workflow.

### Decision

A single `canonical_item` may belong to multiple work packages.

### Consequences

_Not stated in original TD-028._

### Implementation notes

`work_package_items` uses the composite primary key `(work_package_id, canonical_item_id)` (`20260408000008` line 80). The PK prevents duplicate rows within a single package while explicitly permitting the same `canonical_item_id` across multiple `work_package_id` values.
