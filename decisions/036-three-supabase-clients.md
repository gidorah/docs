---
title: "ADR-036: Three Supabase Clients, Not One"
description: "The dashboard runs in three distinct execution contexts: the browser (React Server Components hydration + client components), the Next.js server runtime (route handlers, server ..."
status: Accepted
date: 2026-05-01
implementation: shipped
implemented-in: apps/dashboard/src/lib/supabase/
---


## ADR-036: Three Supabase Clients, Not One

### Context

The dashboard runs in three distinct execution contexts: the browser (React Server Components hydration + client components), the Next.js server runtime (route handlers, server components, server actions), and privileged server-only operations (admin tasks that must bypass RLS). Each context has different auth requirements, different cookie semantics, and a different correct URL — the self-hosted topology in particular needs an internal `kong` URL on the server side and a public URL in the browser.

### Decision

Maintain three separate Supabase clients, one per context, and never collapse them:

- **`src/lib/supabase/client.ts`** — browser client; uses `NEXT_PUBLIC_SUPABASE_URL` + anon key.
- **`src/lib/supabase/server.ts`** — SSR client bound to Next.js cookies; **prefers `SUPABASE_URL`** (internal network URL, e.g. `http://kong:8000`) and falls back to `NEXT_PUBLIC_SUPABASE_URL`. Supports a `rememberMe` flag that toggles between 30-day and session cookies.
- **`src/lib/supabase/admin.ts`** — service-role client for privileged server-side work. Never imported from client code.

### Consequences

- **Load-bearing URL split.** `SUPABASE_URL` (server) vs. `NEXT_PUBLIC_SUPABASE_URL` (browser) is required for self-hosted deploys (ADR-034). Collapsing them breaks server-to-Supabase connectivity inside the Coolify network.
- **Three import paths to learn**, but the audience surface (server vs. browser vs. admin) is the same shape developers reason about anyway.
- **Bug class avoided.** Accidental import of the admin client into a client component would leak the service-role key — keeping `admin.ts` out of any module that the bundler will ship to the browser is the discipline this split makes mechanical.

### Implementation notes

The three files exist at the paths named above. Conventions for choosing among them and for adding a fourth (e.g. an edge-runtime client) live in `docs/how-to/add-a-supabase-client.md`.
