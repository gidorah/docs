---
title: "GAEB domain primer"
description: "What GAEB is, why Catena needs a deterministic parser for it, and what real-world tender XML actually looks like."
---

# GAEB domain primer

What GAEB is, why Catena needs a deterministic parser for it, and what real-world tender XML actually looks like.

For implementation details of the parser itself, see [`../packages/gaeb-parser.md`](https://github.com/gidorah/catena/blob/dev/packages/gaeb-parser.md). For German construction terminology, see [`../reference/glossary.md`](https://github.com/gidorah/catena/blob/dev/reference/glossary.md).

## What GAEB is

**GAEB** — *Gemeinsamer Ausschuss Elektronik im Bauwesen* — is the German standards body for electronic data exchange in the construction industry. Its **DA XML** specifications define the XML interchange format for tender documents (*Leistungsverzeichnisse*, "bills of quantities" or BoQs).

Catena cares about three file types:

| Extension | Phase                  | Direction              | Purpose                                                            |
| --------- | ---------------------- | ---------------------- | ------------------------------------------------------------------ |
| `.x83`    | Invitation to offer    | Client → bidder        | The tender package: scope, items, quantities, deadlines.           |
| `.x84`    | Offer                  | Bidder → client        | The bidder's priced response.                                      |
| `.x85`    | Award / contract       | Client → bidder        | Awarded version, often with revisions to the original `.x83`.      |

Catena ingests `.x83` today; `.x84`/`.x85` shape the data model but full bidirectional support is downstream of MVP.

## Why deterministic parsing

Two non-negotiable constraints rule out an LLM-driven extractor:

1. **Legal baseline.** The parsed tender is the *immutable* anchor against which every later edit is reviewed and every offer is compared. ADR-002 makes this explicit: the source layer cannot be mutated after creation. A parser that produces different output on different runs would corrupt that anchor.
2. **Traceability.** Every canonical item ultimately resolves back to a specific `boq_item` in the parsed source (ADR-001). If the parser hallucinated structure, the audit trail would be a lie.

So the parser is pure transformation: same XML in, same JSON out, always. ADR-035 records this decision.

## Real-world quirks

Tenders in the wild deviate from any clean reading of the GAEB spec. The corpus at `test-fixtures/invitation-to-offer/` is the regression bed for these. The ones that have repeatedly drawn blood:

- **Stop-node variants.** `fast-xml-parser` returns the same field as a string, an array, or a nested object depending on whether the source had attributes or sibling text. Every extractor must handle all three shapes.
- **Mixed deadlines.** Some tenders use structured `AwardInfo.CnstStart` / `CnstEnd`; others stuff free-text dates into `TERMINE`; many do both inconsistently. The parser keeps both.
- **`TextComplement` bidder content.** Items may contain bidder-fillable text blocks alongside the description. These must not be silently dropped.
- **Client addresses in `OWN.Address.Name1`.** The architect / awarding entity is rarely where the spec suggests — it's typically buried inside `OWN.Address.Name1` and the parser has to look there.
- **Flatter hierarchies.** Some tenders skip intermediate `BoQBody` levels. Category nesting is not guaranteed to be uniform across the corpus.
- **HTML in short and long text.** `BoQItem` preserves both stripped text and original HTML via `shortText` / `shortTextHtml` / `longText` / `longTextHtml`. Both are kept because formatting carries meaning (units, tolerances, references) that bare text loses.

The corpus sweep in `__tests__/corpus-sweep.test.ts` runs against every fixture and must produce **zero red findings** — it is the canary for new tender quirks slipping in.

## What the parser produces

A successful parse yields three buckets:

- **Metadata** — project name, client, architect, deadlines, currency, notes.
- **Categories (`BoQCategory`)** — the BoQ outline tree (e.g. *01 Erdarbeiten*, *01.10 Aushub*).
- **Items (`BoQItem`)** — the leaf line items with quantity, unit, short/long text in both stripped and HTML form.

These flow into the immutable parsed source layer in Postgres via `ingest_boq_and_bootstrap`. From there, the canonical structure is bootstrapped — see [`document-ingest-pipeline.md`](/explanation/document-ingest-pipeline).
