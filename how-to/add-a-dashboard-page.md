---
title: "Add a dashboard page"
description: "How to add a new page to the dashboard following Catena's routing and component conventions."
---

# Add a dashboard page

How to add a new page to the dashboard following Catena's routing and component conventions.

This is a **how-to**, not a Next.js App Router tutorial. It assumes you've worked with route groups and the `app/` directory before.

- It does not cover API routes — see [`add-an-api-route.md`](/how-to/add-an-api-route).
- It does not cover i18n key management in detail — see [`add-user-facing-text.md`](/how-to/add-user-facing-text).

## Route structure

Pages live under `apps/dashboard/src/app/[locale]/`, with three route groups:

```
apps/dashboard/src/app/[locale]/
├── (auth)/v1/                # login, register, forgot-password, update-password
├── (external)/               # public marketing-style surfaces
└── (main)/                   # the authenticated dashboard
    ├── dashboard/            # /dashboard/...
    │   ├── default/page.tsx
    │   ├── projects/
    │   │   ├── page.tsx
    │   │   ├── new/page.tsx
    │   │   └── [id]/page.tsx
    │   └── ...
    └── unauthorized/page.tsx
```

Pick the group based on **who's allowed in**:

- `(auth)` — no session required. Login flow.
- `(external)` — no session required. Public surfaces.
- `(main)` — session required. Unauthenticated requests are redirected to login by `apps/dashboard/src/proxy.ts` (Next.js 16's renamed middleware file); row-level reads inside the page are also protected by Supabase RLS, so you don't need to re-check `auth.getUser()` in the page itself.

Most new feature pages go under `(main)/dashboard/<slug>/page.tsx` and are reachable at `/<locale>/dashboard/<slug>`.

## Page conventions

**Default to a Server Component.** Drop `"use client"` only when you actually need browser-side state, effects, or event handlers. Server Components keep the bundle smaller and let you use `getTranslations`/`createClient` directly without round-tripping through an API route.

```tsx
// app/[locale]/(main)/dashboard/example/page.tsx
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const t = await getTranslations("dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id, name").limit(10);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <h1 className="text-2xl font-bold">{t("header.title")}</h1>
      {/* ... */}
    </div>
  );
}
```

Conventions:

- **shadcn/ui for primitives.** Buttons, dialogs, tables, forms — never hand-rolled. See [`add-a-shadcn-component.md`](/how-to/add-a-shadcn-component) and [ADR-037](https://github.com/gidorah/catena/blob/dev/decisions/037-no-hand-rolled-components.md).
- **i18n via next-intl namespaces.** `getTranslations("dashboard")` for server components, `useTranslations("dashboard")` for client. Don't hard-code English strings.
- **Navigation links via `@/i18n/routing`**, not `next/link` directly:
  ```tsx
  import { Link } from "@/i18n/routing";
  <Link href="/dashboard/projects/new">…</Link>;
  ```
  This keeps the locale prefix consistent without you having to thread it through.
- **Server-side data fetching is fine.** Next.js dedupes Supabase reads in the same request; don't preemptively introduce SWR or TanStack Query for a page that loads once.
- **Container queries already wired.** The core dashboard pages (`/dashboard/default`, `/dashboard/x83-translation`) use `@container/main flex flex-col gap-4 md:gap-6` as the outer wrapper — match it for new dashboard surfaces unless you have a reason to diverge. Other pages, such as the projects list, deliberately use different shells (`<Card>`-wrapped, padded layouts); pick the closest precedent rather than inventing a new layout class.

## When to use a Client Component

Mark a component (or page) `"use client"` when you need any of:

- React state (`useState`, `useReducer`).
- Effects (`useEffect`, `useLayoutEffect`).
- Browser-only APIs (`window`, `document`, `localStorage`).
- Event handlers (`onClick`, form submit handlers).
- `useTranslations`, `useFormatter`, `useRouter` — the client variants. **Import `useRouter` from `@/i18n/routing`, not `next/navigation`** — the locale-aware wrapper is what keeps `/de/...` and `/en/...` prefixes consistent.

Keep the boundary as **deep** as possible. If only a button needs interactivity, make the button a Client Component and leave its parent on the server.

Server Components must not pass functions to Client Components — only serializable data. If you need to pass behavior, wrap it in a server action and import that.

## Sidebar navigation

The sidebar is built in `src/navigation/sidebar/sidebar-items.ts` from a `getSidebarItems(t, features)` function. To surface a new page in the sidebar:

1. Add a translation key under `navigation.<key>` in `apps/dashboard/locales/{en,de}/dashboard.json`.
2. Push an entry into the appropriate group in `getSidebarItems`:
   ```ts
   dashboardItems.push({
     title: t("navigation.example"),
     url: "/dashboard/example",
     icon: SomeLucideIcon,
   });
   ```
3. If the page is gated by a feature flag, do the push inside an `if (features.x83Translator)`-style block — see [`roll-out-a-feature-flag.md`](/how-to/roll-out-a-feature-flag) for the full pattern.

Don't add the entry as always-on and hide it with CSS; the array is the source of truth and keeping it conditional makes flag rollback a one-line change.

## Conventions checklist

- [ ] Page is under the correct route group (`(main)` for authenticated).
- [ ] Server Component by default; `"use client"` only when needed.
- [ ] All user-facing strings come from next-intl namespaces.
- [ ] Internal links use `@/i18n/routing`, not `next/link`.
- [ ] UI primitives are shadcn — no hand-rolled buttons/dialogs/etc.
- [ ] Sidebar entry added to `sidebar-items.ts` with a translation key.
- [ ] If feature-flag-gated, the gate is in `getSidebarItems` and the page itself ([`roll-out-a-feature-flag.md`](/how-to/roll-out-a-feature-flag)).
