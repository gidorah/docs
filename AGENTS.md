# Documentation project instructions

## About this project

- Mintlify site for [Catena](https://github.com/gidorah/catena) engineering docs
- Source of truth remains `gidorah/catena/docs/` in the monorepo; this repo is the published Mintlify mirror
- Pages are Markdown (`.md`) with YAML frontmatter — MDX also works
- Configuration lives in `docs.json`
- Run `mint dev` to preview locally
- Run `mint broken-links` to check links

## Re-import from Catena

When `catena/docs` changes and you want to refresh Mintlify:

```bash
node scripts/import-from-catena.mjs
node scripts/generate-docs-json.mjs
mint broken-links
```

Requires `../catena` cloned next to this repo (`~/Dev/catena` and `~/Dev/gidorah-docs`).

## What gets imported

- `getting-started/`, `how-to/`, `explanation/`, `reference/`, `decisions/`, `packages/`
- `overview.md` and `docs/README.md` (as `engineering-docs`)
- **Excluded:** `archive/` (historical, write-once), `notion-export/` (Notion product mirror)

## Style

- Follow existing Catena doc voice: precise, current-tense for shipped behavior
- Internal doc links use Mintlify paths (`/explanation/data-model`), not `.md` relatives
- Links to monorepo files outside `docs/` point to GitHub (`gidorah/catena` on `dev`)
