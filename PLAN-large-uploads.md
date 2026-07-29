# Large media uploads (600 MB+)

## Problem

Uploads above **50 MB** reach R2 intact but fail when Payload creates the
document, with `File type text/plain (from extension m4v) is not allowed.`

The extension in that message is incidental — a 60 MB `.mp4` produces the
identical error. Measured against staging:

| file | R2 | document |
|---|---|---|
| 6 MB `.mp4` | ok | 201 |
| 6 MB `.m4v` | ok | 201 |
| 60 MB `.mp4` | ok | 400 `text/plain … not allowed` |
| 150 MB `.mp4` | ok | 400 `text/plain … not allowed` |

Cause chain:

1. The browser uploads bytes directly to R2 in 5 MB parts — this works at any size.
2. It then posts a JSON envelope (`clientUploadContext`, `filename`, `mimeType`, `size`) instead of the file.
3. Payload core (`addDataAndFileToRequest`) calls the collection's upload
   handlers to **read the object back out of R2**.
4. `@payloadcms/storage-r2` refuses above 50 MB to avoid exhausting Worker
   memory: `if (fileSize > 50 * 1024 * 1024 && clientUploadContext) return new Response(null, { status: 200 })`.
5. Core does `Buffer.from(await response.arrayBuffer())` → **0 bytes**.
6. `checkFileRestrictions` sniffs 0 bytes, gets nothing, and falls back to a
   10-entry extension map in which every video type resolves to `text/plain`.

Still present in the latest 3.86.0 (guard moved to `getFile.js`, code
unchanged; core still buffers). Upgrading does not help. The R2 adapter is
documented as beta.

## Approach

Take large files out of Payload's upload pipeline rather than repairing a step
inside it. `upload.filesRequiredOnCreate: false` makes `generateFileData`
return **before** `checkFileRestrictions`, so a document created from plain
JSON never triggers the read-back and has no size ceiling.

Verified locally: a media document with `filesize: 629145600` created from JSON
alone, no file touching the server.

This keeps everything in the existing `media` collection — gallery and post
relationships, the public site, the quota endpoint and the 546 existing
documents are unaffected. It is also the shape the Velite migration already
uses (`payload.db.create` with no file), so the data shape is proven.

What the server gives up (content sniffing of the first bytes) is replaced by
something stronger: verifying against R2 that the object **actually exists and
how large it really is**.

## Phases

Each phase is independently verifiable and gets its own commit.

### V0 — failing test first

Add `e2e/members/large-upload.spec.ts` asserting the end state: a >50 MB
object uploaded through the multipart endpoint, then a document create, yields
a document whose `filesize` matches the object in R2.

**Verify:** the test fails today with the `text/plain` error, and is the
signal that V1–V3 worked. Runs against staging (local dev has no real R2).

### V1 — accept metadata-only creates, safely

- `filesRequiredOnCreate: false` on `Media.upload`.
- New hook `verifyR2Object` (`beforeOperation`, create only, when `!req.file`):
  - require `filename` and `mimeType`; reject otherwise
  - reject any incoming `url` — with `filename` present it triggers
    `shouldReupload` → `getExternalFile`, making the Worker fetch a caller-supplied
    URL (SSRF, and it 500s). Confirmed by experiment.
  - `bucket.head(key)`; reject when the object is absent
  - **overwrite** `filesize` with `head.size` — never trust the client's number
  - overwrite `mimeType` with `head.httpMetadata.contentType` when present
- Bucket access from a hook: resolve via `getCloudflareContext()` in a small
  `src/lib/r2-bucket.ts` rather than importing `payload.config` (cycle).
- Default `alt` from the filename (extension stripped) when it is empty, as a
  `beforeValidate` fallback. `alt` is `required: true`, so this belongs
  server-side as well as in the UI — otherwise an API create without `alt`
  fails, and the two upload paths behave differently.

**Owner needs no work.** `setOwner` is a `beforeChange` hook keyed on
`operation === 'create'` and `req.user.id`, with no dependency on `req.file`,
so it stamps metadata-only creates correctly already. Field-level access on
`owner` strips any value a member sends. V0's test asserts this rather than
assuming it.

**Verify:** REST create with a real key → 201, `filesize` equals the R2 object
size even when the request understates it; bogus key → 400; `url` present →
400; existing file-bearing uploads unchanged.

### V2 — quota must count these creates

`enforceStorageQuota` currently starts with `const file = req.file; if (!file) return args`,
so a metadata-only create **bypasses the quota entirely**. Fold it together
with V1's verification so there is a single `beforeOperation` that:

1. resolves the true object size via one `bucket.head()`
2. enforces the quota against that number
3. stashes the verified size for the later write

One head call, and rejection still happens before anything is persisted.

**Verify:** a member near their limit is refused; the rejection message quotes
the real size; `usedBytesFor` after a successful create matches R2.

### V3 — admin UI direct-upload component, with progress

Files below the threshold keep Payload's built-in upload (dimensions,
`blurDataURL`, unchanged behaviour). Above it, a custom component:

1. uploads to the existing `storage-r2-multi-part-upload` endpoint
2. prefills `alt` from the filename, editable before saving
3. creates the document via REST with metadata only

Progress comes from counting completed parts (`part / partTotal`), which the
existing endpoint already gives us one response at a time — 5 MB granularity,
about 120 steps on a 600 MB file. Show percentage, transferred/total bytes, and
a cancel button that calls `abort` so a cancelled upload leaves nothing behind.

**Verify:** the real 600 MB `.m4v` through the admin UI on staging — progress
advances monotonically, document created, `filesize` matches R2, `owner` is the
logged-in member, `alt` defaulted from the filename, the video plays on its
gallery page.

### V4 — resumable uploads

The existing endpoint is already stateless and resume-capable: every part is an
independent request carrying `multipartKey` + `multipartId` + `multipartNumber`,
and `bucket.resumeMultipartUpload(key, uploadId)` needs nothing else. What is
missing is client-side bookkeeping.

- Persist `{ key, uploadId, filename, mimeType, size, chunkSize, parts[] }` to
  IndexedDB after every successful part.
- On reopening the upload UI, offer to resume any record whose file matches
  (name + size); re-send only the missing part numbers.
- Pause/resume buttons; automatic retry with backoff on a failed part.
- Discard the record after `complete`, or on explicit abort.

**Constraint:** `R2MultipartUpload` exposes only `uploadPart`, `abort` and
`complete` — there is **no `listParts`**, so the server cannot tell a client
which parts already landed. Resume therefore survives pause, network loss,
page reload and browser restart, but **not** clearing site data or switching
browser/device. Cross-device resume would need a server endpoint using the S3
API's `ListParts` (credentials already exist) — out of scope unless wanted.

`chunkSize` must be identical across a resumed upload: R2 requires uniform part
sizes except the last. Persisting it is what makes that safe.

**Verify:** kill the network mid-upload of the 600 MB file and resume — only
missing parts re-send, final object size matches exactly. Reload the page
mid-upload and resume. Cancel mid-upload and confirm no R2 object and no
document remain.

### V5 — orphan cleanup

Two distinct kinds of debris:

1. **Completed objects with no document** — the failed 600 MB attempts are in
   the production bucket now. Production currently has 582 objects / 546
   documents / 36 unreferenced (0.05 GB), mostly legacy, so a script must
   report before deleting and never delete without an explicit flag.
2. **Incomplete multipart uploads** — abandoned parts consume billable R2
   storage and are invisible to `bucket.list()`. The Workers binding cannot
   enumerate them; handle with an R2 bucket lifecycle rule that aborts
   incomplete multipart uploads after N days.

**Verify:** dry run against production lists the known orphans and nothing
else; confirm the lifecycle rule is present on both buckets.

### V6 — backfill `filesize`

All 546 media documents have `filesize` NULL or 0, so quota accounting
(`usedBytesFor` sums `media.filesize`) currently reads every migrated file as
zero bytes. Nobody is over quota today because 413 belong to admin (exempt)
and 133 have no owner, but the numbers shown in the admin UI are wrong and any
future ownership change would inherit the error.

Script: for each media document, `bucket.head(key)` and write back the real
size. Dry-run by default, reporting how many would change and any key that
does not resolve — the same flattened-`filename` vs real-key mismatch that
broke `generateFileURL` applies here, so resolve the key from `url` when
`filename` does not exist in the bucket.

**Verify:** dry run reports 546 candidates and zero unresolved keys before
anything is written; after the run, `usedBytesFor(admin)` matches the summed
size of admin-owned objects in R2.

### V7 — deploy

`deploy:staging`, validate with the real 600 MB file end to end, then manual
`deploy:prod`.

## Decisions (settled)

1. **Transport** — reuse the existing `storage-r2-multi-part-upload` endpoint.
   It already moved 600 MB, needs no S3 credentials and no bucket CORS. A
   single presigned PUT is all-or-nothing, so resumability would require
   presigned *multipart* (per-part signed URLs) — strictly more work than the
   endpoint we already have.
2. **Threshold: 32 MB.** Below it, uploads keep Payload's built-in path
   unchanged (dimensions, `blurDataURL`). Above it, the direct path. 32 rather
   than 50 leaves margin under the upstream guard and under the Worker's
   128 MB ceiling, and keeps image dimension probing on the built-in path for
   every realistic image.
3. **Backfill: yes**, and wider than first scoped — **all 546 media documents
   have `filesize` unset**, not just the 22 videos. See V6.

### Ownership note

The 22 legacy videos are **not** admin-owned: `owner_id` is NULL on 133 of the
546 documents (an artifact of the one-off Velite import; the same rows that
make M1-T8 fail locally). The remaining 413 belong to `xudong.wu@gmail.com`
(admin).

This does not affect quotas: admin is already exempt
(`enforceStorageQuota` returns early for `isAdminUser`), and owner-less rows
count against nobody. The public site is unaffected because anonymous read is
unrestricted; only signed-in *members* cannot see them, which is intended.

Open, non-blocking: assign the 133 owner-less documents to admin? One UPDATE,
independent of everything below.

## Risks

- `filesRequiredOnCreate: false` applies collection-wide: without V1's
  verification any authenticated user could create documents pointing at
  nothing. V1 is the security control, not an optimisation — it must land in
  the same commit as the flag.
- The admin component is custom UI code coupled to Payload's UI APIs and will
  need attention on upgrades.
