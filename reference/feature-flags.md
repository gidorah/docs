---
title: "Feature Flags"
description: "Inventory of runtime feature flags. To add or remove a flag, see [`how-to/roll-out-a-feature-flag.md`](../how-to/roll-out-a-feature-flag.md)."
---

# Feature Flags

Inventory of runtime feature flags. To add or remove a flag, see [`how-to/roll-out-a-feature-flag.md`](https://github.com/gidorah/catena/blob/dev/how-to/roll-out-a-feature-flag.md).

## Convention

- Env-var prefix: `CATENA_FEATURE_*`. String value `"true"` enables; anything else (including unset) disables.
- Resolved server-side by `apps/dashboard/src/config/features.ts` into a typed `DashboardFeatures` object.
- Consumers read `getDashboardFeatures()` rather than `process.env` directly so the gate stays in one place.

## Inventory

| Flag                            | Gates                                                                                | Default (local)                         | Default (Coolify prod)                                    | Default (Playwright)            | Status         |
| ------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------- | ------------------------------- | -------------- |
| `CATENA_FEATURE_X83_TRANSLATOR` | `/dashboard/x83-translation` page, `/api/tools/x83-translation` route, sidebar entry | `false` (`apps/dashboard/.env.example`) | unset → `false` (set explicitly in Coolify env to enable) | `true` (`playwright.config.ts`) | Active rollout |

## Consumers

`CATENA_FEATURE_X83_TRANSLATOR` is read in:

- `apps/dashboard/src/config/features.ts` — sole resolution point.
- `apps/dashboard/src/app/[locale]/(main)/dashboard/x83-translation/page.tsx` — returns 404 when disabled.
- `apps/dashboard/src/app/api/tools/x83-translation/route.ts` — returns 404 when disabled.
- `apps/dashboard/src/navigation/sidebar/sidebar-items.ts` — hides the nav entry when disabled.
