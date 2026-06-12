---
title: "Onboard a customer"
description: "How to provision a new paying customer on a Catena production deployment. MVP-honest: there is no admin UI; the flow is part env config, part Studio click-through (or SQL), part..."
---

# Onboard a customer

How to provision a new paying customer on a Catena production deployment. MVP-honest: there is no admin UI; the flow is part env config, part Studio click-through (or SQL), part email.

> **Do not onboard the first paying customer until the ADR-040 first-customer gates pass.** Production must be on Supabase Pro, restore drills must include Storage object recovery, monitoring and quota alerts must reach a real operator, and staging Cloud auth/RLS/storage/upload/ingest smoke tests must pass. See [`../explanation/supabase-cloud-production-scale-strategy.md`](https://github.com/gidorah/catena/blob/dev/explanation/supabase-cloud-production-scale-strategy.md) Phase 3.

Until the ADR-040 Cloud-mode production runbook exists, this doc is suitable for internal, demo, or non-customer self-hosted environments only.

This is a **how-to**, not a sales playbook or a billing setup guide. Billing is not implemented for the MVP. Customer-data lifecycle (export, GDPR delete, restore) is acknowledged as a real first-customer concern but is **not in scope** of this doc — it will get its own how-to once the controls exist in code.

## Two onboarding shapes

- **Self-serve (default).** With `DISABLE_SIGNUP=false` (the shipped default), the customer can register themselves at `https://<your-host>/v1/register`. The trigger described in Step 1 still fires, so `user_profiles` is backfilled. If you're running an open beta or any environment where you trust the email gate, just send the customer the URL and skip to Step 3.
- **Operator-driven (this doc's main path).** Required when you've set `DISABLE_SIGNUP=true` to gate access (recommended for the first paying customers), or when you want to pre-create the account so the customer's first interaction is "log in," not "register." Continue from Step 1.

## Prerequisites

- For internal/current self-hosted dry-runs: a Coolify-deployed Catena stack (see [`how-to/deploy-to-coolify.md`](/how-to/deploy-to-coolify)).
- For first-customer production: ADR-040 Cloud-mode production on Supabase Pro with separate staging/prod credentials and the Phase 3 gates complete.
- Access to **Supabase Studio/Dashboard** for the production project. In the current self-hosted deployment, Studio is exposed via Kong (internal port 8000); externally that's whichever Coolify domain you've routed to it. Login uses `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` from the Coolify env (must not be the `supabase`/`supabase` defaults — see `how-to/deploy-to-coolify.md`). For ADR-040 Cloud staging (live today) or Cloud production (after Phase 3 cutover), use the Supabase Cloud Dashboard for the target project instead.
- Access to the Coolify dashboard for the project (to set per-deployment env vars).
- **For Option A only:** a real SMTP relay configured. In self-hosted mode, the shipped `.env.example` defaults (`SMTP_HOST=supabase-mail`, `SMTP_USER=fake_mail_user`, etc.) are a local mail trap and **will silently swallow invite emails in production**. Set real `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_ADMIN_EMAIL` in Coolify. In Cloud mode, configure SMTP, Site URL, redirect allowlist, OAuth, email confirmation, and related Auth settings in the Supabase Cloud Dashboard per the [Supabase Cloud auth checklist](/how-to/deploy-to-coolify#supabase-cloud-auth-checklist). Verify by sending an invite to your own address before touching the customer's address.
- The customer's primary email address.

## Step 1 — Create the auth user

There is no admin UI. Two options, in order of preference:

**Option A — Supabase Studio invite (preferred):**

1. Open Studio → **Authentication** → **Users** → **Invite user**.
2. Enter the customer's email. In self-hosted mode, Studio sends a magic-link / invite via the configured SMTP relay (`SMTP_*` env vars in `docker-compose.yml`). In Cloud mode, Supabase Cloud uses the Auth email/SMTP settings configured in that Cloud project.
3. The customer follows the link, sets a password, and lands on the dashboard logged in.

This path triggers the `on_auth_user_created` trigger defined in `supabase/migrations/20251115000001_create_user_profiles.sql`, which inserts the matching row into `public.user_profiles` automatically. Verify the row exists in Studio → **Table Editor** → `user_profiles` before declaring done.

**Option B — admin SQL (fallback when SMTP isn't configured or invite emails are blocked):**

This path uses `crypt()` and `gen_salt()` from `pgcrypto`. The Supabase Postgres image ships pgcrypto pre-installed; if you ever migrate off it, run `CREATE EXTENSION IF NOT EXISTS pgcrypto;` first.

Generate a strong temporary password locally — **do not type one in by hand** and do not leave the placeholder string in place:

```bash
openssl rand -base64 24
```

Then in Studio's SQL editor (or `psql`):

```sql
-- REPLACE both placeholders below: the email and the password.
-- Leaving 'TEMP_PASSWORD_HERE' will create the user with the literal
-- string as their password — exactly what you don't want.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'customer@example.com',
  crypt('TEMP_PASSWORD_HERE', gen_salt('bf')),
  NOW(),                  -- skip email confirmation
  'authenticated',
  'authenticated',
  NOW(),
  NOW()
);
```

The `on_auth_user_created` trigger fires on direct `auth.users` inserts too, so `public.user_profiles` gets backfilled the same way as in Option A. Setting `email_confirmed_at` to a non-null timestamp lets the user log in without the confirmation bounce.

Send the password through a channel that doesn't store it indefinitely — a 1Password / Bitwarden share link, Signal, or the customer's own password reset (have them hit "Forgot password" on first login if SMTP works for resets but not for invites). Plain email is the wrong answer.

## Step 2 — Initial project (skip)

Customers create their own first project via the dashboard wizard at `/dashboard/projects/new`. There is no admin path to pre-seed projects, and you should not create one with raw inserts — the project wizard runs validation and side-effects (storage bucket setup, document records) that are awkward to replicate by hand.

## Step 3 — Set per-customer feature flags

If the customer needs a flag-gated surface that isn't in the global default, that currently means a Coolify environment dedicated to them — see [`how-to/roll-out-a-feature-flag.md`](/how-to/roll-out-a-feature-flag) for the rollout mechanics and [`reference/feature-flags.md`](https://github.com/gidorah/catena/blob/dev/reference/feature-flags.md) for the current inventory.

For shared production with no per-customer flag overrides, skip this step.

## Step 4 — Communicate access

Send the customer:

- The dashboard URL for their environment (e.g. `https://app.catena.example`).
- Their login email (the one used in Step 1).
- For Option A: a note that the invite email is en route — link expires per Supabase defaults.
- For Option B: their temporary password, with a request to change it on first login (the dashboard has a profile/password screen).

## Verify (operator self-test, then customer hand-off)

Don't make the paying customer the first person to touch the new account. Run a self-test on the same stack with a throwaway email of your own (or an alias):

1. Repeat Step 1 with your own email — Option A round-trip into your inbox, or Option B with a generated password.
2. Log in. You should see the dashboard home page (no redirect loop, no 404).
3. Create a new project via the wizard at `/dashboard/projects/new`.
4. Upload a `.x83` GAEB file from `test-fixtures/invitation-to-offer/` (see [`getting-started/first-gaeb-upload.md`](https://github.com/gidorah/catena/blob/dev/getting-started/first-gaeb-upload.md) for the canonical smoke test) and confirm `parse_status = 'success'` in `project_documents` (Studio → Table Editor).

If any step fails for you, fix it before sending Step 4's email to the customer. If step 4 fails specifically at ingest, [`how-to/debug-a-failed-ingest.md`](/how-to/debug-a-failed-ingest) is the next doc. Once your self-test passes, repeat Step 1 for the real customer and send the Step 4 communication.

## Known gaps

- **No customer admin UI.** All provisioning is Studio + SQL.
- **No bulk onboarding.** Each user is a one-shot operation.
- **No tenant boundary.** All authenticated users live in the same Postgres database; isolation is by RLS on `created_by`, not by separate schemas or projects. Multi-tenant deployments today mean a separate Coolify stack per tenant.
- **No data export, GDPR delete, or restore tooling.** Out-of-scope for this doc; tracked as a first-customer-foundation gap.
