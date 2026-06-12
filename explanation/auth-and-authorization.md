---
title: "Auth and Authorization"
description: "How users sign in, how the dashboard gets a session, and how Postgres row-level security (RLS) — not application code — enforces project isolation."
---

# Auth and Authorization

How users sign in, how the dashboard gets a session, and how Postgres row-level security (RLS) — not application code — enforces project isolation.

This page is conceptual. For "which client do I import?" see [`../how-to/add-a-supabase-client.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-a-supabase-client.md). For the auth-bound layouts and route groups, see [`frontend-architecture.md`](/explanation/frontend-architecture).

## Auth flow

Supabase GoTrue is the identity provider. The dashboard is a thin layer on top.

```
Browser                      Dashboard                    Supabase
   │                            │                            │
   │  POST /[locale]/v1/login ─▶│ loginAction                │
   │  email + password          │   (server action,          │
   │  + remember (checkbox)     │    src/app/actions/auth.ts)│
   │                            │                            │
   │                            │ supabase.auth              │
   │                            │  .signInWithPassword() ───▶│ GoTrue
   │                            │                            │
   │                            │ ◀─── { access_token,       │
   │                            │       refresh_token, user }│
   │                            │                            │
   │                            │ server.ts createClient()   │
   │                            │   writes environment-scoped│
   │                            │   Supabase auth cookie     │
   │                            │   cookie (chunked .0/.1    │
   │                            │   when payload is large).  │
   │                            │   maxAge = 30d (remember)  │
   │                            │             | session-only │
   │ ◀── 302 to /dashboard ─────│                            │
   │                            │                            │
   │  subsequent requests       │ server.ts createClient()   │
   │  carry the cookie    ─────▶│  reads it, hands the JWT   │
   │                            │  to PostgREST/Storage      │
```

Sign-in and sign-up are server actions in `src/app/actions/auth.ts` (`loginAction`, `signUpAction`); the auth pages submit forms to them rather than calling `supabase.auth` from the browser. Both server actions use `createClient()` from `src/lib/supabase/server.ts`, so the cookie write happens server-side via Next.js's `cookies()` API.

Cookie policy is centralized in `src/lib/supabase/config.ts` and shared by the browser client, server client, and proxy. Local/self-hosted mode keeps `sb-kong-auth-token`; Cloud mode uses environment-scoped names such as `sb-catena-staging-auth-token` and `sb-catena-production-auth-token`, with secure host-only cookies. For local development only, `CATENA_ALLOW_LOCAL_COOKIE_AUTH_FALLBACK` (documented in `.env.example`) enables a synthetic session inside `proxy.ts` when `getUser()` fails but a local auth cookie exists — only when `CATENA_SUPABASE_MODE=local`, `NODE_ENV=development`, the flag is `"true"`, and `NEXT_PUBLIC_SUPABASE_URL` points at localhost. Leave it disabled outside local troubleshooting; it is not suitable for real RLS testing. `@supabase/ssr` writes a single auth-token cookie carrying both the access and refresh tokens (chunked across `.0`, `.1`, … cookies when the JWT payload exceeds the per-cookie size limit). There is no separate `sb-access-token` / `sb-refresh-token` split.

A Postgres trigger on `auth.users` automatically materializes a `public.user_profiles` row when GoTrue creates the auth user, so application code never has to remember to do it. The original function was created as `public.handle_new_user()`; the Cloud privilege-hardening migration moves it to `private.handle_new_user()`, pins its search path, and keeps it trigger-only. Note that the trigger fires at sign-up time, before email confirmation — and email confirmation **is** required (the login action surfaces `"Email not confirmed"` when a user tries to sign in without confirming). An unconfirmed user therefore has a `user_profiles` row but cannot authenticate.

Auth pages live under `apps/dashboard/src/app/[locale]/(auth)/v1/{login,register,forgot-password,update-password}`. The `(auth)` route group has its own layout — unauthenticated traffic lands here. The `(main)` route group is auth-bound. All four pages submit to server actions in `src/app/actions/auth.ts`:

- `signUpAction` — `auth.signUp()` with `emailRedirectTo` of `/auth/confirm?next=/[locale]/dashboard/default`, returns success and waits for the confirmation email.
- `loginAction` — `auth.signInWithPassword()`, reads the `remember` form field and passes it to `createClient(remember)` so the cookie's `maxAge` is set when written.
- `logoutAction` — `auth.signOut()` and redirect to `/[locale]/v1/login`.
- `requestPasswordResetAction` — `auth.resetPasswordForEmail()` with a `redirectTo` of `/auth/callback?next=/[locale]/v1/update-password`. The callback route consumes the OTP and establishes a session before the user lands on update-password.
- `updatePasswordAction` — `auth.updateUser({ password })`, gated by `getUser()` so it only runs for an authenticated session.

After sign-in, subsequent requests carry the cookie back to the server. `server.ts createClient()` reads it inside RSCs, route handlers, and server actions and hands the JWT to PostgREST/Storage on the user's behalf. `src/proxy.ts` performs the route-level session check/refresh path for locale-prefixed **pages** using the same cookie policy. Its `config.matcher` excludes `/api/*`, `/auth/*`, and `/monitoring` (Sentry browser tunnel) so upload, callback, and tunnel route handlers receive unconsumed bodies and perform their own auth. Cookie writes inside `createClient()` are wrapped in a `try` because RSCs can't mutate cookies, but server actions, route handlers, and the proxy path can.

The `rememberMe` flag toggles between a 30-day cookie (`60 * 60 * 24 * 30`) and a session cookie (no `maxAge`, expires when the browser closes). The factory's parameter default is `true` — that's the default the _server action_ picks up if the form omits the field. The login form's "remember me" checkbox is unchecked by default, so the user-experience default is the session cookie.

## Three Supabase clients

The dashboard ships **three** Supabase clients on purpose, because the mistakes they prevent are mechanical: importing `admin.ts` from a Client Component ships the service-role key to the browser bundle; using the browser client server-side won't carry the user's cookies. The split keeps each kind of mistake from being possible in code that imports the right file.

| File                         | Auth context                                | RLS applies? | Use it for                                         |
| ---------------------------- | ------------------------------------------- | ------------ | -------------------------------------------------- |
| `src/lib/supabase/client.ts` | Anon key + user session via browser cookies | Yes          | Client Components.                                 |
| `src/lib/supabase/server.ts` | Anon key + user session via Next.js cookies | Yes          | RSC, route handlers, server actions.               |
| `src/lib/supabase/admin.ts`  | Service role key (bypasses RLS)             | **No**       | Privileged server-only work where RLS can't apply. |

The default in any new code is `server.ts`. Reach for `admin.ts` only when you have a concrete reason RLS is in your way. Importing `admin.ts` from a Client Component leaks the service role key to the browser bundle.

The three-client split is locked in by [ADR-036](https://github.com/gidorah/catena/blob/dev/decisions/036-three-supabase-clients.md). The how-to guide ([`../how-to/add-a-supabase-client.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-a-supabase-client.md)) covers the decision flow and common mistakes.

Cloud mode validates Supabase environment variables before creating clients. It rejects local/self-hosted URLs, non-HTTPS Cloud dashboard URLs, mismatched project refs, demo anon keys, public service-role keys, and `SUPABASE_SERVICE_ROLE_KEY` in the dashboard runtime. Service-role access remains available only through `admin.ts` and staging E2E runner setup where explicitly configured.

## RLS ownership chain

Project isolation is enforced by row-level security policies, not by the dashboard adding `WHERE created_by = $userId`. The chain from `auth.uid()` to canonical rows is:

```
auth.uid()
   │
   └──▶ projects.created_by         (creator-only, MVP)
            │
            └──▶ project_documents.project_id
                     │
                     └──▶ document_structures.document_id
                              │
                              ├──▶ canonical_categories.document_structure_id
                              ├──▶ canonical_items.document_structure_id
                              ├──▶ document_structure_events.document_structure_id   (append-only)
                              └──▶ work_packages.document_structure_id
                                       │
                                       └──▶ work_package_items.work_package_id
                                                │
                                                └──▶ outbound_requests.work_package_id
```

Every policy on these tables boils down to "does there exist a `projects` row with `id` matching the chain and `created_by = auth.uid()`?". The migration that wires this for the canonical layer is `supabase/migrations/20260408000004_canonical_rls_policies.sql`. Work packages and outbound use the same chain in `20260408000008_work_packages.sql` and `20260408000009_outbound_boundary.sql`.

`user_profiles` is self-row only in the hardened Cloud posture: authenticated users can read and update their own profile row, but there is no broad "read all profiles" policy and `anon` has no table access.

### Policy surface (canonical layer)

| Table                       | SELECT | INSERT | UPDATE | DELETE                                                                             |
| --------------------------- | ------ | ------ | ------ | ---------------------------------------------------------------------------------- |
| `document_structures`       | ✓      | ✓      | ✓      | — (no DELETE policy)                                                               |
| `canonical_categories`      | ✓      | ✓      | ✓      | — (archive-only, [ADR-015](https://github.com/gidorah/catena/blob/dev/decisions/015-archive-instead-of-hard-delete.md))    |
| `canonical_items`           | ✓      | ✓      | ✓      | — (non-deletable, [ADR-014](https://github.com/gidorah/catena/blob/dev/decisions/014-canonical-item-non-deletable-mvp.md)) |
| `document_structure_events` | ✓      | ✓      | —      | — (append-only audit)                                                              |

There is no DELETE path in MVP for any canonical row. Removal happens through archive flags and lifecycle states.

### Audit trail integrity

`document_structure_events` is append-only by RLS _and_ has a BEFORE INSERT trigger (`enforce_event_actor_id`) that pins `actor_id` to `auth.uid()`. The trigger raises `insufficient_privilege` if the application tries to insert an event with a different actor. When `auth.uid()` is NULL — i.e., not in a request-bound session — the trigger lets any `actor_id` through. The contexts where `auth.uid()` is NULL: service-role clients (`admin.ts`), raw `psql`/migration scripts, pgTAP test bodies, and SQL functions called from those contexts. The bootstrap path during ingest runs in the user's transaction and passes `p_user_id` explicitly, which is why it works even though `auth.uid()` is set there too.

### Storage RLS is a separate model

The `project-documents` storage bucket has its own policies (migration `20251111000004_create_storage_bucket.sql`) and they do **not** use the project chain. Instead, INSERT/SELECT/DELETE policies on `storage.objects` check `auth.uid()::text = (storage.foldername(name))[1]` — i.e., the first path segment of the object's name must equal the user's UID. The upload route enforces this naming convention by writing to `<user_id>/<timestamp>_<filename>`. There is no UPDATE policy on storage objects.

The practical implication: a user can read every document they uploaded, regardless of which project it belongs to; transferring a project to another user (when `project_members` lands) would not give that user access to the storage objects without a separate change to the storage policies. The "single source of truth" claim below applies to _table_ RLS — Storage RLS is a parallel system.

## What this buys us

- **Defense in depth — but RLS is the only line you can rely on.** The documents route runs an explicit ownership check (`SELECT projects … WHERE created_by = auth.uid()`) in `authenticateAndVerifyProject` for clean 404s, but RLS refuses the rows either way. Other routes may or may not run the same belt-and-suspenders check; that's a per-route audit, not a guarantee. RLS is the only layer you can trust to be present everywhere.
- **Service-role escape hatch where needed.** Operations that legitimately need to read across users (admin dashboards, audit reads) use `admin.ts`. They are the exception, not the default.
- **Single source of truth for "can I see this row?"** When you change ownership semantics later (e.g., adding `project_members`), the RLS policies are the thing to amend — not a dozen scattered `.eq("created_by", …)` filters.

## Known limitation: creator-only editing

Today, only `projects.created_by = auth.uid()` can edit a project. There is no `project_members` table yet — no notion of collaborators, no read-only roles, no organization-wide access. Multiple users on the same Catena instance can each have their own projects but cannot share one.

This is a deliberate MVP scope cut, not an oversight. The reason it's worth naming explicitly: the limitation isn't isolated to one place. When the requirement lands, the surfaces that need to be touched together are: the canonical-layer policies in `20260408000004`, the work-package and outbound policies in `20260408000008` and `20260408000009`, the storage policies in `20251111000004` (which key on `auth.uid()` directly, not the project chain — see the Storage subsection above), the explicit ownership check in `authenticateAndVerifyProject`, and the pgTAP fixtures in `supabase/tests/` (which assume single-owner). Auditing every place the codebase says `created_by = auth.uid()` or treats `auth.uid()` as the owner is the size of the change; adding the table itself is the small part.

## Cross-references

- [`../how-to/add-a-supabase-client.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-a-supabase-client.md) — picking the right client.
- [`../how-to/add-an-api-route.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-an-api-route.md) — the canonical auth pattern for server routes.
- [`data-model.md`](/explanation/data-model) — the layer structure these policies protect.
- [ADR-036: Three Supabase clients](https://github.com/gidorah/catena/blob/dev/decisions/036-three-supabase-clients.md).
- Migrations: `20251115000001_create_user_profiles.sql` (auth → profile trigger), `20260408000004_canonical_rls_policies.sql` (canonical RLS), `20260408000008_work_packages.sql` (work package RLS), `20260408000009_outbound_boundary.sql` (outbound RLS).
