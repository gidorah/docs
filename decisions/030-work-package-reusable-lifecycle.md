---
title: "ADR-030: Give `work_package` Its Own Reusable Lifecycle"
description: "Package readiness is conceptually different from sending, receiving, or responding. Combining those concerns into one lifecycle would muddle the model."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000008_work_packages.sql
---


## ADR-030: Give `work_package` Its Own Reusable Lifecycle

### Context

Package readiness is conceptually different from sending, receiving, or responding. Combining those concerns into one lifecycle would muddle the model.

### Decision

Give `work_package` its own status, such as `draft`, `ready`, and `archived`.

### Consequences

_Not stated in original TD-030._

### Implementation notes

`work_package_status` enum (`draft`, `ready`, `archived`) is defined at `20260408000008` lines 9-17 and bound to `work_packages.status` at line 37. Archive bookkeeping columns `archived_at` / `archived_by` (lines 38-39) support the `archived` transition without hard-deleting the row.
