---
title: "Roll out a feature flag"
description: "How to create, gate, ship, and eventually remove a runtime feature flag in Catena. The MVP uses simple env-var flags resolved server-side — no LaunchDarkly, no Unleash, no remot..."
---

# Roll out a feature flag

How to create, gate, ship, and eventually remove a runtime feature flag in Catena. The MVP uses simple env-var flags resolved server-side — no LaunchDarkly, no Unleash, no remote config service.

This is a **how-to**, not an evaluation:

- It does not compare flag-management SaaS — that question is out of scope until post-MVP.
- It is not the inventory of current flags — that lives in [`reference/feature-flags.md`](https://github.com/gidorah/catena/blob/dev/reference/feature-flags.md).

## Naming convention

- Env-var prefix: **`CATENA_FEATURE_*`** — never plain `FEATURE_*` (kept namespaced for greppability and to avoid clashes with arbitrary `FEATURE_*` env vars set by tooling) and never `NEXT_PUBLIC_FEATURE_*` (flags are server-resolved on purpose; see Step 2).
- The string `"true"` enables the flag. Anything else, including unset, disables it. Resolution is exact-match in `apps/dashboard/src/config/features.ts`:
  ```ts
  // inside the object literal returned by getDashboardFeatures()
  x83Translator: process.env.CATENA_FEATURE_X83_TRANSLATOR === "true",
  ```
- The typed property name on `DashboardFeatures` is camelCase: `CATENA_FEATURE_X83_TRANSLATOR` → `x83Translator`.

## Step 1 — Add the env var

1. Append the flag to `apps/dashboard/.env.example` with the **safe default for local dev** (almost always `false`):
   ```
   CATENA_FEATURE_MY_NEW_THING=false
   ```
2. Add a new field to the `DashboardFeatures` interface and `getDashboardFeatures()` resolver in `apps/dashboard/src/config/features.ts`. The single resolver keeps `process.env` reads in one place — never read `process.env.CATENA_FEATURE_*` from a page or route.

## Step 2 — Gate the code

The pattern is the same in every consumer: read `getDashboardFeatures()` from a server context, branch on the resolved boolean. **There is no client read pattern** — `getDashboardFeatures()` reads `process.env`, which is only populated server-side. If a Client Component needs the flag value, resolve it in the parent Server Component and pass it down as a prop. Don't introduce `NEXT_PUBLIC_*` flags to dodge this.

Also: if the gated surface is a new dashboard page, create the page file under `apps/dashboard/src/app/[locale]/(main)/dashboard/<slug>/` first, and add the `navigation.<key>` translation to every locale catalog under `apps/dashboard/messages/` — the sidebar snippet below references `t("navigation.myNewThing")` and will render the literal key string if the translation is missing.

**API route** — return 404 (not 403) so the route is indistinguishable from a missing one:

```ts
const features = getDashboardFeatures();
if (!features.myNewThing) {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
```

**Server-rendered page** — call `notFound()` so Next.js renders the standard 404:

```ts
const features = getDashboardFeatures();
if (!features.myNewThing) {
  notFound();
}
```

**Sidebar / navigation** — skip the entry inline; never push it into the array unconditionally and hide with CSS:

```ts
if (features.myNewThing) {
  dashboardItems.push({
    title: t("navigation.myNewThing"),
    url: "/dashboard/my-new-thing",
    icon: SomeIcon,
  });
}
```

The worked precedent across all three shapes is `CATENA_FEATURE_X83_TRANSLATOR` — grep for it (`apps/dashboard/src/config/features.ts`, `apps/dashboard/src/navigation/sidebar/sidebar-items.ts`, the page, and the API route) before inventing a new pattern.

## Step 3 — Set per-environment defaults

| Environment        | Where to set                                                                                                                  | Convention                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Local dev          | `apps/dashboard/.env.example` → copied to `.env.local`                                                                        | Default to `false` unless the flag protects something half-built that local devs need on. |
| Playwright         | `apps/dashboard/playwright.config.ts` `webServer.env`, or in a local `.env.test` (gitignored — copy from `.env.test.example`) | Set to `true` if you wrote a spec for the gated surface; otherwise omit.                  |
| Coolify production | Coolify project → Environment Variables tab                                                                                   | Unset (= `false`) until rollout. Add the variable explicitly when enabling.               |

Coolify env vars take effect on the next deploy, not the current container — re-deploy the dashboard service after toggling.

## Step 4 — Per-customer rollout (current MVP method)

There is no per-user flag store. To enable a flag for one customer ahead of others, you currently need a separate Coolify environment for that customer (a deployment per tenant). For the single-tenant MVP this rarely matters; document the request as a future need rather than improvising a per-row override that nothing else in the codebase reads.

## Step 5 — Update the inventory

Add a row to the table in [`reference/feature-flags.md`](https://github.com/gidorah/catena/blob/dev/reference/feature-flags.md) with the flag name, what it gates (every page/route/nav entry), defaults per environment, and current rollout status (`Building`, `Active rollout`, `Always on — pending removal`).

## Step 6 — Remove the flag

When the gated surface is "always on," remove it in this order. The two PRs and their merge/deploy ordering matter — getting them out of sequence leaves a window where the old still-gated container reads the now-missing env var as `false` and the feature goes dark for users.

**PR 1 — code removal (ship and deploy first):**

1. Flip Coolify production to `=true`, redeploy, and verify the surface works for real users for at least 48 hours under normal load before starting the removal PR. (You want enough time that any "feature breaks for real customer" reports would have surfaced.)
2. Delete the gating branches from each consumer (page, API route, sidebar, anywhere else `features.myNewThing` is read).
3. Delete the field from `DashboardFeatures` and `getDashboardFeatures()`.
4. Delete the line from `apps/dashboard/.env.example` and the row from `reference/feature-flags.md`.
5. Clean up the now-orphaned bits the linter will flag: unused `getDashboardFeatures()` imports/calls in files that only used them for this flag, unused icon imports in `sidebar-items.ts` (e.g. `Languages` for the x83 translator), unused i18n keys.
6. **Merge PR 1 and confirm the new container has rolled out in Coolify** before touching the env var.

**PR 2 (or just a Coolify config change) — env-var cleanup:**

7. With the new container live, the Coolify env var is inert dead config. Delete it from the Coolify Environment Variables tab.

If you reverse the order — delete the env var before the new code is live — the still-gated old container reads the missing var as `false` and the feature disappears for users until the next deploy.
