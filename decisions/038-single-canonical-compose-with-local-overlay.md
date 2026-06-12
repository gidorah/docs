---
title: "ADR-038: Single Canonical Compose File with Local-Dev Overlay"
description: "Until this ADR, the repo carried two near-duplicate top-level Compose files:"
status: Accepted
date: 2026-05-04
implementation: shipped
implemented-in: docker-compose.yml + docker-compose.local.yml
---


## ADR-038: Single Canonical Compose File with Local-Dev Overlay

### Context

Until this ADR, the repo carried two near-duplicate top-level Compose files:

- `docker-compose.yml` — what local dev used (the version `npm run docker:up` invoked).
- `docker-compose.self-hosted.yml` — what Coolify deployed to production.

Every change to one had to be hand-mirrored to the other, and that demonstrably failed: the kong modernization in commit `0d74cc2` (`kong/kong:3.9.1`, awk entrypoint, `post-function` plugin, opaque-key env passthrough) landed in the local-dev file only. Production sat on `kong:2.8.1` with an older inline-`eval` entrypoint for almost a year. The local-dev validation surface stopped predicting production behavior.

Coolify accepts exactly one Compose file path per app — verified by reading the Coolify-host-rendered `/data/coolify/applications/<id>/docker-compose.yaml`, which is a single file. So `docker compose -f base -f override` chaining is not an option for the deployed configuration.

### Decision

One **canonical** `docker-compose.yml` is the source of truth. Coolify deploys it directly to both `coolify-dev` (auto-tracks `dev`) and `coolify-prod` (auto-tracks `main`). The two Coolify environments differ in env-var values only (URLs, secrets), handled by Coolify's per-app env config — not by separate compose files.

One **committed local-dev overlay** `docker-compose.local.yml` carries only the things that genuinely differ for local development: host port bindings (kong 8000/8443, supavisor 5432/6543, analytics 4000, dashboard 3002), a `Dockerfile.dashboard`-based hot-reload dashboard service, and `extra_hosts: localhost:host-gateway`. `npm run docker:up` expands to `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d`.

The committed-but-gitignored `docker-compose.override.yml` convention stays reserved for personal per-dev escape-hatch overrides (port conflicts, etc.), but because explicit `-f` flags suppress auto-loading of `override.yml`, the supported escape hatch for local conflicts is now setting environment variables (e.g. `POSTGRES_PORT=54322` in `.env`) — every overlay port uses a `${VAR:-default}` form to make this work.

`docker-compose.self-hosted.yml` is deleted.

### Defensive design rule

Commit `e203526` worked around a Coolify quirk by removing five Compose top-level `configs:` blocks with inlined `content:` and replacing each with bind mounts. The forgotten quirk's surface is **Compose top-level `configs:` blocks with inlined `content:`** — verified by reading `e203526` directly: that commit's removed blocks all carried `target:` / `source:` / `mode:` triples on `configs:`. The kong `entrypoint:` containing `$$(cat ~/temp.yml)` survived `e203526` byte-identical, proving inline `$` in `command`/`entrypoint` is **not** the quirk surface.

The defensive rule going forward is therefore narrowly scoped: **no Compose top-level `configs:` blocks with inlined `content:` — every config is delivered via bind-mount.** The new canonical `docker-compose.yml` already satisfies this rule (zero `configs:` blocks).

### Consequences

- **Lost:** the ability to deploy local-dev-shaped containers (with hot reload + bind-mounts) accidentally to production. Local dev runs the prod-style image only when the overlay is omitted.
- **Gained:** drift between local and prod is structurally impossible — they share the same file. Any future modernization is a single edit.
- **Behavior change at deploy time:** the canonical dashboard service now declares `build.args` for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The pre-consolidation production compose had no `args:` block, so `Dockerfile.self-hosted`'s `ARG NEXT_PUBLIC_*` declarations resolved to empty strings at build time — empty values were baked into the client JS bundle, silently breaking browser-side Supabase calls (SSR worked because env vars apply at runtime). Production dashboards have likely been silently broken on this surface; the consolidation fixes it.
- **One-time Coolify UI reconfiguration required:** the "Docker Compose Location" field on each app must be flipped from `docker-compose.self-hosted.yml` to `docker-compose.yml`. See `docs/how-to/deploy-to-coolify.md`.
- **Project-name collision (acceptable):** `docker-compose.yml` and `docker-compose.runner.yml` both declare `name: catena-supabase`. Local dev and runner stacks collide on container names if both are up simultaneously. Out of scope for this consolidation — flagged here so future readers don't trip on it.

### Bind-mount regression caught at first Coolify deploy (2026-05-04)

The first Coolify deploy of the consolidated compose failed with `dependency failed to start: container vector ... is unhealthy`. Vector started but its `:9001/health` endpoint never came up because the docker-socket bind was broken.

Root cause: the canonical compose inherited `,z` (SELinux relabel-shared) on the `docker.sock` bind from the pre-consolidation local-dev `docker-compose.yml`. The pre-consolidation **`docker-compose.self-hosted.yml`** intentionally omitted `,z` on this one mount — relabeling a Unix domain socket can change its SELinux context in ways that break the docker daemon's own use of the socket and propagate as silent socket-access failures inside the container. That asymmetry was deliberate but undocumented, and the consolidation lost it. The hotfix removes `,z` from the docker.sock line _only_ (other bind mounts of regular files keep `,z`), and adds a `:-/var/run/docker.sock` default for defensive symmetry with the overlay's `:-` ports.

**Rule going forward:** never apply `,z` / `,Z` to socket bind mounts. Regular files and directories are fine; sockets are not.

### Bind-mount-source delivery regression caught at second Coolify deploy (2026-05-04)

After the `,z`/socket fix, the next deploy failed at kong start with `runc create failed: exec: "/home/kong/kong-entrypoint.sh": is a directory`. On the host, `/data/coolify/applications/<uuid>/docker/volumes/api/kong-entrypoint.sh` existed as an **empty directory**, and the sibling `kong.yml` was a stale file from before the consolidation's upstream refresh.

Root cause: Coolify's deploy model only writes the **rendered compose file** to `/data/coolify/applications/<uuid>/`. It does not sync the repo's `docker/volumes/` subtree to that directory. Build-time COPY can read repo files (the helper container exposes them under `/artifacts/<uuid>/`), but runtime bind mounts are resolved by the host docker daemon, which has no view of `/artifacts/`. When a bind-mount source path doesn't exist on the host, docker silently auto-creates an empty _directory_ at that path; that directory then persists across redeploys and breaks `entrypoint:` / `command:` resolution.

The pre-consolidation flow worked only because `kong-entrypoint.sh` was not in git — operators placed it on each VPS manually (or via Coolify's "File Mount" persistent-storage UI). The consolidation commit added the script to git ("Track kong-entrypoint.sh in git with exec bit") without adding a delivery mechanism to the runtime host, so the bind mount silently failed. ADR-038's "every config delivered via bind-mount" rule sidesteps the `e203526` quirk but assumed the bind-mount source already existed on host — an assumption that's only true for files Coolify happens to know about.

**Fix:** the kong service now uses a tiny `build:` block (`docker/kong/Dockerfile`) that COPIES `kong.yml` and `kong-entrypoint.sh` into a derivative image. No runtime bind mount is needed for these files. The build phase has full repo access via the helper container's artifacts directory, so the COPY is reliable on every deploy.

**Rule going forward:** repo files that are needed at container runtime (entrypoint scripts, declarative configs, fixture data) must be **baked into the image via a `build:` + `COPY`**, not bind-mounted from the repo at runtime. Bind mounts are appropriate only for: (1) host-managed paths Coolify or the operator owns (sockets, volume directories under `/data/coolify/...`), or (2) files set up explicitly via Coolify's File Mount UI. ADR-038's "no `configs:` blocks with inlined `content:`" rule still holds.

#### Follow-up gotchas surfaced when implementing the bake (2026-05-04)

Two further failures appeared when the kong build first ran on Coolify:

1. **`.dockerignore` excluded the source files.** The line `docker/volumes/` (correct under the pre-consolidation assumption that `docker/volumes/` was only ever a runtime bind-mount source tree) excluded `kong.yml` and `kong-entrypoint.sh` from BuildKit's context. BuildKit reported `failed to compute cache key: ... "/docker/volumes/api/kong.yml": not found`. Fix: explicit negations for the two files and their parent (`!docker/volumes/api/`, `!docker/volumes/api/kong.yml`, `!docker/volumes/api/kong-entrypoint.sh`). The exclusion remains correct for the other `docker/volumes/` subtrees (db/, logs/, pooler/, functions/, storage/) which are still runtime-only.
2. **`/home/kong/` doesn't exist in `kong/kong:3.9.1`.** When `COPY --chmod=0644 ... /home/kong/temp.yml` runs against a missing parent directory, BuildKit auto-creates the directory **and applies `--chmod=0644` to it** — yielding `drw-r--r--` (no `x` bit), which means the kong user (uid 1001) cannot _traverse_ the directory at runtime. The file is fine; the directory is not. Symptom would be a runtime "permission denied" reading the entrypoint, masked as a kong startup failure. Fix: `USER root; RUN mkdir -p /home/kong && chmod 0755 /home/kong` before the COPYs, then `USER kong` after.

**Rule going forward:** when adding `build:` + `COPY` for a service, (a) verify the source path isn't `.dockerignore`'d, and (b) verify the destination's parent directory exists in the base image, or explicitly create it with traversable perms before COPY. Test locally with `docker build` + `docker run --rm <image> ls /target/dir` as the runtime user before relying on Coolify to surface the failure.

### What's intentionally out of scope

- `docker-compose.runner.yml`, `docker-compose.coolify.yml` — unrelated to the local-vs-prod consolidation.
- Dockerfile consolidation beyond removing confirmed orphans.
- Investigating the original `e203526` quirk's root cause — the defensive design above sidesteps it.

### Cleanup amendment (2026-05-11)

`docker-compose.test.yml` was removed during stale-code cleanup. The retained Compose files are the canonical deployment/local stack (`docker-compose.yml` plus `docker-compose.local.yml`), the Coolify helper compose, and the self-hosted runner compose.

### Implementation notes

ADR-040 accepts a Cloud production topology where Coolify runs the dashboard and Supabase Cloud owns the backend. ADR-043 is the follow-up decision that added the dedicated `docker-compose.cloud.yml` artifact for that topology. This ADR remains authoritative for local/self-hosted mode and the current shipped self-hosted Coolify deployment.
