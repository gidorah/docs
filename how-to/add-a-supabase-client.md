---
title: "Choose a Supabase client"
description: "How to pick the right Supabase client for the code you're writing. Catena ships **three** clients on purpose, and they are not interchangeable. The split is locked in by [ADR-03..."
---

# Choose a Supabase client

How to pick the right Supabase client for the code you're writing. Catena ships **three** clients on purpose, and they are not interchangeable. The split is locked in by [ADR-036](https://github.com/gidorah/catena/blob/dev/decisions/036-three-supabase-clients.md); read that for the _why_. This page is the _how_.

## The three clients

| File                         | Context                                              | Auth                                     | URL env                                                              |
| ---------------------------- | ---------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `src/lib/supabase/client.ts` | Browser (Client Components)                          | Anon key, user session via cookie        | `NEXT_PUBLIC_SUPABASE_URL`                                           |
| `src/lib/supabase/server.ts` | Next.js server (RSC, route handlers, server actions) | Anon key + user session via Next cookies | `SUPABASE_URL` (preferred), falls back to `NEXT_PUBLIC_SUPABASE_URL` |
| `src/lib/supabase/admin.ts`  | Privileged server-only                               | **Service role key** (bypasses RLS)      | `SUPABASE_URL`, falls back to `NEXT_PUBLIC_SUPABASE_URL`             |

## Decision flow

```
Where does this code run?
├── Browser (file has "use client" or is imported by one)
│   └── client.ts — createClient()
├── Server, on behalf of the signed-in user (route handler, RSC, server action)
│   ├── Needs RLS to apply (most cases) → server.ts — await createClient()
│   └── Needs to bypass RLS (background jobs, audit reads, cross-user admin) → admin.ts — supabaseAdmin
```

The default is `server.ts`. Reach for `admin.ts` only when you have a concrete reason RLS can't apply (running outside any user request, or doing administrative work the signed-in user is not authorized for at the row level).

## Calling each one

**`client.ts`** — synchronous factory, called once per component (or memoized in a context):

```tsx
"use client";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
```

**`server.ts`** — `async` because it reads Next.js cookies:

```ts
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // …
}
```

The `rememberMe` flag toggles 30-day vs session cookies. Default is `true`. Pass `false` from the login flow when the user opted out of "remember me."

**`admin.ts`** — exported as a Proxy with lazy initialization, no factory call needed:

```ts
import { supabaseAdmin } from "@/lib/supabase/admin";

const { data, error } = await supabaseAdmin.from("projects").select("*");
```

The lazy init is deliberate — it keeps build-time imports from blowing up when the service role key isn't set, such as local builds without `.env.local`.

## Common mistakes

- **Importing `admin.ts` from a Client Component.** The bundler will ship the service role key to the browser. The only safe importers are server-only files (route handlers, server actions, RSC). If you find yourself reaching for `admin.ts` in a `"use client"` tree, the right move is to wrap the privileged call in a server action and import that instead.
- **Collapsing the URL split.** Self-hosted deployments (Coolify) put Kong on an internal Docker network at `http://kong:8000`, which the browser can't reach. The server reads `SUPABASE_URL` (internal) and the browser reads `NEXT_PUBLIC_SUPABASE_URL` (public, e.g. `https://supabase.example.com`). Never set them to the same value in self-hosted; never read `NEXT_PUBLIC_SUPABASE_URL` from server code without the `SUPABASE_URL ?? ` fallback.
- **Calling `server.ts` outside a request.** It reads `cookies()` from `next/headers`, which only works during a request lifecycle. For background work (cron jobs, scripts), use `admin.ts`.
- **Reusing a server client across requests.** `createClient()` in `server.ts` is per-request — it binds to the cookie store of _this_ request. Don't cache it module-level.

## Adding a fourth client

**Don't, without an ADR amending [ADR-036](https://github.com/gidorah/catena/blob/dev/decisions/036-three-supabase-clients.md).** The split exists for mechanical safety — collapsing or extending the existing clients to cover a new context defeats the point. The only plausible future candidate is an **edge-runtime client** for middleware, and today the middleware uses Supabase only for `getSession()` cookie reads, which already work via `server.ts`-style wiring. If you genuinely need a new context, mirror the pattern (one file under `src/lib/supabase/`, one named export, one ADR explaining why the new context isn't covered by the existing three) — never extend an existing client to wear two hats.

## Cross-references

- [ADR-036: Three Supabase clients, not one](https://github.com/gidorah/catena/blob/dev/decisions/036-three-supabase-clients.md) — rationale.
- [`how-to/add-an-api-route.md`](/how-to/add-an-api-route) — the canonical auth pattern for server routes that use `server.ts`.
