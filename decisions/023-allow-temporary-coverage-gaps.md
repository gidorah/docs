---
title: "ADR-023: Allow Temporary Coverage Gaps During Drafting"
description: "Users prepare multiple packages over time. Requiring complete package coverage at every intermediate step would make the workflow brittle and slower than the real business process."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000008_work_packages.sql
---


## ADR-023: Allow Temporary Coverage Gaps During Drafting

### Context

Users prepare multiple packages over time. Requiring complete package coverage at every intermediate step would make the workflow brittle and slower than the real business process.

### Decision

Allow source items to remain outside any work package while users are still preparing packages incrementally.

### Consequences

_Not stated in original TD-023._

### Implementation notes

`work_package_items` (`20260408000008` lines 71-81) carries no constraint requiring every `canonical_item` (or its `source_item_id`) to appear in at least one package row. Membership is opt-in; uncovered items are the default state until the reply-ready gate (TD-024 / ADR-024) is checked.
