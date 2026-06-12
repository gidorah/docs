---
title: "ADR-026: Store Work Package Membership Only at the Item Level"
description: "Category membership can always be derived from selected items and their ancestors. Storing category membership separately would create contradictory states and harder validation."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000008_work_packages.sql
---


## ADR-026: Store Work Package Membership Only at the Item Level

### Context

Category membership can always be derived from selected items and their ancestors. Storing category membership separately would create contradictory states and harder validation.

### Decision

Represent work package membership only through selected `canonical_item` rows. Do not store independent package-category membership.

### Consequences

_Not stated in original TD-026._

### Implementation notes

`work_package_items` (`20260408000008` lines 71-81) holds only `(work_package_id, canonical_item_id)` plus audit columns. No `work_package_categories` table exists; membership at the category level is the absence-by-design that ADR-027 turns into a derivation.
