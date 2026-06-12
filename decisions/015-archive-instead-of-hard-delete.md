---
title: "ADR-015: Archive Categories and Structural Records Instead of Hard-Deleting Them"
description: "The model intentionally avoids full revision history in MVP. Archival preserves operational history and supports accountability-sensitive edits such as merge and delete without ..."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000002_canonical_categories_and_items.sql
---


## ADR-015: Archive Categories and Structural Records Instead of Hard-Deleting Them

### Context

The model intentionally avoids full revision history in MVP. Archival preserves operational history and supports accountability-sensitive edits such as merge and delete without relying only on the event log.

### Decision

Use archival or soft-delete semantics for removable structural records such as canonical categories and reusable package definitions.

### Consequences

_Not stated in original TD-015._

### Implementation notes

`canonical_categories` carries `archived_at` / `archived_by` columns in `20260408000002`; `work_packages` (`20260408000008_work_packages.sql`) follows the same archival pattern. `20260408000007_mutation_invariants.sql` documents the archive-after-reassignment rule for category removal.
