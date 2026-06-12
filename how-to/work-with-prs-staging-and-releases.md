---
title: "Work with PRs, staging, and releases"
description: "Task-oriented guide for Catena's day-to-day development and release workflow. For why the pipelines exist and how jobs connect, see [`../explanation/ci-cd-pipeline.md`](../expla..."
---

# Work with PRs, staging, and releases

Task-oriented guide for Catena's day-to-day development and release workflow. For why the pipelines exist and how jobs connect, see [`../explanation/ci-cd-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/ci-cd-pipeline.md). For Coolify setup, GitHub Environment secrets, and tag protection UI steps, see [`deploy-to-coolify.md`](/how-to/deploy-to-coolify).

## Prerequisites

- Git access to the repository with permission to open PRs to `dev`.
- Local toolchain per [`../getting-started/local-development.md`](https://github.com/gidorah/catena/blob/dev/getting-started/local-development.md) when you want to run gates before pushing.
- For releases: permission to fast-forward `main`, create protected `v*` tags, and approve the `supabase-production` GitHub Environment when required reviewers are enabled. One-time GitHub protection setup is documented under "GitHub repository protection (Cloud production)" in [`deploy-to-coolify.md`](/how-to/deploy-to-coolify).

This workflow assumes a solo maintainer integrating through `dev`, validating on Cloud staging, and releasing via SemVer tags on `main`.

### Automated vs manual steps

| Step | Who |
| ---- | --- |
| PR Quality Gate on PR or `dev` push | Automated (`integration-tests.yml`) |
| Cloud staging on `dev` push | Automated (`cloud-migrations.yml`) |
| Fast-forward `main`, create/push tag | Manual |
| App Quality Gate on tag push | Automated |
| Production dry-run / apply | Automated; **manual approval** on paid plans (twice on `supabase-production`) |
| Coolify production deploy | Automated via workflow API — do not deploy from Coolify UI |

Do not push another release tag while a production Cloud pipeline run is in flight — staging and production jobs use non-cancellable concurrency groups.

## Pull requests

1. Branch from current `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/my-change
   ```
   As the solo maintainer you may also push directly to `dev`; the same gates below still apply on push.
2. Open a PR targeting **`dev`**, not `main`.
3. Wait for **PR Quality Gate** (`integration-tests.yml`) to pass. Required lanes: Static Checks, Parser Vitest, Dashboard Vitest, DB pgTAP, and Build. Playwright PR Smoke runs but is informational only (`continue-on-error`); it is not required for merge.
4. If you changed files under `supabase/migrations/`, **Database Migration Contract** (`migrations.yml`) also runs. It is optional for branch protection but useful for migration-only review. Authoring guidance: [`adding-a-migration.md`](/how-to/adding-a-migration).
5. **Fork PRs** fail the Fork PR Guard and do not receive a trusted green signal. Maintainers must land the change from a trusted branch.
6. Run tests locally when iterating — see [`run-the-test-suite.md`](/how-to/run-the-test-suite). Start the local Supabase CLI stack (`npm run db:start`) before `npm run ci` when your change touches migrations, SQL, or RLS. Add `npm run test:e2e` when you need the same browser coverage as CI.

Merge when required checks are green and review is complete.

## After merge to `dev`

Merging (or pushing directly to `dev`) triggers two pipelines:

1. **PR Quality Gate** on the push — same lanes as on PRs.
2. **Supabase Cloud Migration And Deploy** staging path — `App Quality Gate` then `Migrate Staging Cloud`.

Job order and step details: [`../explanation/ci-cd-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/ci-cd-pipeline.md#cloud-pipeline-jobs).

### Verify staging

1. Confirm **PR Quality Gate** on the same push to `dev` is green (Static Checks through Build).
2. Open the latest **successful** **Supabase Cloud Migration And Deploy** run for branch `dev` whose `headSha` matches the current `origin/dev` tip. Older successful runs for earlier SHAs do not count. In the Actions UI, compare the run's commit SHA to `git rev-parse origin/dev`, or list recent runs:
   ```bash
   gh run list --workflow=cloud-migrations.yml --branch=dev --limit=5
   ```
   Confirm `Migrate Staging Cloud` succeeded, including deploy and smoke steps. To verify programmatically:
   ```bash
   TARGET_SHA=$(git rev-parse origin/dev)
   RUN_ID=$(gh run list --workflow=cloud-migrations.yml --branch=dev \
     --json databaseId,headSha,conclusion \
     --jq ".[] | select(.headSha==\"$TARGET_SHA\" and .conclusion==\"success\") | .databaseId" | head -1)
   gh run view "$RUN_ID" --json jobs --jq '.jobs[] | select(.name=="Migrate Staging Cloud") | .steps[] | {name, conclusion}'
   ```
3. Check the live version endpoint on the staging dashboard (see [Cloud dashboard URLs](/how-to/deploy-to-coolify#cloud-dashboard-urls)). The JSON `commit` field must equal the merged SHA:
   ```bash
   curl -sS "https://dashboard.staging.catena.onur.sh/api/health/version"
   ```
4. Optionally sign in on staging and walk through the change manually.

If staging fails on a stale SHA because `dev` moved while the workflow was queued, that is expected and non-actionable — wait for the latest push workflow. For other failures, stop and fix before merging more changes to `dev`. The staging workflow mutates the Cloud database and deploys live code — do not stack merges hoping the next one clears it.

## Creating a release

Use this checklist when promoting a validated `dev` SHA to production:

1. **Confirm staging is green for the target SHA.** In Actions, find a successful `cloud-migrations.yml` run on `dev` whose `headSha` is the 40-character commit you intend to release. The production pipeline will refuse to run without a successful staging migration, deploy, and smoke for that exact SHA. **Note:** staging lists migration history but does not fail on drift patterns that production apply will reject — if a prior staging run succeeded before a drift condition appeared, production may still fail at "Programmatic Migration Sync & Drift Verification".
2. **Reconfirm `origin/dev` has not moved.** Fast-forward merge releases the current `dev` tip, not an earlier SHA you validated earlier:
   ```bash
   git fetch origin
   git rev-parse origin/dev   # must still equal the SHA from step 1
   ```
   If `dev` advanced, discard that validation and wait for staging to go green on the new tip before continuing.
3. **Fast-forward `main` to that SHA** — no merge commits, no direct feature work on `main`. Pushing `main` alone does **not** deploy production:
   ```bash
   git checkout main
   git merge origin/dev --ff-only
   git push origin main
   ```
4. **Pick and push a new SemVer tag** on that same commit. Tags must match `vX.Y.Z` (for example `v0.2.0`); pre-release suffixes such as `v0.2.0-rc.1` are accepted by the workflow regex but normal releases use plain SemVer:
   ```bash
   git fetch --tags origin
   git tag -l 'v*' --sort=-v:refname | head -5   # inspect existing tags
   git tag v0.2.0 "$(git rev-parse origin/main)"
   git push origin v0.2.0
   ```
   Tag push triggers the production Cloud pipeline. Create the tag only after `main` is pushed — tagging before `main` reaches the release commit breaks the identity chain.
5. **Approve production gates** when your GitHub plan supports required reviewers on `supabase-production`. After pushing the tag, open Actions → the latest **Supabase Cloud Migration And Deploy** run for the tag. **App Quality Gate** runs first without approval. When **Production Cloud Dry Run** shows **Waiting**, click **Review pending deployments** → approve `supabase-production`. Repeat when **Production Cloud Apply** waits. Rejecting or timing out stops the remaining jobs; the tag stays — fix forward or use emergency dispatch (below). **Private GitHub Free repositories cannot use environment required reviewers**, so there is no approval pause on that plan; the tag push is the release trigger.
6. **Verify production** after the workflow completes:
   - GitHub Actions: `Production Cloud Apply` succeeded (migration apply, Coolify deploy, live SHA check).
   - Live endpoint (see [Cloud dashboard URLs](/how-to/deploy-to-coolify#cloud-dashboard-urls)):
     ```bash
     curl -sS "https://dashboard.prod.catena.onur.sh/api/health/version"
     ```
     The `commit` field must match the release SHA.

**First-time empty production bootstrap** is a one-time manual `workflow_dispatch` on `cloud-migrations.yml`, not the tag path. Inputs and confirmation tokens are documented in [`deploy-to-coolify.md`](/how-to/deploy-to-coolify) under [Cloud production bootstrap](/how-to/deploy-to-coolify#cloud-production-bootstrap).

## What not to do

- **Do not push regular commits to `main`.** Production identity requires `origin/main` to match the tagged release commit.
- **Do not tag before pushing `main`.** The tag must point at the commit already on `origin/main`.
- **Do not use non-SemVer production tags.** Tag pushes must match `vX.Y.Z` (optional pre-release suffix). Arbitrary tag names do not trigger the production pipeline correctly.
- **Do not enable raw Coolify Git auto-deploy on Cloud staging or production.** Deploys must go through `cloud-migrations.yml` so migrations run first and SHA pinning is enforced.
- **Do not deploy a staging-built dashboard artifact to production without a production rebuild.** Production runs its own build with production public URLs and `CATENA_DEPLOY_ENV=production`.
- **Do not run `supabase db reset`, seed scripts, or destructive pgTAP against Cloud staging or production.** Those commands are for disposable local CLI stacks only.
- **Do not use `supabase db push --include-all` outside the one-time empty production bootstrap.** Normal recurring applies must not use `--include-all`.
- **Do not reuse or move release tags.** Tag protection and workflow identity checks assume tags are immutable pointers at release commits.

## Emergency and manual runs

Use **workflow_dispatch** on `cloud-migrations.yml` when automation is insufficient. Input names must match the workflow form exactly.

For the full input matrix (empty bootstrap, emergency apply, dry-run-only paths), see [`deploy-to-coolify.md`](/how-to/deploy-to-coolify#cloud-production-bootstrap) and the workflow form in GitHub Actions.

Quick reference:

| Scenario | Key inputs |
| -------- | ---------- |
| Empty production Cloud bootstrap | `environment=production`, `allow_include_all=true`, `confirm_empty_production_bootstrap=EMPTY-PRODUCTION-CLOUD-BOOTSTRAP`, plus matching `target_sha`, `production_release_tag`, and `confirm_production_apply` |
| Manual production apply (emergency) | `environment=production`, `apply_migrations=true`, `trigger_deploy=true`, `allow_include_all=false`, `confirm_production_apply=<same as target_sha>` |
| Production dry-run only | `environment=production`, `apply_migrations=false`, `trigger_deploy=false` |
| Staging redeploy | `environment=staging`, `target_sha=<must equal current origin/dev tip>`, `apply_migrations=true`, `trigger_deploy=true` |

Manual production apply requires `confirm_production_apply` to exactly match `target_sha`. Historical `prod-YYYYMMDD-<sha>` tags remain accepted for manual dispatch during transition; new releases should use SemVer `v*` tags.

## Cloud production recovery

See also [Cloud production rollback](/how-to/deploy-to-coolify#cloud-production-rollback) in the Coolify doc.

- **Partial pipeline failure after tag push.** If dry-run succeeded but apply failed, inspect the failed step in Actions. Do not move or delete the tag. Fix the underlying issue (Coolify credentials, drift, deploy timeout) and use emergency manual dispatch with the same `target_sha` and tag.
- **Staging smoke failed.** Download job artifacts `staging-cloud-smoke-artifacts` from the failed run. Reproduce locally with `npm run test:e2e:cloud-smoke` and the env block from [`run-the-test-suite.md`](/how-to/run-the-test-suite). Do not release until staging smoke passes on the target SHA.
- **Approval rejected or timed out.** Remaining jobs are skipped; the tag remains. Fix forward and use manual dispatch, or cut a new release after re-validating staging on `dev`.
- **Bad schema in production.** Roll forward with a fix migration on `dev` — there are no down migrations.

## Troubleshooting

| Symptom | Likely cause | Where to look |
| ------- | ------------ | ------------- |
| Production dry-run fails immediately on staging check | No successful staging run for the release SHA, or staging smoke/deploy step missing | Actions → `cloud-migrations.yml` runs on branch `dev` for that SHA |
| `Production target_sha must equal origin/main` | `main` not fast-forwarded to the release commit, or tag points elsewhere | `git log origin/main -1`; compare to tag commit `git rev-parse vX.Y.Z^{commit}` |
| Tag push rejected or production job skips | Tag name is not SemVer `vX.Y.Z` | Use `v0.2.0` pattern; see workflow SemVer check in `cloud-migrations.yml` |
| Tag commit does not match `main` or `target_sha` | Tag created before `main` push or on wrong commit | Re-tag after FF merge; use `git tag v0.2.0 "$(git rev-parse origin/main)"` |
| Staging verify shows stale SHA failure | New commits landed on `dev` after the workflow started | Expected — only the latest successful run for the current `dev` tip counts |
| Staging refuses stale SHA in migration job | Same as above during apply | Wait for the latest `dev` push workflow |
| Migration drift on production apply | Remote migration history does not match repo; staging may have passed without failing on the same pattern | Failed step "Programmatic Migration Sync & Drift Verification"; compare `supabase migration list --linked` output in logs; fix on `dev` and re-validate staging |
| `Run staging Cloud smoke` failed | E2E creds, staging URL/env mismatch, or test regression | Job artifacts `staging-cloud-smoke-artifacts`; [`run-the-test-suite.md`](/how-to/run-the-test-suite) cloud-smoke section |
| Production gate waiting / rejected | Environment approval required or denied | Actions → run → **Review pending deployments** on `supabase-production`; see step 5 above |
| Live SHA mismatch after deploy | Coolify did not rebuild with updated `CATENA_DEPLOY_SHA`, or old container still serving | Coolify deployment logs; `/api/health/version`; deploy doc [Operational gotchas](/how-to/deploy-to-coolify#operational-gotchas) |
| PR Quality Gate `db` fails | Migration or pgTAP regression | Job logs; run `npm run test:db` locally |
| Ingest or upload failures on staging after deploy | App/runtime issue, not CI wiring | [`debug-a-failed-ingest.md`](/how-to/debug-a-failed-ingest) |

## Related docs

- [`../explanation/ci-cd-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/ci-cd-pipeline.md) — architecture and workflow map.
- [`deploy-to-coolify.md`](/how-to/deploy-to-coolify) — Coolify and GitHub Environment setup.
- [`run-the-test-suite.md`](/how-to/run-the-test-suite) — local test commands.
- [`adding-a-migration.md`](/how-to/adding-a-migration) — writing and validating migrations.
