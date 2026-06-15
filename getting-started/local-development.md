---
title: "Local development"
description: "Goal: from `git clone` to a dashboard running on http://localhost:3002 talking to a local Supabase stack, in five steps."
---

# Local development

Goal: from `git clone` to a dashboard running on [http://localhost:3002](http://localhost:3002) talking to a local Supabase stack, in five steps.

This is a **tutorial**: follow it top to bottom on a clean machine and it should work. If it doesn't, that's a bug in this doc — file an issue rather than improvising.

It is not:

- a deployment guide — see `how-to/deploy-to-coolify.md`
- a troubleshooting encyclopedia — only the most common failure modes are listed at the bottom
- IDE setup — out of scope

## Prerequisites

- **Node.js ≥ 20** (see `package.json` `engines.node`).
- **pnpm 10** — pinned in root `package.json` `packageManager`. After `corepack enable`, run `corepack install` in the repo. Pnpm settings belong in `pnpm-workspace.yaml`, not `.npmrc`.
- **Docker \+ Docker Compose v2** — the local Supabase stack is ~13 containers; allow it ~6–8 GB of RAM.
- **`curl`** — `scripts/docker-init.sh` uses it to fetch upstream Supabase config.

## Step 1 — Clone and install

```bash
git clone https://github.com/JacopKane/catena.git
cd catena
git checkout dev   # dev is the integration branch; PRs target it (see AGENTS.md)
pnpm install
```

> Substitute your fork's URL if you've forked the repo (e.g. `git@github.com:<your-username>/catena.git`). The canonical upstream is `JacopKane/catena`.

`pnpm install` resolves all workspaces declared in `pnpm-workspace.yaml` (the dashboard, `gaeb-parser`, and the shared `eslint-config`/`typescript-config` packages).

## Step 2 — Environment variables

There are **two** `.env.example` files, and you need both. They configure different processes:

| File | Used by | What it configures |
| --- | --- | --- |
| `./.env.example` | The Supabase Docker stack (`docker-compose.yml` plus the `docker-compose.local.yml` overlay that `npm run docker:up` layers on for host-port bindings \+ dashboard hot-reload). | Postgres, Auth (GoTrue), Kong, Studio, Storage. Includes JWT secrets and the dev `SITE_URL=http://localhost:3000`. |
| `apps/dashboard/.env.example` | The Next.js dashboard process (`pnpm dev:dashboard`). | `NEXT_PUBLIC_SUPABASE_URL`, anon key, service-role key, `NEXT_PUBLIC_SITE_URL=http://localhost:3002`, `PORT=3002`. |

Copy both:

```bash
cp .env.example .env
cp apps/dashboard/.env.example apps/dashboard/.env.local
```

The dev defaults in both files are wired to work together against the local stack — `NEXT_PUBLIC_SUPABASE_URL` points at Kong on :8000, and the `ANON_KEY` / `SERVICE_ROLE_KEY` in both files are Supabase's public demo JWTs that Kong on :8000 hands out. Don't change them for local dev.

`ANTHROPIC_API_KEY` and cloud Supabase entries are blank by design — they're optional for local dev and only needed for future AI category suggestions or manually managed cloud environments.

> **Why the URL split?** `SITE_URL` (root) is the Supabase **Auth** redirect target — that runs in the Kong/GoTrue container and points at where users are bounced back after email-confirm flows. `NEXT_PUBLIC_SITE_URL` (dashboard) is what the Next.js app announces about itself. The dashboard runs on :3002, so they differ. Don't collapse them. See also `src/lib/supabase/server.ts` for the parallel `SUPABASE_URL` (server, internal) vs `NEXT_PUBLIC_SUPABASE_URL` (browser) split.

For all environment variables (purpose, defaults, when each is required), read the two `.env.example` files directly — they are the source of truth, and prose docs deliberately do not duplicate them.

## Step 3 — Start the Supabase stack

The first time only, run the init script. It creates the `docker/volumes/` tree and downloads upstream Supabase config (Kong YAML, Postgres bootstrap SQL, Logflare config) into it:

```bash
npm run docker:init
```

Then bring everything up:

```bash
npm run docker:up
```

This runs the Compose `migrator` service first, starts Auth so GoTrue can finish its own schema setup, seeds local test fixtures, then starts the stack. The migrator applies every file in `supabase/migrations/` in timestamp order and records applied versions in `public.schema_migrations`.

When it finishes you should see:

- **Dashboard:** `http://localhost:3002` — already started inside the compose stack (see Step 4 if you'd rather run it on the host)
- **Supabase Studio:** `http://localhost:8000` — login `supabase` / `supabase`
- **Postgres:** `localhost:5432` — `postgres` / `CHANGE_ME_IN_PRODUCTION` (if you applied the port-5432 override below, use the host port you remapped to instead — e.g. `54322`)

Check the containers are healthy:

```bash
docker ps --filter "name=catena-" --format "table {{.Names}}\t{{.Status}}"
```

All long-running services should be `Up` (Studio, Kong, Auth, REST, Realtime, Storage, Imgproxy, Meta, Edge Functions, Analytics, DB, Vector, Supavisor, and Dashboard). The `migrator` service is expected to show as exited successfully.

## Step 4 — Start the dashboard

`docker compose up -d` (Step 3) already starts a `catena-dashboard` container at [http://localhost:3002](http://localhost:3002) with hot-reload and your `apps/dashboard` directory bind-mounted. **For most fresh devs there is nothing to do in this step** — the dashboard is already live.

If you'd rather run Next.js directly on the host (faster `Fast Refresh`, easier `pnpm` debugging), stop the in-compose dashboard first to free port 3002, then start it via host pnpm:

```bash
docker compose stop dashboard
npm run dev:dashboard
```

This runs `turbo run dev --filter=@catena/dashboard`, which starts Next.js 16 on [http://localhost:3002](http://localhost:3002). To return to the all-in-Docker flow: `Ctrl+C`, then `docker compose start dashboard`.

> **Note:** `npm run dev` (no filter) attempts to start every workspace's dev task. Prefer `dev:dashboard` for day-to-day dashboard work. See `AGENTS.md` § Repository Shape.

## Step 5 — Seed test users

`npm run docker:up` runs this automatically for local development. If you reset or modify the local database manually, run the seed again:

```bash
npm run db:seed
```

This applies `supabase/seed.sql` against `catena-supabase-db` and creates five confirmed-email test users:

| Email | Password |
| --- | --- |
| `test@catena.example.com` | `TestPassword123!` |
| `test1@catena.example.com` | `TestPassword123!` |
| `test2@catena.example.com` | `TestPassword123!` |
| `test3@catena.example.com` | `TestPassword123!` |
| `test4@catena.example.com` | `TestPassword123!` |

The seed also inserts a few sample projects owned by the primary test user. Re-running it is safe — the helper checks for existing emails and skips them.

## Verify

- `http://localhost:3002` redirects you to a login screen (under `/[locale]/v1/login`).
- You can log in as `test@catena.example.com` / `TestPassword123!` and land on the dashboard.
- `http://localhost:8000` opens Supabase Studio and you can list tables — you should see `projects`, `project_documents`, `boq_categories`, `boq_items`, etc.
- Studio's **SQL Editor** can run `select count(*) from public.schema_migrations;` and returns a non-zero number — the Compose migrator records each applied file there.

If all four pass, the next thing to do is the end-to-end smoke test: [`first-gaeb-upload.md`](/getting-started/first-gaeb-upload).

## Common issues

**Containers crash-loop or `docker:up` migrations fail.** Almost always a stale volume. Run `npm run docker:clean` (this destroys local DB data) and start over from Step 3.

**Postgres major version changed.** Existing local volumes from the older Postgres image cannot be reused with the current Postgres 17 image. Run `npm run docker:clean` before `npm run docker:up` if the DB container refuses to start after pulling a new Postgres major version.

**Port 5432 already allocated.** The `docker-compose.local.yml` overlay binds Supavisor (the Postgres pooler) to `${POSTGRES_PORT:-5432}` on the host, so any other Postgres on the host (a different Docker project, a system-installed `postgresql.service`, etc.) blocks the pooler from starting. Quick check: `ss -lntp | grep 5432` (or `sudo lsof -i :5432`) tells you what's holding it.

Always confirm with `docker ps --filter "name=catena-supabase"` after Step 3: every service should be `Up`. If a service is missing or `Created`, you have two options:

1. **Recommended for parallel-project devs:** set `POSTGRES_PORT=54322` (or any free port) in your repo-root `.env`. The overlay's `${POSTGRES_PORT:-5432}` resolves to your override, so nothing else changes. (`docker-compose.override.yml` no longer auto-loads because `npm run docker:up` uses explicit `-f` flags; env-var overrides are the supported escape hatch.)
   Then update `apps/dashboard/.env.local` if you connect any host-side tooling (psql, a TablePlus session) — the dashboard itself talks to the DB via Kong on :8000, so it doesn't need the override.
2. **Quick-and-dirty:** stop the conflicting service (`docker stop <other-container>` or `sudo systemctl stop postgresql`) and re-run `npm run docker:up`. Fine if you only run one Postgres project at a time.

**ARM64 Linux (e.g. Apple Silicon over a Linux VM, or an AArch64 host).** A handful of Supabase images publish AMD64-only tags. If `docker compose up` reports `no matching manifest`, set `DOCKER_DEFAULT_PLATFORM=linux/amd64` in your shell before `npm run docker:up`. Performance is fine via emulation for development.

**`realtime-dev.catena-supabase-realtime` shows `(unhealthy)`.** The realtime container is running and serving traffic, but its healthcheck calls `/api/tenants/realtime-dev/health` with `Authorization: Bearer ${ANON_KEY}` and gets `403`. This appears related to tenant bootstrap (the `realtime-dev` tenant row in the DB) and does **not** block the dashboard's main flows. Treat as a known issue unless you need realtime subscriptions for what you're working on.

**Next.js cannot resolve an installed workspace dependency, or `pnpm install` fails with `EACCES` under `apps/dashboard/node_modules`.** The dashboard container bind-mounts `apps/dashboard`, so root-run builds can leave root-owned `.next` artifacts on the host. The current local Compose overlay masks `/app/apps/dashboard/node_modules` with a Docker volume, but older containers, alternate Docker commands, or manual root-run installs can still leave a root-owned host `apps/dashboard/node_modules`. Both cases can break host-side installs and produce misleading module resolution errors such as `Module not found: Can't resolve 'fast-xml-parser'`.

First stop the dashboard container so it is not writing to `.next`, then remove any root-owned host artifacts and reinstall from the host:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml stop dashboard
docker run --rm -v "$PWD:/work" -w /work alpine:3.20 sh -c 'rm -rf apps/dashboard/node_modules apps/dashboard/.next'
pnpm install
```

After that, rerun the failing host command, for example `pnpm --filter @catena/dashboard build` or `npm run dev:dashboard`. To avoid the issue, do not run package installs inside the bind-mounted dashboard container; use host `pnpm install` for local development.

**Arch Linux \+ Docker rootless.** The `docker/volumes/db/` directory is bind-mounted into the Postgres container as `uid 70`. If your rootless setup remaps user namespaces, Postgres will fail to start with `permission denied`. Easiest fix: switch to rootful Docker (`sudo systemctl enable --now docker`) for this project.