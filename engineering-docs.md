---
title: "Catena Engineering Docs"
description: "Catena is a procurement workflow platform for German general contractors that ingests GAEB tender documents and prepares them for subcontractor packaging, comparison, and award...."
---

# Catena Engineering Docs

Catena is a procurement workflow platform for German general contractors that ingests GAEB tender documents and prepares them for subcontractor packaging, comparison, and award. These docs are the engineering-side single source of truth.

If you want to read the product vision, that lives in Notion (mirrored read-only at [`notion-export/`](/notion-export)). What you'll find here is shipped behavior, current architecture, and the decisions that shape both.

## Navigate by purpose

| I want to…                                           | Go to                                                                                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Get a running dashboard locally                      | [`getting-started/local-development.md`](/getting-started/local-development)                                                       |
| Verify the system end-to-end with a real GAEB upload | [`getting-started/first-gaeb-upload.md`](/getting-started/first-gaeb-upload)                                                       |
| Know what the system actually does today             | [`overview.md`](/overview)                                                                                                         |
| Understand where the product is headed               | [`explanation/product-arc.md`](/explanation/product-arc)                                                                           |
| Add a database migration                             | [`how-to/adding-a-migration.md`](/how-to/adding-a-migration)                                                                       |
| Add a new API route or dashboard page                | [`how-to/add-an-api-route.md`](/how-to/add-an-api-route), [`how-to/add-a-dashboard-page.md`](/how-to/add-a-dashboard-page)     |
| Run the test suite                                   | [`how-to/run-the-test-suite.md`](/how-to/run-the-test-suite)                                                                       |
| Understand CI/CD and release flow                    | [`explanation/ci-cd-pipeline.md`](/explanation/ci-cd-pipeline)                                                                     |
| Use PRs, staging, and releases                       | [`how-to/work-with-prs-staging-and-releases.md`](/how-to/work-with-prs-staging-and-releases)                                       |
| Deploy or debug Coolify (self-hosted or Cloud mode) | [`how-to/deploy-to-coolify.md`](/how-to/deploy-to-coolify), [`how-to/debug-a-failed-ingest.md`](/how-to/debug-a-failed-ingest) |
| Understand the Supabase Cloud bridge strategy         | [`explanation/supabase-cloud-production-scale-strategy.md`](/explanation/supabase-cloud-production-scale-strategy)                 |
| Understand the runtime architecture                  | [`explanation/architecture.md`](/explanation/architecture)                                                                         |
| Understand the 3-layer data model                    | [`explanation/data-model.md`](/explanation/data-model)                                                                             |
| Understand the GAEB domain                           | [`explanation/gaeb-domain-primer.md`](/explanation/gaeb-domain-primer)                                                             |
| Look up tables, routes, packages, or terms           | [`reference/`](/reference)                                                                                                           |
| Read or propose an architectural decision            | [`decisions/README.md`](/decisions/README)                                                                                         |

For build/test/deploy command summaries, see [`../AGENTS.md`](https://github.com/gidorah/catena/blob/dev/AGENTS.md). This file does not duplicate them.

## Structure

The docs follow [Diátaxis](https://diataxis.fr/): four quadrants split by user intent.

- **`getting-started/`** — _Tutorials._ Learning-oriented, sequential, working code from a clean state.
- **`how-to/`** — _How-to guides._ Problem-oriented. "I have a goal; what's the minimal path?"
- **`explanation/`** — _Explanation._ Understanding-oriented. The "why" behind shapes and choices.
- **`reference/`** — _Reference._ Information-oriented. Dry lookup — tables and one-liners.
- **`decisions/`** — ADRs (architectural decisions). See [`decisions/README.md`](/decisions/README) for lifecycle.
- **`packages/`** — Per-package deep-dives (currently `gaeb-parser.md`).
- **`archive/`** — Historical material, **write-once**.
- **`notion-export/`** — Read-only mirror of the Notion product workspace.

## Governance

- **`archive/` is write-once.** It may contain claims that are no longer true (e.g. that an API route no longer exists when in fact it does). When archive and current code disagree, **trust the code.**
- **`notion-export/` is a read-only mirror.** Notion remains canonical for product/strategy. Do not edit files there expecting changes to flow back.
- **Doc-collision exclusions** (load-bearing — keeps overlap from creeping in):
  - [`overview.md`](/overview) is the ≤1-page current-tense entry point. No deep architecture, no future-tense.
  - [`explanation/architecture.md`](/explanation/architecture) owns the runtime/data-flow picture (Next.js ↔ Supabase ↔ parser).
  - [`explanation/frontend-architecture.md`](/explanation/frontend-architecture) covers RSC patterns and route groups only — **no runtime diagram** there.
  - [`explanation/product-arc.md`](/explanation/product-arc) is future-tense only. For shipped state it links back to `overview.md` rather than restating.
  - [`explanation/ci-cd-pipeline.md`](/explanation/ci-cd-pipeline) owns workflow architecture, branch/tag identity, and lane mapping. No step-by-step release checklist.
  - [`how-to/work-with-prs-staging-and-releases.md`](/how-to/work-with-prs-staging-and-releases) owns the operational PR/staging/release checklist. No workflow inventory duplication.
  - [`how-to/deploy-to-coolify.md`](/how-to/deploy-to-coolify) owns Coolify resource setup, env var names, GitHub Environment secrets, and operational gotchas. No end-to-end pipeline narrative.
- **One decision per file** in `decisions/`. No monolithic decision logs.
- **Environment variables are documented in `.env.example` files**, not in prose docs. Reference them, don't duplicate.
- **No new doc by default.** Each doc must justify the question it answers that isn't answered elsewhere.

## Forthcoming docs roadmap

These doc paths are provisioned but not yet written. They become required when the trigger fires (i.e. when the named artifact comes into existence). The PR template links contributors to this table.

| Step    | Doc                                | Path                                          | Trigger                                                   |
| ------- | ---------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Split   | Work package model                 | `explanation/work-package-model.md`           | Phase 6 migrations land                                   |
| Split   | Create a work package              | `how-to/create-a-work-package.md`             | Split UI exists                                           |
| Assign  | Assign subcontractors to a package | `how-to/assign-subcontractors-to-package.md`  | Assignment UI/API exists                                  |
| Send    | Export package bundle              | `how-to/export-package-bundle.md`             | Stage 1 manual transmission shipped                       |
| Collect | Upload incoming offer              | `how-to/upload-incoming-offer.md`             | Offer ingest endpoint exists                              |
| Compare | Preisspiegel                       | `explanation/preisspiegel.md`                 | Comparison endpoint exists                                |
| Award   | Award and confirm winner           | `how-to/award-and-confirm-winner.md`          | Award flow shipped                                        |
| Compile | Compile main offer                 | `how-to/compile-main-offer.md`                | Compilation flow shipped                                  |
| Submit  | Submit main offer                  | `how-to/submit-main-offer.md`                 | Submission flow shipped                                   |
| Stage 2 | Email integration strategy         | `decisions/0NN-email-integration-strategy.md` | Stage 2 path chosen                                       |
| Stage 3 | Subcontractor portal architecture  | `decisions/0NN-sub-portal-architecture.md`    | Stage 3 path chosen                                       |
| Stage 3 | VOB compliance tooling             | `explanation/vob-compliance.md`               | Compliance checks scoped                                  |
| Layer 3 | Intelligence architecture          | `explanation/intelligence-architecture.md`    | A non-trivial Layer 3 implementation ships                 |

### Tripwire rule

**Shipping a value-chain step requires its provisioned doc — added in the same PR or explicitly skipped with reason in the PR description.** The roadmap is operationally load-bearing, not aspirational. A trigger fires when the artifact named in its trigger column comes into existence. See [`../.github/pull_request_template.md`](https://github.com/gidorah/catena/blob/dev/.github/pull_request_template.md).
