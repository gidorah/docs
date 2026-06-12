---
title: "Product Arc"
description: "This is the engineering-side mirror of the four-layer product vision. It's future-tense: it describes where the system is going and what each layer demands structurally. For shi..."
---

# Product Arc

This is the engineering-side mirror of the four-layer product vision. It's future-tense: it describes where the system is going and what each layer demands structurally. For shipped state, see [`../overview.md`](https://github.com/gidorah/catena/blob/dev/overview.md). For the canonical product framing, see Notion ([mirrored](https://github.com/gidorah/catena/blob/dev/notion-export/product/technical-vision-and-roadmap.md)).

The arc compounds — each layer is unlocked by the one beneath it.

```
Layer 4: Network       ← marketplace emerges from agent quality + sub density
Layer 3: Intelligence  ← LLM agent over Layer 2 data
Layer 2: Data          ← structured procurement data from completed cycles
Layer 1: Workflow      ← the full tender-to-bid cycle, end-to-end
```

## Layer 1 — Workflow Engine

The full tender-to-bid cycle, end-to-end, in three maturity stages:

- **Stage 1 (Early / MVP).** Catena prepares packages; the user transmits and collects offers manually via their own email. End-to-end loop works (parse → split → assign → export → upload offers → compare → award → compile → submit) but communication is off-platform.
- **Stage 2 (Mature).** Catena owns the send/receive cycle. Email integration, inbound offer-document parsing, audit trail, bid tracking. Subs still see normal email.
- **Stage 3 (Complete).** Subcontractor portal — subs receive a link, view packages on-platform, upload bids directly. Granular tracking, structured ingestion, VOB compliance tooling, on-platform award flow.

**Eng-decision implications.** The canonical layer is editable because Layer 1 is fundamentally a _reshaping_ product (rename/move/merge categories, regroup items into packages); the source layer is immutable because every downstream artifact must be reconstructible from it for audit; the parser is deterministic because Stage 1 customers cannot afford a parsing surface that hallucinates BoQ items into procurement contracts. See [`../decisions/`](https://github.com/gidorah/catena/blob/dev/decisions/) for the ADRs that lock these in.

## Layer 2 — Data Layer

Structured procurement data accumulates passively from completed Layer 1 cycles: trade pricing per region, sub response rates, bid-to-win ratios, offer quality signals, tender complexity patterns, seasonal demand. **No engineering work creates Layer 2 directly** — it falls out of Stage 1 maturity. Aggregation happens cross-customer (statistical patterns are shareable; individual tender data is private).

**Eng-decision implications.** This is why the schema bothers with `boq_categories` / `boq_items` separated from a canonical layer with audit columns and provenance: the data is the asset, and reshaping cannot lose its provenance back to the source document. Every editable mutation is logged so that Layer 2 can later mine real procurement decisions, not just final states.

## Layer 3 — Intelligence Layer

An LLM-powered agent operating over Layer 2 data: sub recommendations, cost estimates, risk flags, compliance checks (VOB/A §8 split rules), workflow automation. Not a chatbot — an agent that understands the procurement workflow and operates within it (read access by default; mutating actions require user approval).

**Eng-decision implications.** Layer 3 has no shipped surface today (see [`../overview.md`](https://github.com/gidorah/catena/blob/dev/overview.md) for current status). A doc slot is provisioned in [`../README.md`](https://github.com/gidorah/catena/blob/dev/README.md)'s forthcoming-docs roadmap and triggers when non-trivial implementation lands. The deterministic-parser stance ([ADR-035](https://github.com/gidorah/catena/blob/dev/decisions/)) is scoped narrowly: AI augments decision-making over Layer 2 data, **not** the parsing surface. The dashboard's `.env.example` carries an `ANTHROPIC_API_KEY` env var for a future "category suggestions" feature; no consumer exists today.

## Layer 4 — Network Layer

A marketplace where GCs discover subs through Catena and broadcast packages to vetted networks. Sub profiles, performance history, agent-powered matching. **Last** because:

- GCs won't broadcast to unknown subs without Layer 3-quality trust signals.
- Subs won't join without real job flow, which requires Stage 3's portal.
- Matching quality requires Layer 2 data volume.
- German construction runs on relationship capital — an open marketplace has to earn trust through private network value first.

**Eng-decision implications.** Stage 3's subcontractor portal is the structural prerequisite (subs need on-platform identity before any matching/discovery layer can exist). Until Stage 3 ships, Layer 4 has no foundation.

## Current position on the arc

Roughly **halfway through the input side of Layer 1 Stage 1**. Parser ships and the canonical data model is in place (Phases 1–7 of Epic 4.1). The category-tree editor, work-package creation, export, offer ingest, Preisspiegel, award, compilation, and submission are not yet built. Everything from "Send packages" rightward is unscoped at the engineering level. See [`../overview.md`](https://github.com/gidorah/catena/blob/dev/overview.md) for the precise current state, and [`../README.md`](https://github.com/gidorah/catena/blob/dev/README.md) for the forthcoming-docs roadmap that names the artifact triggering each next doc.

## Source

Notion is canonical for product/strategy. Treat the [mirror](https://github.com/gidorah/catena/blob/dev/notion-export/product/technical-vision-and-roadmap.md) as a snapshot — it lags Notion by one sync.
