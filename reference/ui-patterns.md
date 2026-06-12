---
title: "UI Patterns"
description: "Conventions for building dashboard UI on top of shadcn/ui. Convention level only — for adding a new shadcn primitive, see [`../how-to/add-a-shadcn-component.md`](../how-to/add-a..."
---

# UI Patterns

Conventions for building dashboard UI on top of shadcn/ui. Convention level only — for adding a new shadcn primitive, see [`../how-to/add-a-shadcn-component.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-a-shadcn-component.md). For the rationale behind banning hand-rolled components, see [`../decisions/037-no-hand-rolled-components.md`](https://github.com/gidorah/catena/blob/dev/decisions/037-no-hand-rolled-components.md).

## shadcn/ui

- **Source of primitives:** `apps/dashboard/src/components/ui/`. Wired via `apps/dashboard/components.json` (`style: new-york`, `rsc: true`, `iconLibrary: lucide`, `baseColor: neutral`).
- **Adding a primitive:** install via the shadcn CLI; the file lands in `src/components/ui/`. Do not hand-roll equivalents — see ADR-037.
- **Customisation:** Tailwind tokens via CSS variables in `src/app/globals.css`. Do not edit primitive component files for one-off styling; compose with `className` at the call site.
- **Aliases (from `components.json`):** `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`.
- **Toasts:** `Sonner` from `src/components/ui/sonner.tsx` (`sonner` library). One toaster per app shell; trigger via `toast()` at the call site.
- **Icons:** `lucide-react`, single icon set. Import per-icon (`import { Check } from "lucide-react"`).

## Forms

- **Stack:** `react-hook-form` + `zod` + the shadcn `Form` primitive (`src/components/ui/form.tsx`).
- **Pattern:** define a `zod` schema, infer the type, pass to `useForm({ resolver: zodResolver(schema) })`, render fields with `<Form>` / `<FormField>` / `<FormItem>` / `<FormControl>` / `<FormMessage>`.
- **Submission paths in use:**
  - **Server Actions** for auth flows. Auth forms (`login-form.tsx`, `register-form.tsx`, `forgot-password-form.tsx`, `update-password-form.tsx` under `src/app/[locale]/(auth)/_components/`) call actions in `src/app/actions/auth.ts` via `useTransition`. Errors surface as `result.error` strings and are rendered with `toast.error(t(...))` from `sonner` + `next-intl`.
  - **`fetch` to `/api/...` routes** for project CRUD and the X83 tool (e.g. `quick-create-project-dialog.tsx`, `dashboard/projects/new/page.tsx`, `x83-translation-tool.tsx`). Surface the route's `errorKey` through `next-intl` rather than rendering the `error` string directly.

## Dialogs and confirmation

- **Generic dialog:** `Dialog` from `src/components/ui/dialog.tsx`.
- **Destructive confirms:** `AlertDialog` from `src/components/ui/alert-dialog.tsx`.
- Wrap repeated confirm flows behind a small composite component near the call site rather than reaching for a global modal manager.

## Sidebar

- **Implementation:** `src/app/[locale]/(main)/dashboard/_components/sidebar/`.
- **Top-level shell:** `app-sidebar.tsx`. Sections: `nav-main.tsx`, `nav-documents.tsx`, `nav-secondary.tsx`, `nav-user.tsx`, plus `account-switcher.tsx`, `theme-switcher.tsx`, `layout-controls.tsx`, `search-dialog.tsx`.
- **Adding a nav entry:** edit `src/navigation/sidebar/sidebar-items.ts`. Feature-flagged entries are pushed conditionally on the resolved `features` object — see the `features.x83Translator` branch (`CATENA_FEATURE_X83_TRANSLATOR`) for the canonical example.

## Loading states

- **Skeletons:** `Skeleton` from `src/components/ui/skeleton.tsx` for in-component placeholders.
- **Page-level loading:** Next.js `loading.tsx` files at the route boundary. Prefer this over manual spinners on first paint.
- **Inline:** `Spinner` from `src/components/ui/spinner.tsx` for action-in-progress feedback inside buttons.

## Data tables

- **Stack:** `@tanstack/react-table` + shadcn `Table` primitives. Already implemented — do not introduce a second table library.
- **Implementation:** `src/components/data-table/`.
  - `data-table.tsx` — generic table shell.
  - `data-table-column-header.tsx` — sortable headers with directional icons.
  - `data-table-pagination.tsx` — page-size + navigation controls.
  - `data-table-view-options.tsx` — column visibility menu.
  - `drag-column.tsx`, `draggable-row.tsx` — drag-and-drop reordering.
  - `table-utils.ts` — shared cell/row helpers.
- Column definitions live next to the consuming page, not inside `data-table/`. Keep `data-table/` columnless and reusable.
