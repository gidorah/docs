---
title: "API Routes"
description: "Inventory of dashboard HTTP routes under `apps/dashboard/src/app/api/`. Supabase PostgREST endpoints generated from the schema are not covered here — see [`database-schema.md`](..."
---

# API Routes

Inventory of dashboard HTTP routes under `apps/dashboard/src/app/api/`. Supabase PostgREST endpoints generated from the schema are not covered here — see [`database-schema.md`](/reference/database-schema) and the Supabase docs.

For how to add a route, see [`../how-to/add-an-api-route.md`](https://github.com/gidorah/catena/blob/dev/how-to/add-an-api-route.md). For the upload-vs-document distinction in detail, see [`../explanation/document-ingest-pipeline.md`](https://github.com/gidorah/catena/blob/dev/explanation/document-ingest-pipeline.md).

Most routes resolve auth via `createClient()` from `@/lib/supabase/server` and reject unauthenticated callers with `401 { error: "Unauthorized" }`. The legacy `/api/projects/upload` route returns `410` before any auth or Supabase work. Routes that authenticate then issue queries with the request-scoped client, leaving row ownership to RLS.

## Routes

| Route                           | Methods                  | Source                                      | Purpose                                                                                                      | Auth                                                | Notes                                                                                                                         |
| ------------------------------- | ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/api/projects`                 | `GET`, `POST`            | `app/api/projects/route.ts`                 | List the caller's projects (filterable via `?status` and `?search`) and create a new project.                | Required; RLS scopes to owner.                      | `POST` validates `name` server-side; returns `201` with the new row.                                                          |
| `/api/projects/[id]`            | `GET`, `PATCH`, `DELETE` | `app/api/projects/[id]/route.ts`            | Fetch, partial-update, or delete a single project.                                                           | Required; RLS scopes to owner.                      | `404` when the project doesn't exist or isn't visible to the caller.                                                          |
| `/api/projects/[id]/documents`  | `GET`, `POST`            | `app/api/projects/[id]/documents/route.ts`  | List documents for a project; upload a GAEB file and trigger atomic ingest via `ingest_boq_and_bootstrap()`. | Required; RLS scopes to owner.                      | `POST` is the canonical document-upload + parse path. Reads multipart via `request.arrayBuffer()` for Coolify/Traefik compat. |
| `/api/projects/[id]/categories` | `GET`                    | `app/api/projects/[id]/categories/route.ts` | Return the canonical category tree + items for a project's primary document.                                 | Required; RLS scopes to owner.                      | Returns `{ document: null, categories: [], items: [] }` when no successful document exists yet.                               |
| `/api/projects/upload`          | `POST`                   | `app/api/projects/upload/route.ts`          | Disabled generic upload route.                                                                               | Not reached; returns before auth/Supabase work.     | Always returns `410` with `errorKey: "projects_upload_disabled"`. Use `POST /api/projects/[id]/documents`.                    |
| `/api/tools/x83-translation`    | `POST`                   | `app/api/tools/x83-translation/route.ts`    | Translate a `.x83` file's labels and free text to a target language using the package's `translateGaebX83`.  | Required; gated by `CATENA_FEATURE_X83_TRANSLATOR`. | Returns `404 Not Found` when the feature flag is off.                                                                         |
| `/api/health/version`             | `GET`                    | `app/api/health/version/route.ts`           | Returns `{ commit: string \| null }` for deploy verification.                                                | None.                                               | Reads build-time `CATENA_BUILD_SHA` (set from `CATENA_DEPLOY_SHA` in `next.config.mjs`). Used by CI and Cloud smoke guards. |

## Common error keys

Routes return JSON in the shape `{ error: string, errorKey?: string }` on failure. The `errorKey` is for i18n on the client (resolved via next-intl). Common keys include:

| Key                        | Meaning                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| `database.fetchFailed`     | Supabase `select` returned an error.                                            |
| `database.createFailed`    | Supabase `insert` returned an error.                                            |
| `database.updateFailed`    | Supabase `update` returned an error.                                            |
| `database.deleteFailed`    | Supabase `delete` returned an error.                                            |
| `validation.required`      | A required field is missing from the payload.                                   |
| `validation.invalidFormat` | A payload field has the wrong type, invalid enum value, or invalid date format. |
| `validation.noFields`      | `PATCH` body has no allowlisted fields.                                         |
| `notFound`                 | Row does not exist or is not visible to the caller.                             |
| `auth.sessionExpired`      | The request has no current authenticated Supabase user.                         |
| `file.required`            | Multipart upload missing the `file` field.                                      |
| `file.tooLarge`            | Multipart upload exceeds the route size limit.                                  |
| `file.empty`               | Uploaded file has zero bytes.                                                   |
| `file.noExtension`         | Uploaded file name has no extension.                                            |
| `file.unsupportedFormat`   | Uploaded file extension or content type is not accepted for the route.          |
| `file.uploadFailed`        | Storage upload to `project-documents` bucket failed.                            |
| `projects_upload_disabled` | The legacy generic `/api/projects/upload` route is intentionally disabled.      |
| `server.internal`          | Catch-all for unexpected exceptions (returns `500`).                            |
| `errors.missingFile`       | x83-translation route only.                                                     |
| `errors.invalidXml`        | x83-translation route only.                                                     |
| `errors.providerTimeout`   | x83-translation route only — translation provider timed out (`504`).            |
| `errors.providerFailed`    | x83-translation route only — translation provider returned a `502` upstream.    |
| `errors.unknown`           | x83-translation route catch-all (`500`).                                        |

The translation route uses an `errors.*` namespace; the rest use bare-domain keys. This split is intentional and not currently consolidated.
