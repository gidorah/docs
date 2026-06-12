---
title: "Architectural Decision Records (ADRs)"
description: "This directory holds Catena's architectural decisions, one per file. ADRs 001–033 were migrated from the original `tech-decisions.md` (archived at [`../archive/tech-decisions.md..."
---

# Architectural Decision Records (ADRs)

This directory holds Catena's architectural decisions, one per file. ADRs 001–033 were migrated from the original `tech-decisions.md` (archived at [`../archive/tech-decisions.md`](https://github.com/gidorah/catena/blob/dev/archive/tech-decisions.md)). ADRs 034+ are new.

## Why these are forward commitments, not status reports

Catena's TDs (now ADRs 001–033) were authored by the sole technical contributor as **architectural commitments that drive development** — not as records of past discussion. Code follows them, not the other way around. Migration preserves that authority: ADR bodies are verbatim and immutable; only the `implementation:` footer mutates as work ships.

## Status lifecycle

Every ADR has one of four statuses:

- **`Proposed`** — under consideration. Not yet committed.
- **`Accepted`** — committed forward direction. Body is verbatim and immutable; the `implementation:` field tracks execution state.
- **`Superseded`** — replaced by a newer ADR with a different decision. Frontmatter gains `superseded-by: NNN`. The body never changes; the status flip + link is the whole edit.
- **`Reversed`** — the decision was retracted as wrong on contact with reality. Frontmatter gains `reversed-by: NNN` and `reversal-reason: <one line>`. Body still never changes.

## Implementation status (separate from decision status)

The `implementation:` frontmatter field is one of `shipped | partial | not started`. This is the _only_ mutable part of an Accepted ADR. Decoupling decision authority from execution state lets us ship in stages without falsifying the historical record of what was committed when.

`implemented-in:` (optional) names the migration file or path that realizes the decision, if applicable.

## Retraction rule

**Retraction = a new ADR superseding or reversing the old one. The old ADR's body never mutates.** Status flips, a link is added, the original record stands.

This rule is load-bearing the _first_ time a reversal happens — without it, the natural impulse is to edit the old ADR "to keep things consistent," which destroys the historical context that made the reversal informative. Below is a worked example so the procedure is concrete from day one rather than learned under pressure.

### Worked retraction example (hypothetical)

Suppose ADR-014 (`item-pricing-precision-numeric-12-2`) has been Accepted for six months. We discover during work-package compilation that 2 decimal places loses cents on quantity \* unit-price aggregations across large BoQs, producing main-offer totals that disagree with the source by €0.50–€2.00. Rounding the inputs is not acceptable; we need 4 decimal places at the storage layer.

The retraction is a new ADR — call it ADR-038 (`item-pricing-precision-numeric-14-4`):

- ADR-038 has `status: Accepted`, body explaining the precision change, the migration that widens the columns, and the data-migration step for existing rows.
- ADR-014 gains exactly two frontmatter lines: `status: Reversed` and `reversed-by: 038`. Optionally `reversal-reason: "2-decimal precision loses cents on aggregation; see ADR-038."` Body of ADR-014 stays exactly as it was.
- The reader of ADR-014 sees both: the original commitment ("we chose 2 decimals because…") and the reversal pointer. The reasoning that turned out wrong is still legible — that's _why_ it was wrong, and we don't want to lose it.

This is hypothetical — ADR-014's actual title may differ; it's illustrative of the procedure, not a real reversal.

## Per-ADR file structure

```markdown
---
status: Accepted
date: 2026-03-18
implementation: shipped | partial | not started
implemented-in: <path> # optional
superseded-by: NNN # only if Superseded
reversed-by: NNN # only if Reversed
reversal-reason: <one line> # only if Reversed
---

## ADR-NNN: <title>

### Context

<original verbatim>

### Decision

<original verbatim>

### Consequences

<original verbatim>

### Implementation notes

<one paragraph — what currently exists, what's pending. The ONLY mutable section.>
```

## Conventions

- **One decision per file.** No monolithic "decisions log" file — that's `tech-decisions.md`'s legacy shape, now archived.
- **Numbering is stable.** ADR numbers never change. Numbers map 1:1 to the source TD numbers in `tech-decisions.md` for traceability with [`../archive/plans/`](https://github.com/gidorah/catena/blob/dev/archive/plans/).
- **File names** are `NNN-kebab-case-slug.md`.
- **Verbatim bodies.** Migrated ADRs do not paraphrase the original Context/Decision/Consequences. The mutable footer is `Implementation notes` only.
- **Length budget.** ADRs are ≤ 80 lines. If a decision needs more, the decision is probably not yet sharp enough to be an ADR.
- **Archive accuracy caveat.** [`../archive/`](https://github.com/gidorah/catena/blob/dev/archive/) is write-once and may contain claims no longer true (e.g. "endpoint X no longer exists" when in fact it does). When archive and current code disagree, **trust the code.** ADRs do not retroactively edit archive content.

## Index

Partial index. ADRs 001–033 are migrated from [`../archive/tech-decisions.md`](https://github.com/gidorah/catena/blob/dev/archive/tech-decisions.md); ADRs 034+ are new decisions:

- [034 — Coolify-only for MVP](/decisions/034-coolify-only-for-mvp) (superseded by 040)
- [035 — Deterministic parser](/decisions/035-deterministic-parser)
- [036 — Three Supabase clients](/decisions/036-three-supabase-clients)
- [037 — No hand-rolled UI components](/decisions/037-no-hand-rolled-components)
- [038 — Single canonical Compose with local overlay](/decisions/038-single-canonical-compose-with-local-overlay)
- [039 — Compose migrator service](/decisions/039-compose-migrator-service)
- [040 — Supabase Cloud bridge strategy](/decisions/040-supabase-cloud-bridge)
- [041 — Layered test architecture and quality gates](/decisions/041-layered-test-architecture)
- [042 — Supabase Storage bootstrap before app migrator](/decisions/042-storage-bootstrap-before-app-migrator)
- [043 — Cloud-mode dashboard Compose artifact](/decisions/043-cloud-mode-compose-artifact)
