---
title: "Add a shadcn/ui component"
description: "How to install and customize a [shadcn/ui](https://ui.shadcn.com) primitive in the dashboard. The dashboard's UI is **shadcn-only** by policy — see [ADR-037](../decisions/037-no..."
---

# Add a shadcn/ui component

How to install and customize a [shadcn/ui](https://ui.shadcn.com) primitive in the dashboard. The dashboard's UI is **shadcn-only** by policy — see [ADR-037](https://github.com/gidorah/catena/blob/dev/decisions/037-no-hand-rolled-components.md). If you find yourself writing a button, dropdown, dialog, or form primitive from scratch, stop and read that ADR first.

This is a **how-to**, not a shadcn catalog. For the list of available components, see the [official shadcn/ui registry](https://ui.shadcn.com/docs/components).

- It does not cover novel domain widgets (BoQ tree row, price-comparison cells) — those are not what shadcn covers.
- It does not cover full theme overhauls — Catena uses the stock `new-york` style on `neutral`.

## What's already installed

shadcn primitives live in `apps/dashboard/src/components/ui/`. The current set includes accordion, alert, alert-dialog, avatar, badge, breadcrumb, button (and button-group), calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, and many more. Browse the directory before installing — there's a high chance the primitive you want is already there.

The shadcn manifest is `apps/dashboard/components.json`:

```json
{
  "style": "new-york",
  "rsc": true,
  "tailwind": {
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "lib": "@/lib"
  }
}
```

Don't change these without an ADR amendment — the style/baseColor combination is what gives the dashboard its consistent look.

## Install a component

The shadcn CLI reads `components.json` from the current working directory, so the install command must be run from `apps/dashboard/` (where the manifest lives), not from the repo root:

```bash
cd apps/dashboard
pnpm dlx shadcn@latest add <component>
```

Examples:

```bash
pnpm dlx shadcn@latest add tabs
pnpm dlx shadcn@latest add toggle-group
```

If you prefer to stay at the repo root, scope through the workspace: `pnpm --filter @catena/dashboard exec pnpm dlx shadcn@latest add <component>` works equivalently.

The CLI drops a new file into `src/components/ui/<component>.tsx`. Commit that file as-is — don't reformat or rename it on first install. If the component depends on another shadcn primitive that's missing, the CLI installs that too.

After install:

1. Verify the file imports `cn` from `@/lib/utils` (it should — the alias is configured).
2. Verify the component renders correctly in your page.
3. Commit `src/components/ui/<component>.tsx` and any peer dependencies the CLI added to `package.json`.

## Customize via CSS variables

Theming happens in `apps/dashboard/src/app/globals.css` through CSS variables (the `--background`, `--foreground`, `--primary`, etc. tokens). To shift the palette or radius:

```css
@layer base {
  :root {
    --primary: 222 47% 11%;
    --radius: 0.5rem;
  }
}
```

Don't edit the component files in `components/ui/` to change colors — the variables are the override surface. Edits inside `components/ui/` may be overwritten on a future `shadcn add`, since the CLI can rewrite files it considers part of its registry; sticking to CSS variables and Tailwind classes keeps your theming portable across re-installs.

## When to wrap vs. use directly

Use shadcn directly when you're using the primitive at face value:

```tsx
import { Button } from "@/components/ui/button";
<Button onClick={...}>Save</Button>
```

Wrap shadcn when you need a **stable, project-specific composition** — e.g. a `<DeleteProjectDialog>` that pulls together `AlertDialog`, the danger-styled `Button`, and the i18n strings for delete confirmation. Wrappers go under `src/components/<feature>/`, not `src/components/ui/` (the latter is reserved for shadcn-installed primitives).

A wrapper is appropriate when:

- The composition appears (or is about to appear) in more than one place and the call sites would otherwise duplicate non-trivial prop wiring.
- The composition embeds project-specific copy, behavior, or styling that callers shouldn't re-derive each time.
- Naming the composition makes the call site read better (`<DeleteProjectDialog />` vs. an inline `AlertDialog` with five children and three handlers).

A wrapper is **not** appropriate just to rename or default-prop a single shadcn primitive that's only used once. That's incidental indirection — it adds a layer to grep through without paying for itself.

## What's prohibited

- **Hand-rolling a primitive that shadcn ships.** No custom `<MyButton>`, `<MyDialog>`, `<MySelect>`. Install the shadcn equivalent and customize via variables / Tailwind. See [ADR-037](https://github.com/gidorah/catena/blob/dev/decisions/037-no-hand-rolled-components.md).
- **Forking a shadcn file** to materially change its API or behavior. If you need different behavior from `Button`, the answer is a new wrapper component or a Tailwind variant — not a renamed copy of `button.tsx`.
- **Adding a non-shadcn UI library** (Material, Mantine, Chakra, etc.) without an ADR. Mixing libraries breaks the Radix accessibility baseline and doubles the design tokens.

## Cross-references

- [ADR-037: No hand-rolled UI components](https://github.com/gidorah/catena/blob/dev/decisions/037-no-hand-rolled-components.md) — rationale.
- [`add-a-dashboard-page.md`](/how-to/add-a-dashboard-page) — where these primitives get used.
