---
title: "Add user-facing text"
description: "How to add or change a user-facing string in the dashboard so both German and English render correctly. Catena uses [next-intl](https://next-intl.dev) with file-per-namespace JS..."
---

# Add user-facing text

How to add or change a user-facing string in the dashboard so both German and English render correctly. Catena uses [next-intl](https://next-intl.dev) with file-per-namespace JSON catalogs.

This is a **how-to**, not a next-intl tutorial. It assumes you've seen the library before; if not, skim the next-intl quickstart first.

- It does not cover RTL layout — Catena ships LTR-only.
- It does not cover translation review or vendor handoff — the team self-translates.

## Where strings live

```
apps/dashboard/
├── locales/
│   ├── en/
│   │   ├── auth.json
│   │   ├── common.json
│   │   ├── dashboard.json
│   │   ├── errors.json
│   │   ├── projects.json
│   │   └── translation.json
│   └── de/
│       └── (same shape)
└── src/i18n/
    ├── config.ts        # locales: ["en", "de"], defaultLocale: "en"
    ├── request.ts       # loads each namespace JSON for the active locale
    └── routing.ts       # next-intl navigation helpers
```

Both locale trees must always have the **same keys**. A key present in one but missing in the other is a bug — next-intl renders the literal key string in the missing locale.

The active locale comes from the `[locale]` URL segment (`/en/...`, `/de/...`). `localePrefix: "always"` in `routing.ts` means the prefix is required — there is no implicit default route.

## Pick a namespace

The six JSON files split strings by feature surface:

| Namespace     | Use for                                                           |
| ------------- | ----------------------------------------------------------------- |
| `common`      | Shared UI atoms (buttons, generic actions, day/month names).      |
| `auth`        | Login, signup, password-reset, session messages.                  |
| `dashboard`   | Dashboard chrome, navigation labels, widget headings.             |
| `errors`      | User-visible error messages, including those keyed by `errorKey`. |
| `projects`    | Project pages, list/detail/edit, BoQ-related strings.             |
| `translation` | Catch-all for surfaces not yet split out. Avoid for new work.     |

If a string belongs to a feature surface that already has a namespace, put it there. Don't invent new namespaces casually — adding one means editing `src/i18n/request.ts` to load it.

## Add a key

1. Add the key to **both** locale files in the same change. There is no automatic English fallback — Catena does not configure `getMessageFallback`, so a key missing from the active locale renders as the literal key path (`dashboard.header.title`) in the UI.
2. Don't leave the German entry as the English string while you wait for a translation. Doing so makes the regression visible to real users in production instead of to reviewers in the diff.
3. Use **dot-prefixed nesting** for grouping; next-intl reads dotted paths:

   ```json
   // locales/en/projects.json
   {
     "list": {
       "title": "Projects",
       "createButton": "New project"
     }
   }
   ```

   And then `useTranslations("projects")` + `t("list.createButton")` resolves it.

4. Keep keys **descriptive of the surface**, not the literal English text. `list.createButton` survives a copy change; `newProjectButton` doesn't.

## Use it in a Server Component

```tsx
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("dashboard");
  return <h1>{t("header.title")}</h1>;
}
```

`getTranslations` is async because it reads the active locale from the request. Don't pass the `t` function across the server/client boundary — it's not serializable.

## Use it in a Client Component

```tsx
"use client";

import { useTranslations } from "next-intl";

export function Header() {
  const t = useTranslations("dashboard");
  return <h1>{t("header.title")}</h1>;
}
```

For multiple namespaces in one component, call `useTranslations` once per namespace:

```tsx
const t = useTranslations("projects");
const tCommon = useTranslations("common");
```

## Interpolation and formatting

next-intl handles ICU MessageFormat:

```json
{ "greeting": "Hello, {name}!" }
```

```tsx
t("greeting", { name: user.name });
```

For dates and numbers, use `useFormatter` (client) or `getFormatter` (server) rather than hand-formatting — the locale already knows German conventions (`1.234,56 €`).

## Common pitfalls

- **Key in `en/` only.** Renders the literal key string in `de/`. Always add both.
- **Dynamic key strings.** `t(someVariable)` works, but next-intl can't statically verify it. Acceptable when the keyspace is small and bounded; otherwise prefer a `switch` over an enumerated set of keys.
- **Splitting a phrase across keys.** Don't compose user-facing sentences by concatenating two translated fragments (e.g. one key for `"Welcome, "` and another for the user name). Languages reorder words; the result reads as broken localization. Use a single key with interpolation: `welcome: "Welcome, {name}!"`.
- **Reading translations in `errorKey` consumers.** API routes return an `errorKey` like `database.fetchFailed`; the consuming page or component runs it through `useTranslations("errors")` to render a localized message. Don't put the user-facing string in the API response — see [`add-an-api-route.md`](/how-to/add-an-api-route).
