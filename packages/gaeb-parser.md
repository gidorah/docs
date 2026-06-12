---
title: "`@catena/gaeb-parser`"
description: "Standalone TypeScript library that parses GAEB DA XML tender files into a structured `GaebParseResult`. Used by the dashboard's document-upload route and the X83 translation tool."
---

# `@catena/gaeb-parser`

Standalone TypeScript library that parses GAEB DA XML tender files into a structured `GaebParseResult`. Used by the dashboard's document-upload route and the X83 translation tool.

For the conceptual primer on what GAEB is and why we parse it, see [`../explanation/gaeb-domain-primer.md`](https://github.com/gidorah/catena/blob/dev/explanation/gaeb-domain-primer.md). For the runtime path that consumes parser output, see [`../explanation/document-ingest-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/document-ingest-pipeline.md). For the deterministic-parsing decision, see [`../decisions/035-deterministic-parser.md`](https://github.com/gidorah/catena/blob/dev/decisions/035-deterministic-parser.md).

## Purpose

- Convert a GAEB DA XML string into a normalised `{ metadata, deadlines, boqInfo, categories, items }` shape.
- The accepted parser/upload contract is currently `.x83`. `.x84` and `.x85` remain product-relevant GAEB phases, but uploads are rejected until parser corpus fixtures and support exist.
- Translate a `.x83` file's labels and free text to a target language while preserving the XML structure (separate entry point: `translateGaebX83`).
- Survive real-world tender XML quirks. The corpus sweep is the regression canary.

Out of scope: persisting parser output, AI categorisation, file I/O (the package operates on strings).

## Architecture

```
parseGaebXml(xmlString)
   │
   ├── createGaebXmlParser()        ← xml-parser-config.ts: fast-xml-parser tuning
   │       └── parser.parse(xml)    ← raw object tree
   │
   ├── extractMetadata(doc)         ← extractors/metadata.ts
   ├── extractDeadlines(doc)        ← extractors/deadlines.ts
   ├── extractCategories(doc)       ← extractors/hierarchy.ts
   ├── extractItems(doc)            ← extractors/items.ts
   └── extractBoQInfo(doc)          ← inline in parse.ts
   │
   └── linkChildren(categories)     ← parent-child wiring
```

| File                          | Role                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                | Public surface. Re-exports `parseGaebXml`, `GaebParseError`, and types.                                    |
| `src/parse.ts`                | Orchestrator. Validates input, drives extractors, builds the parent-child tree.                            |
| `src/xml-parser-config.ts`    | `fast-xml-parser` configuration (stop nodes, attribute handling, text node naming).                        |
| `src/extractors/metadata.ts`  | Project name, client info from `OWN.Address.Name1`, currency, etc.                                         |
| `src/extractors/deadlines.ts` | Mixed free-text `TERMINE` lines plus structured `AwardInfo.CnstStart` / `CnstEnd`.                         |
| `src/extractors/hierarchy.ts` | Categories from `BoQBody`. Handles flatter hierarchy variants.                                             |
| `src/extractors/items.ts`     | Line items from `Itemlist`. Preserves `shortText` / `shortTextHtml` / `longText` / `longTextHtml`.         |
| `src/utils/html-strip.ts`     | Plain-text extraction from XHTML-formatted item descriptions.                                              |
| `src/utils/xml-text.ts`       | Reads raw XML text fragments while keeping markup intact.                                                  |
| `src/translate-x83.ts`        | Independent entry point: round-trip XML → translate text nodes → emit XML, reusing the same parser config. |
| `src/types.ts`                | All public types.                                                                                          |

`parseGaebXml` throws `GaebParseError` for empty input, invalid XML, or a missing `<GAEB>` root. Error `code` is one of `EMPTY_INPUT`, `INVALID_XML`, or `MISSING_GAEB_ROOT`.

## Hardening

The parser was hardened against issues found in real tenders. These are not theoretical edge cases — every one of them appears in the corpus.

| Quirk                                                                                                                                      | Where handled                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Stop-node values returning as string, array, or nested object depending on content                                                         | `xml-parser-config.ts` + extractor guards     |
| Mixed `TERMINE` free-text deadlines plus structured `AwardInfo.CnstStart` / `CnstEnd`                                                      | `extractors/deadlines.ts`                     |
| `<TextComplement>` bidder content in items                                                                                                 | `extractors/items.ts`                         |
| Client identity buried in `OWN.Address.Name1` rather than a top-level field                                                                | `extractors/metadata.ts`                      |
| Flatter hierarchy variants (BoQ without all levels)                                                                                        | `extractors/hierarchy.ts`                     |
| Items needing both stripped text and original HTML — preserved on `BoQItem` as `shortText` / `shortTextHtml` / `longText` / `longTextHtml` | `extractors/items.ts` + `utils/html-strip.ts` |

When adding a field, keep both the stripped and HTML forms.

## X83 translation engine

`packages/gaeb-parser/src/translate-x83.ts` exports `translateGaebX83`, `GaebTranslateError`, and `createGoogleTranslateProvider` (subpath `@catena/gaeb-parser/translate-x83`). Used by `apps/dashboard/src/app/api/tools/x83-translation/route.ts`, gated by `CATENA_FEATURE_X83_TRANSLATOR` — see [`../reference/feature-flags.md`](https://github.com/gidorah/catena/blob/dev/reference/feature-flags.md).

- **Signature:** `translateGaebX83(xml, options?)` where `options` is `{ provider?: TranslationProvider; timeoutMs?: number }`. **Source and target languages are hardcoded `de` → `en`** in the call to the provider — there is no language parameter today.
- **Default provider:** `createGoogleTranslateProvider()` — calls `translate.googleapis.com` and is what the dashboard route gets, since the route invokes `translateGaebX83(xml)` with no `options`. No Anthropic provider is wired.
- **Walks** `WRAPPER_TAGS` (`LblTx`, `Text`, `TextOutlTxt`, `OutlineAddText`, `DetailAddText`) and `SIMPLE_TAGS` (`LblPrj`, `Name`, `LblBoQ`, `LblBoQBkdn`, `LblUPComp1`–`LblUPComp4`, `LblTime`, `PerfLbl`, `WICNo`, `CtlgName`).
- **`SKIP_TEXTS`** skips control-vocabulary tokens that look like free text but aren't (e.g. `Yes`, `No`, `AllTxt`, `WithoutTotal`, `BoQLevel`, `Index`, `Item`, `OpenProc`, `SelectCall`, `Ref`, `Rep`, `EUR`, `Euro`, plus a handful of category labels) so they survive untouched through the round-trip.
- **Result shape:** `{ translatedXml: string; translatedNodeCount: number; uniqueTextCount: number }`. There are no per-tag diagnostics and no language-detection step — every matched text node is translated on every run; calling the function twice translates the output of the first call.
- **Errors:** throws `GaebTranslateError` with `code` `INVALID_XML` (empty input), `TRANSLATION_FAILED` (provider error or unexpected batch size), or `TRANSLATION_TIMEOUT`.

## Test corpus

- **Location:** `test-fixtures/invitation-to-offer/` at the repo root.
- **Contents:** real-world `.x83` files anonymised for licensing reasons, plus an `english/` subfolder for translation regression checks.
- **Canary:** `__tests__/corpus-sweep.test.ts` parses every `.x83` in the corpus as per-file Vitest cases and **expects zero red findings**. A red finding is a hard parse failure or a critical-shape problem in the result (no metadata, no items, broken hierarchy). Yellow findings (warnings) are logged but do not fail the test.
- **Manifests:** `__tests__/manifests/x83.json` stores per-fixture expected item count, category count, max depth, deadline count, selected metadata, and selected category/item samples.
- **Goldens:** `__tests__/goldens/*.json` stores representative normalized parse outputs. Long text keeps a reviewable snippet plus SHA-256 hashes of the full stripped and HTML fields so middle-of-field regressions still fail without producing enormous diffs.
- **Malformed fixtures:** `__tests__/fixtures/malformed/` stores invalid or unsupported XML with stable error-category assertions.
- **Other suites:** `parse-real-x83.test.ts`, `parse-real-corpus-variants.test.ts`, `edge-cases.test.ts`, `translate-x83.test.ts`.

Run from the workspace root:

```bash
pnpm --filter @catena/gaeb-parser test
```

### Updating parser goldens

Golden updates are explicit review events. Only regenerate them when an intentional parser behavior change has already been reviewed:

```bash
pnpm --filter @catena/gaeb-parser test:update-goldens
pnpm --filter @catena/gaeb-parser test
```

Review the resulting JSON diff before committing. Do not set `UPDATE_GAEB_GOLDENS=1` in CI; the test also requires the script-only `GAEB_GOLDEN_UPDATE_COMMAND=1` guard so accidental environment leakage cannot silently rewrite goldens.

### Adding a fixture

1. Drop the `.x83` file into `test-fixtures/invitation-to-offer/` with a descriptive name. Anonymise client identifiers if needed.
2. Add the expected entry to `packages/gaeb-parser/__tests__/manifests/x83.json`.
3. If the fixture is representative enough to lock full output shape, add it to `GOLDEN_FIXTURES` in `__tests__/golden-output.test.ts` and run the explicit golden update command.
4. Run `pnpm --filter @catena/gaeb-parser test`. The corpus sweep picks it up automatically.
5. If the new file produces a red finding, the regression is real — fix the parser, do not skip the file.
6. If it produces a yellow finding (e.g. a label variant we don't recognise yet), decide whether to extend an extractor or accept the warning. Document the decision in the relevant extractor file.

## Adding a new extractor

1. Add the function to `src/extractors/<name>.ts`. Keep the function pure: input is the `fast-xml-parser` document object, output is plain data.
2. Wire it into `parseGaebXml` in `src/parse.ts`, threading the result into the returned `GaebParseResult`.
3. Add the new field to `src/types.ts`. If the field carries free text, expose both stripped and HTML forms — the dashboard renders the HTML form for previews.
4. Add a fixture to `test-fixtures/invitation-to-offer/` exercising the new field (or expand an existing fixture's expectations).
5. Re-run the corpus sweep. Zero red findings.
