---
title: "Frontend architecture"
description: "When to use a Server Component vs a Client Component, and the conventions specific to `apps/dashboard`."
---

# Frontend architecture

When to use a Server Component vs a Client Component, and the conventions specific to `apps/dashboard`.

This page covers **RSC patterns, route groups, and dashboard conventions**. The runtime and data-flow picture lives in [`architecture.md`](/explanation/architecture); they are intentionally disjoint.

## React Server Components — the default

Every component under `apps/dashboard/src/app/` is a **Server Component** unless it opts out with `"use client"` at the top of the file.

A Server Component:

- Runs on the Node server during the request, never in the browser.
- Can read directly from Supabase using the SSR client (`@/lib/supabase/server`) — no API round-trip.
- Cannot use browser APIs (`window`, `localStorage`), React hooks (`useState`, `useEffect`), or event handlers (`onClick`).
- Cannot receive arbitrary **functions** as props (callbacks don't serialize across the boundary). Server Actions are the deliberate exception: they are functions, but Next.js serializes them via a special protocol so they can be passed into Client Components as props.

If you only need to render data, leave the component on the server.

## Client Components — opt in deliberately

Add `"use client"` only when one of these is true:

- The component uses interactivity (`onClick`, `onChange`, form state).
- It uses React hooks (`useState`, `useEffect`, `useTransition`).
- It needs browser-only APIs.
- It uses a third-party library that itself requires the client (charts, drag-and-drop, certain shadcn/ui primitives).

The `"use client"` directive must be the **first line** of the file (above imports). It marks not just that file but every module it imports as part of the client bundle, so place it deliberately at leaf interactive components rather than at the top of large trees:

```tsx
"use client";

import { useState } from "react";
// …
```

Note on translations: in this codebase, Client Components call `useTranslations()` from `next-intl`, while Server Components import `getTranslations()` from `next-intl/server`. Needing a translation is therefore not a reason to add `"use client"` — switch to the server API instead.

## The boundary rule

> Pass **data**, not **functions**, across the server → client boundary.

A Server Component fetching data and rendering a Client Component that handles interactions is the canonical pattern. The Client Component then calls a Server Action (`src/app/actions/`) or an API route (`src/app/api/`) for mutations — never a function passed from the parent.

## shadcn/ui — no hand-rolled equivalents

Shadcn/ui is wired up via `components.json` (style: `new-york`, base color: `neutral`, RSC enabled). Lucide is the icon library. Components are added with `pnpm dlx shadcn@latest add <name>` and live under `src/components/ui/`.

Decision: ADR-037 (no hand-rolled components) — if a primitive exists in shadcn/ui or Radix, use it. To add one, see [`../how-to/add-a-shadcn-component.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-a-shadcn-component.md).

## Route groups under `[locale]`

The App Router tree is wrapped by a `[locale]` segment for next-intl, then split into three route groups:

```
src/app/
├── layout.tsx                    # root html / metadata
├── api/                          # API routes (no [locale])
├── actions/                      # Server Actions
├── auth/                         # auth callbacks (no [locale])
└── [locale]/
    ├── layout.tsx                # i18n provider, theme
    ├── (auth)/                   # signin, signup, password reset
    │   ├── _components/          # shared auth UI
    │   ├── layout.tsx
    │   └── v1/
    ├── (main)/                   # authenticated app surface
    │   ├── layout.tsx            # nav, sidebar, auth gate
    │   ├── dashboard/
    │   └── unauthorized/
    └── (external)/               # public landing
        └── page.tsx
```

Route groups (parenthesized segments) **do not appear in URLs**. They group routes by layout and auth requirement:

| Group        | Auth     | Purpose                                            |
| ------------ | -------- | -------------------------------------------------- |
| `(auth)`     | guest    | Sign-in, sign-up, password recovery flows.         |
| `(main)`     | required | The authenticated dashboard, projects, settings.   |
| `(external)` | public   | Marketing / landing pages reachable without login. |

Auth is enforced in two places:

1. **`apps/dashboard/src/proxy.ts`** (Next.js 16's renamed middleware). For locale-prefixed pages it refreshes the Supabase session cookie and redirects unauthenticated visitors to `/[locale]/v1/login`. Auth pages under `/[locale]/v1/*` and the password-update flow are exempt.
2. **`(main)/layout.tsx`**. Server layout calls `supabase.auth.getUser()` and redirects to login when no session is present — defense in depth on top of the proxy for dashboard routes.

**API routes, auth callbacks, and the Sentry tunnel never run through `proxy`.** The `config.matcher` excludes paths starting with `api/`, `auth/`, or `monitoring/` (segment-boundary safe: `/apiary` still matches the proxy). Route handlers perform their own auth; multipart bodies must reach handlers without the proxy reading them first. See [`document-ingest-pipeline.md`](/explanation/document-ingest-pipeline) and [`../how-to/add-an-api-route.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-an-api-route.md).

The `(main)/unauthorized` page is for in-app access-denied messaging (e.g. role-based blocks), not for the not-signed-in case.

## Key directories under the dashboard

| Path                              | Role                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `src/app/[locale]/`               | Locale-scoped UI tree (the three route groups above).                             |
| `src/app/api/`                    | API routes — see [`../reference/api-routes.md`](https://github.com/gidorah/catena/blob/dev/reference/api-routes.md).      |
| `src/app/actions/`                | Server Actions called from Client Components for mutations.                       |
| `src/components/ui/`              | shadcn/ui primitives (managed via `components.json`).                             |
| `src/components/`                 | Catena-specific composite components.                                             |
| `src/lib/supabase/`               | Three Supabase clients — see [`../how-to/add-a-supabase-client.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-a-supabase-client.md). |
| `src/lib/document-parser.ts`      | Wraps `@catena/gaeb-parser` for project prefill.                                  |
| `src/i18n/`, `locales/`           | next-intl configuration and translation bundles (`locales/en/`, `locales/de/`).   |
| `__tests__/`                      | Playwright specs (see [`testing-philosophy.md`](/explanation/testing-philosophy)).          |

## Adding a page

The mechanical steps live in [`../how-to/add-a-dashboard-page.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-a-dashboard-page.md). Conceptually: pick the route group that matches the auth requirement, default to a Server Component, and reach for a Client Component only when one of the four triggers above applies.
