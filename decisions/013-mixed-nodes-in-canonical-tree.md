---
title: "ADR-013: Allow Mixed Nodes in the Canonical Tree"
description: "The product examples and intended editing behavior require a mixed tree. A leaf-only category rule would simplify the model, but it would not match the intended user workflow."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-013: Allow Mixed Nodes in the Canonical Tree

### Context

The product examples and intended editing behavior require a mixed tree. A leaf-only category rule would simplify the model, but it would not match the intended user workflow.

### Decision

Allow a `canonical_category` to have child categories, direct items, or both at the same time.

### Consequences

_Not stated in original TD-013._

### Implementation notes

Schema in `20260408000002` places no constraint forbidding a `canonical_category` from having both child categories (via `canonical_categories.parent_category_id` self-reference) and direct child items (via `canonical_items.parent_category_id`). The mixed shape is permitted by structure alone; nothing in `20260408000007_mutation_invariants.sql` (documentation-only) rejects it either.
