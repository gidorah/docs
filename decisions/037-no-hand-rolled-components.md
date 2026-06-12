---
title: "ADR-037: No Hand-Rolled UI Components — shadcn/ui Is Mandatory"
description: "The dashboard's UI surface is Radix-based via shadcn/ui, already wired through `apps/dashboard/components.json`. With one technical contributor and no dedicated design system, h..."
status: Accepted
date: 2026-05-01
implementation: shipped
implemented-in: apps/dashboard/components.json
---


## ADR-037: No Hand-Rolled UI Components — shadcn/ui Is Mandatory

### Context

The dashboard's UI surface is Radix-based via shadcn/ui, already wired through `apps/dashboard/components.json`. With one technical contributor and no dedicated design system, hand-rolling alternative button / dialog / dropdown / form primitives would (a) duplicate work that shadcn already provides, (b) silently diverge from the project's accessibility baseline (Radix primitives carry it; rolled-from-scratch components rarely do), and (c) make it harder for the next contributor to predict where a given pattern lives.

### Decision

UI primitives in the dashboard come from shadcn/ui. Hand-rolling a Button, Dialog, Dropdown, Form, Select, Tooltip, or any other primitive that shadcn ships is prohibited. When a needed primitive does not yet exist in the local `components/ui/` tree, install it via the shadcn CLI and customize via CSS variables — do not fork or rewrite.

### Consequences

- **Consistent baseline.** Accessibility, keyboard navigation, focus management arrive for free.
- **Customization happens via CSS variables and Tailwind**, not via component re-implementation — keeps overrides local and reviewable.
- **Genuinely-novel components** (domain widgets like a BoQ tree row, a price-comparison cell) are not what this rule blocks; it blocks reinventing primitives that have a shadcn equivalent.

### Implementation notes

`apps/dashboard/components.json` is the shadcn manifest. Installation procedure and customization patterns live in `docs/how-to/add-a-shadcn-component.md`. Cross-component composition conventions live in `docs/reference/ui-patterns.md`.
