---
title: "ADR-035: Use a Deterministic GAEB Parser, Not AI Categorization"
description: "GAEB DA XML (`.x83`, `.x84`, `.x85`) is a structured German tender format with a published schema and predictable shape. The business workflow built on top — item-level traceabi..."
status: Accepted
date: 2026-05-01
implementation: shipped
implemented-in: packages/gaeb-parser/
---


## ADR-035: Use a Deterministic GAEB Parser, Not AI Categorization

### Context

GAEB DA XML (`.x83`, `.x84`, `.x85`) is a structured German tender format with a published schema and predictable shape. The business workflow built on top — item-level traceability (ADR-001), immutable source layer (ADR-002), full lineage from canonical edits back to source rows — depends on the parser producing identical output for identical input. Probabilistic parsing would undermine that contract: re-uploading the same `.x83` could produce a different category tree, breaking comparison and reconciliation.

### Decision

Catena's GAEB parser is fully deterministic. `packages/gaeb-parser/` reads the XML with `fast-xml-parser`, applies hand-written extractors and translators, and produces typed `Metadata` / `BoQ` / `Item` output with no AI step in the parsing path.

### Consequences

- **Predictable output.** Same input → same output. Test corpus regression checks are meaningful.
- **Coverage gaps surface immediately.** When a tender uses an unhandled GAEB variant, the parser fails (or surfaces a "red finding" in the corpus sweep) rather than silently guessing — which lets us extend the parser deterministically.
- **No model spend on the parser path.** Cost stays in the Coolify host (ADR-034), not in inference.

### Implementation notes

The GAEB parser today is fully deterministic and AI-free. An `ANTHROPIC_API_KEY` env var is scaffolded in `apps/dashboard/.env.example` for a future "category suggestions" feature, but no consumer exists in the codebase as of 2026-04-30 (verified via the Phase A grep — see `_work-tmp/phase-a-grep-result.md`). The gap is acknowledged future work, not a hidden surface. When category-suggestion AI is built, it will be an isolated module layered on top of the deterministic parser output, not a replacement for it.
