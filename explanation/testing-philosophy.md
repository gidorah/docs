---
title: "Testing Philosophy"
description: "Catena uses layered tests. The goal is a reliable green signal, not a large browser suite."
---

# Testing Philosophy

Catena uses layered tests. The goal is a reliable green signal, not a large browser suite.

For command details, see [`../how-to/run-the-test-suite.md`](https://github.com/gidorah/catena/blob/dev/how-to/run-the-test-suite.md). ADR-041 is the architectural source of truth for this testing model.

## Principle

Tests validate product and data contracts, not incidental implementation details. Each layer owns the cheapest reliable proof for its responsibility.

## Layers

| Layer | Tool | Owns |
| --- | --- | --- |
| Static gates | TypeScript, ESLint, Next.js build | Invalid code, invalid imports, build-time failures. |
| Parser tests | Vitest | Deterministic GAEB parsing and corpus regressions. |
| Dashboard unit/component tests | Vitest and React Testing Library | Utilities, validation, small Client Components, and Route Handler request/response behavior at mocked boundaries. |
| Database contracts | pgTAP | Migrations, SQL functions, triggers, RLS, storage-object policies, cascade, and audit invariants. |
| Playwright E2E | Playwright | A small set of critical browser journeys through the real app. |

## Current State

The parser Vitest, dashboard Vitest, and pgTAP suites exist today. The current dashboard Playwright specs are prototype smoke checks and are not the PR-safe E2E contract.

## What Belongs Where

Use parser Vitest for parser semantics and fixture regressions. Use pgTAP for database permissions, mutation guards, function contracts, and cascade behavior. Use dashboard Vitest for cheap user-visible validation and boundary behavior. Use Playwright only for critical journeys that require a browser, real routing, real auth/session behavior, or visible integration between app layers.

## What We Avoid

- No optional-pass tests where missing product behavior still passes.
- No broad Playwright coverage for cheap deterministic logic.
- No assertions against shadcn or Radix internals.
- No service-role credentials in browser code.
- No production mutation from tests.
- No coverage targets as a substitute for meaningful contracts.
