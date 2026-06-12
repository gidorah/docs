---
title: "Add an API route"
description: "How to add a backend API route to the dashboard following Catena's conventions. The dashboard uses Next.js App Router route handlers (`app/api/.../route.ts`) — there is no separ..."
---

# Add an API route

How to add a backend API route to the dashboard following Catena's conventions. The dashboard uses Next.js App Router route handlers (`app/api/.../route.ts`) — there is no separate API server.

This is a **how-to**, not a Next.js tutorial. It assumes you know what a route handler is.

- It does not cover frontend pages — see [`add-a-dashboard-page.md`](/how-to/add-a-dashboard-page).
- It does not cover Supabase Edge Functions or PostgREST — Catena does not use either.

## Where to put it

Routes live under `apps/dashboard/src/app/api/`, mirroring URL shape:

```
apps/dashboard/src/app/api/
├── projects/
│   ├── route.ts                              # /api/projects
│   ├── upload/route.ts
│   ├── [id]/
│   │   ├── route.ts                          # /api/projects/[id]
│   │   ├── categories/route.ts
│   │   └── documents/route.ts
└── tools/
    └── x83-translation/route.ts
```

One `route.ts` per URL. Export named handlers (`GET`, `POST`, `PATCH`, `DELETE`); don't export a default.

## Auth pattern

Almost every route starts the same way: get the SSR Supabase client, fetch the user, return 401 if absent. For project-scoped routes, also verify the project belongs to the user. This is enforced at the application layer in addition to RLS — it returns a clean 404 instead of leaking "exists but you can't see it."

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("created_by", user.id)
    .single();
  if (!project) {
    return NextResponse.json(
      { error: "Project not found", errorKey: "notFound" },
      { status: 404 },
    );
  }
  // …
}
```

When a route file has more than one handler doing this, factor it into a local `authenticateAndVerifyProject` helper — `app/api/projects/[id]/documents/route.ts` is the worked precedent.

For client choice (anon vs admin), see [`add-a-supabase-client.md`](/how-to/add-a-supabase-client). Default to `server.ts`.

## Error response shape

Every error response carries two fields:

```ts
return NextResponse.json(
  { error: "Project not found", errorKey: "notFound" },
  { status: 404 },
);
```

- **`error`** — human-readable English string, useful for logs and unkeyed clients.
- **`errorKey`** — stable identifier the dashboard maps through the `errors` next-intl namespace to a localized message. Treat the key as the contract, not the `error` text.

The currently used `errorKey` values, by domain:

| Domain        | Keys                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Database      | `database.fetchFailed`, `database.createFailed`, `database.updateFailed`, `database.deleteFailed`                 |
| Validation    | `validation.required`, `validation.noFields`                                                                      |
| Files         | `file.required`, `file.uploadFailed`, `file.tooLarge`, `file.empty`, `file.noExtension`, `file.unsupportedFormat` |
| Server        | `server.internal`                                                                                                 |
| Routing       | `notFound`                                                                                                        |
| Domain errors | `errors.invalidXml`, `errors.missingFile`, `errors.providerFailed`, `errors.providerTimeout`, `errors.unknown`    |

`apps/dashboard/locales/en/errors.json` is the source of truth for which keys actually have translations — grep there before reusing a key from this table, and update both `en/errors.json` and `de/errors.json` whenever you add a new key (see [`add-user-facing-text.md`](/how-to/add-user-facing-text)). Reuse an existing key when the failure shape matches; add a new one only when no existing key fits.

## Logging

Catena keeps `console.error` and `console.warn` in production (Coolify container logs are the incident view). Log unexpected errors verbosely; don't swallow them silently:

```ts
console.error("Error fetching projects:", error);
```

For caught exceptions in the outermost `try`, also log `err.message` and `err.stack` explicitly — Next.js's standalone build (used in self-hosted; see `apps/dashboard/server.js`) does not always surface them automatically.

## Keep upload routes off the proxy matcher

`apps/dashboard/src/proxy.ts` excludes `/api/*`, `/auth/*`, and `/monitoring` via `config.matcher`. API route handlers must not be added back under the proxy — session/i18n handling consumes the request body and breaks multipart uploads before your handler runs. When adding a new top-level segment that should bypass the proxy (for example a webhook path), update the matcher and `proxy.test.ts` together.

## Multipart uploads (Coolify/Traefik workaround)

This pattern is **only required when running behind Coolify/Traefik in self-hosted or Cloud dashboard deployments** — the reverse proxy/runtime path does not reliably preserve large browser multipart uploads when route handlers call `request.formData()` directly or reconstruct a `Request` and call `.formData()`. On local `next dev`, direct form parsing may work. Use the bounded parser unconditionally in the project document route because skipping it on the deployed path breaks uploads silently.

Read the raw bytes first, then extract only the expected file part:

```ts
const contentType = request.headers.get("content-type") ?? "";
const rawBody = await request.arrayBuffer();
const file = parseFileFromMultipart(rawBody, contentType);
```

Validate via `validateFile` (`@/lib/file-validation`) and sanitize names via `sanitizeFilename` before passing to Supabase Storage. The worked example is `app/api/projects/[id]/documents/route.ts`.

## Conventions checklist

- [ ] One route per URL, named handler exports.
- [ ] Auth check first; project ownership check next where applicable.
- [ ] Errors return `{ error, errorKey }` with a status code.
- [ ] Unexpected errors are logged with `console.error`.
- [ ] Multipart upload uses `arrayBuffer()` plus the bounded multipart file parser.
- [ ] Client choice (`server.ts` vs `admin.ts`) follows [`add-a-supabase-client.md`](/how-to/add-a-supabase-client).
- [ ] Any new `errorKey` has matching `errors.json` entries in both locales.
