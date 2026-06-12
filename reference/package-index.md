---
title: "Package Index"
description: "Workspace packages declared in `pnpm-workspace.yaml` (which globs `packages/*`). `apps/dashboard` is the only substantive app consumer."
---

# Package Index

Workspace packages declared in `pnpm-workspace.yaml` (which globs `packages/*`). `apps/dashboard` is the only substantive app consumer.

For parser internals, see [`../packages/gaeb-parser.md`](https://github.com/gidorah/catena/blob/dev/packages/gaeb-parser.md). For shadcn/ui conventions in the dashboard, see [`./ui-patterns.md`](/reference/ui-patterns).

## Packages

| Package                   | Path                         | Exports                                                                                                                                                                                                                                                                                                                                             | Consumers                                                                                                                                                                          |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@catena/gaeb-parser`     | `packages/gaeb-parser`       | `parseGaebXml`, `GaebParseError` (root); `translateGaebX83`, `GaebTranslateError`, `createGoogleTranslateProvider` (`./translate-x83`); types `GaebParseResult`, `BoQCategory`, `BoQItem`, `GaebMetadata`, `BoQInfo`, `ParsedDeadline`, `GaebClientInfo`, `FieldSource`, `TranslationProvider`, `TranslateGaebX83Options`, `TranslateGaebX83Result` | `apps/dashboard` — `lib/document-parser.ts`, `app/api/projects/[id]/documents/route.ts`, `app/api/tools/x83-translation/route.ts`                                                  |
| `@repo/eslint-config`     | `packages/eslint-config`     | Three flat-config presets via subpath exports: `./base`, `./next-js`, `./react-internal`.                                                                                                                                                                                                                                                           | All apps and packages in the workspace.                                                                                                                                            |
| `@repo/typescript-config` | `packages/typescript-config` | TypeScript base configs (`base.json`, `nextjs.json`, `react-library.json`) consumed via `extends`.                                                                                                                                                                                                                                                  | All apps and packages in the workspace.                                                                                                                                            |

## Notes

- `@catena/*` is the product namespace. `@repo/*` is the toolchain namespace for shared config.
- `@catena/gaeb-parser` is consumed at TypeScript source level (`"main": "./src/index.ts"`); the dashboard transpiles it via `transpilePackages: ["@catena/gaeb-parser"]` in `apps/dashboard/next.config.mjs`. The package's `tsc` build emits declarations only.
