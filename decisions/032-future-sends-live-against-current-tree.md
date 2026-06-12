---
title: "ADR-032: Keep Future Sends Live Against the Current Canonical Tree and Work Package Membership"
description: "This keeps the live model coherent without forcing work packages to store their own copied text or tree structure. The frozen snapshot is the correct boundary for historical sta..."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000009_outbound_boundary.sql
---


## ADR-032: Keep Future Sends Live Against the Current Canonical Tree and Work Package Membership

### Context

This keeps the live model coherent without forcing work packages to store their own copied text or tree structure. The frozen snapshot is the correct boundary for historical stability.

### Decision

A work package remains a live subset of the current canonical tree. Future sends use the current tree and current membership, while past sends remain frozen in their snapshots.

### Consequences

_Not stated in original TD-032._

### Implementation notes

`work_packages.document_structure_id` references the live structure (`20260408000008` lines 33-34); `work_package_items.canonical_item_id` references the live canonical row (lines 73-75). No copy of category/item text exists on the package side. Snapshot copies are confined to `outbound_snapshot_categories` and `outbound_snapshot_items` (`20260408000009` lines 106-153), which sit downstream of `outbound_requests` rather than `work_packages` — so each new send draws from the current tree state.
