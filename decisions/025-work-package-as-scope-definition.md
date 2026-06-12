---
title: "ADR-025: Model `work_package` as a Reusable Scope Definition Over the Canonical Tree"
description: "The canonical manipulated tree is the single editable truth for the document. Work packages only select and reuse parts of that truth."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000008_work_packages.sql
---


## ADR-025: Model `work_package` as a Reusable Scope Definition Over the Canonical Tree

### Context

The canonical manipulated tree is the single editable truth for the document. Work packages only select and reuse parts of that truth.

### Decision

A `work_package` is not its own editable tree. It is a reusable scope definition over the live canonical tree.

### Consequences

_Not stated in original TD-025._

### Implementation notes

The `work_packages` table (`20260408000008` lines 31-44) carries no tree columns; membership is delegated to `work_package_items` (lines 71-81), which references `canonical_items.id` directly. There is no parallel tree storage, no copies of category/item text — work packages are pure selections over the canonical layer.
