---
title: "ADR-042: Supabase Storage Bootstrap Before App Migrator"
description: "ADR-039 made the Compose migrator the application-migration path and required"
status: Accepted
date: 2026-05-18
implementation: shipped
implemented-in: docker-compose.yml + docker/migrations/
---


## ADR-042: Supabase Storage Bootstrap Before App Migrator

### Context

ADR-039 made the Compose migrator the application-migration path and required
schema-dependent entrypoints to wait for it. That dependency is correct for
public traffic, but Supabase Storage bootstraps `storage.buckets` and
`storage.objects` through PostgREST during local/self-hosted startup. If PostgREST
waits for the app migrator while Storage waits for PostgREST, the deployment graph
can deadlock before migrations can create storage policies or bucket data.

### Decision

PostgREST may start before the app migrator as an internal dependency needed for
Supabase Storage bootstrap. Public API traffic still waits behind Kong, and Kong
depends on the migrator completing successfully. The migrator sends `NOTIFY pgrst,
'reload schema'` after application migrations complete so PostgREST refreshes its
schema cache before public traffic is routed.

### Consequences

- **Gained:** Storage can initialize the Supabase-owned `storage` schema before app migrations run.
- **Gained:** failed app migrations still block public Kong-routed traffic.
- **Required:** public entrypoints, including Kong and dashboard, must depend on the migrator rather than assuming internal service readiness is sufficient.
- **Risk:** internal services can briefly observe a pre-app-migration schema; they must not be exposed as public app entrypoints before Kong is released.

### Implementation notes

Implemented by allowing `rest` to depend on `db` and `analytics`, making `migrator`
depend on healthy `storage`, and making `kong` plus `dashboard` wait for
`migrator` completion in `docker-compose.yml`.
