---
title: "ADR-029: Separate `work_package` From `outbound_request`"
description: "The same package may be sent to multiple subcontractors. The package is the reusable scope definition; the outbound request is the communication and response lifecycle."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000009_outbound_boundary.sql
---


## ADR-029: Separate `work_package` From `outbound_request`

### Context

The same package may be sent to multiple subcontractors. The package is the reusable scope definition; the outbound request is the communication and response lifecycle.

### Decision

Model the reusable work package separately from the event of sending it to a subcontractor.

### Consequences

_Not stated in original TD-029._

### Implementation notes

`work_packages` lives in `20260408000008_work_packages.sql`; `outbound_requests` is a distinct table in `20260408000009_outbound_boundary.sql` (lines 77-93) that references `work_package_id`. The two have independent lifecycles (`work_package_status` vs. `outbound_request_status`) and independent RLS policies.
