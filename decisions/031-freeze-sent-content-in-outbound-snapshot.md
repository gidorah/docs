---
title: "ADR-031: Freeze Sent Content in an `outbound_request` Snapshot"
description: "Past sends must remain stable even if the live canonical tree or work package changes later. This is necessary for accountability, response comparison, and auditability."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000009_outbound_boundary.sql
---


## ADR-031: Freeze Sent Content in an `outbound_request` Snapshot

### Context

Past sends must remain stable even if the live canonical tree or work package changes later. This is necessary for accountability, response comparison, and auditability.

### Decision

Every outbound send creates a frozen snapshot of the categories, items, wording, and lineage that were sent at that moment.

### Consequences

_Not stated in original TD-031._

### Implementation notes

`outbound_snapshot_categories` and `outbound_snapshot_items` are defined in `20260408000009` lines 106-153. Both copy the human-readable content (`title`, `description`, `quantity`, `unit`) at write time and carry lineage references (`canonical_item_id`, `source_item_id` on the items table; `parent_snapshot_category_id` on the categories table). The RLS policy block (lines 175 onward) restricts these tables to SELECT + INSERT — UPDATE/DELETE are prohibited so past sends remain immutable.
