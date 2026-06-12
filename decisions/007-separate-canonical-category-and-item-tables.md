---
title: "ADR-007: Use Separate Tables for `canonical_category` and `canonical_item`"
description: "Categories and items have materially different invariants. Items need hard lineage to source items. Categories need recursive relationships and optional provenance. Separate tab..."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-007: Use Separate Tables for `canonical_category` and `canonical_item`

### Context

Categories and items have materially different invariants. Items need hard lineage to source items. Categories need recursive relationships and optional provenance. Separate tables keep constraints and service logic simpler.

### Decision

Model the editable tree with separate `canonical_category` and `canonical_item` tables instead of a unified polymorphic node table.

### Consequences

_Not stated in original TD-007._

### Implementation notes

`20260408000002_canonical_categories_and_items.sql` defines `canonical_categories` (recursive `parent_category_id` self-reference, optional `source_category_id` → `boq_categories`) and `canonical_items` (NOT NULL `source_item_id` → `boq_items`, `parent_category_id` → `canonical_categories`) as distinct tables.
