# P2 Verification — Task 34 Verification Report

**Date:** 2026-09-30
**Branch:** `feat/p2-verification`, HEAD `c5c401b` (before this document's own commit)
**Scope:** Task 34 of `docs/superpowers/plans/2026-09-15-p2-verification.md` — the staging pass with the flag off, then on, then production. Part A below runs every automated gate for real, in this sandbox. Part B turns "deploy to staging" onward into a checklist: there is no deployment, no Meilisearch instance, no KYC vendor sandbox and no MongoDB reachable here, so nothing past the source tree and local toolchain was exercised. Nothing in Part B is a result — it is what to run, corrected against what the code on this branch actually does.

## Environment note

Same situation as P1's Task 39 report: `git fetch origin main` fails (`Host key verification failed`, no network egress to the real remote), and the cached `main` ref is dated 2026-04-29, 242 commits behind `HEAD`. Diffing against it for the Biome sweep would pull in nearly the whole repository. The sweep below instead covers the files touched by the P2 verification work itself: `f0c29e7^..HEAD` (`f0c29e7`, "feat(api): add the verification-requests collection and the shop, user and log fields it needs", is the first verification-specific commit; 25 commits from there to `HEAD`) — 209 `.ts`/`.tsx`/`.json` files, 208 of which still exist at `HEAD`.

## Part A — automated gates

### Types

| Command | Result |
|---|---|
| `cd packages/api && bun run generate:types` then `git status`/`git diff` on `src/payload-types.ts` | **PASS, no diff.** Regenerating `payload-types.ts` from the committed collections produces no diff against what is checked in. No collection shipped without its types; regeneration was not committed. |
| `cd packages/api && bun run check-types` | **PASS** — `tsc --noEmit`, exit 0. |
| `cd packages/web && bun run check-types` | **PASS** — `tsc --noEmit`, exit 0. |
| `cd packages/search-indexer && bun run check-types` | **PASS** — `tsc --noEmit`, exit 0. |
| `cd packages/mobile && bunx tsc --noEmit \| grep -c "error TS"` | **39, under the 42 baseline** (counted with `grep -c`, not `wc -l`). No new error; none of the 39 are in files this branch touched — same distribution class as documented for P1/P0 (`app/onboarding.tsx`, `components/parallax-scroll-view.tsx`, `components/ui/icon-symbol.tsx`, `hooks/use-theme-color.ts`, etc.). |

### Tests

| Command | Result |
|---|---|
| `cd packages/api && bunx vitest run --config ./vitest.config.mts` | **7 test files failed / 62 passed (69), 9 tests failed / 961 passed (970)** under full-parallel load. Every failing file was re-run in isolation (see below): all pass alone except the one pre-existing, unrelated failure. **No new failure class.** |
| `cd packages/search-indexer && bun test` | **PASS** — 28/28 tests, 5 files. |
| `cd packages/mobile && bun test` | **PASS** — 182/182 tests, 17 files. |
| `cd packages/web && bun test` | **PASS** — 116/116 tests, 12 files. |

API failure breakdown, each re-run alone with `bunx vitest run --config ./vitest.config.mts <file>`:

- `tests/int/api.int.spec.ts` — **genuinely fails in isolation.** `Failed to resolve import "@/payload.config"` (Vite module-resolution error, pre-existing, unrelated to this branch).
- `tests/int/listings-before-change.int.spec.ts`, `tests/int/public-categories-route.int.spec.ts` — **pass alone** (confirmed together in one isolated run, 2/2 files, 15 tests including the one previously-failing case).
- `tests/int/product-stock-routes.int.spec.ts` — **passes alone**, 13/13 tests. The documented batching-timeout flake, not a regression.
- `tests/int/verification-document-view.int.spec.ts`, `tests/int/verification-reviewer-routes.int.spec.ts`, `tests/int/verification-seller-routes.int.spec.ts` — **all pass alone**, run together isolated: 3/3 files, 55/55 tests. The parallel-load run's failures in these three (view-log write ordering, "keeps working while the flag is off") are the same batching-timeout class as `product-stock-routes`, now also touching verification's own new integration tests; not a defect in the verification code.

**Correction to `AGENTS.md`.** `AGENTS.md` (lines 149–153) states five API spec files fail at `HEAD` for reasons that predate this work: `api.int.spec.ts`, `boost-callback-route`, `listings-before-change`, `public-categories-route`, `public-search-route`. That is stale. Re-checked here (and independently by Task 33's cross-client checkpoint, `.superpowers/sdd/2026-09-15-p2-verification/task-33-report.md`): **only `api.int.spec.ts` genuinely fails in isolation** (module resolution). The other four — `boost-callback-route`, `listings-before-change`, `public-categories-route`, `public-search-route` — pass when run alone, and fail only under parallel load, the same timeout class as the already-acknowledged `product-stock-routes` flake. `AGENTS.md` should be corrected to name one pre-existing isolation failure (`api.int.spec.ts`) and a separate, larger set of files (now including several verification integration tests) that are timeout-flaky under full parallel load but not broken. Do not "fix" either by raising timeouts.

### Web build

`cd packages/web && bun run build` — **PASS.** `next build` (Turbopack) compiles cleanly, 35 routes generated including `/seller/verification`, `/seller/verification/business`, `/moderation/verification` and `/moderation/verification/[id]`. Only the pre-existing "middleware file convention is deprecated" notice, unrelated to this branch.

### Lint (Biome)

`bunx biome check <209 P2-changed files>` (file list: `git diff --name-only f0c29e7^...HEAD -- '*.ts' '*.tsx' '*.json'`; see Environment note for why `origin/main` was not used).

**PASS — exit 0.** 208 files checked (one path no longer exists at `HEAD`), 20 warnings, 1 info, **zero errors**. Warnings are style-level only (`noExplicitAny`, one `noImgElement` in the moderation document viewer).

## Findings

- **No new gate failures.** Every API test failure is either the one genuine pre-existing isolation failure (`api.int.spec.ts`) or the parallel-load timeout class, confirmed harmless by running the file alone.
- **Payload types are in sync.** Regenerating `payload-types.ts` produces no diff against what is committed.
- **Mobile `tsc` baseline held at 39, under the 42 ceiling**, in files this branch never touched.
- **`AGENTS.md`'s test-failure section is out of date** and should be corrected per the paragraph above.

## What Part A could NOT verify here

No Docker daemon, no running API container, no MongoDB/Redis/Meilisearch instance, no Didit sandbox, and no staging or production deployment are reachable from this sandbox. Everything below Part A is unrun — a checklist, not a result.

---

## Part B — staging checklist (flag off, then on, then production)

Corrected against the code as it stands on this branch, not the spec's original description.

### 0. Before deploying — env vars and the private-storage gate

`packages/api/src/plugins/storage.ts` (`assertPrivateStorageConfig`) throws at **config build time**, on the environment alone — it cannot read `AppSettings` because the database isn't reachable yet. This applies whether or not `verification.enabled` will ever be ticked:

- `STORAGE_PROVIDER=local` in production → refused outright.
- `STORAGE_PROVIDER=s3` → `S3_PRIVATE_BUCKET` must be set and must differ from `S3_BUCKET`, or the process refuses to start.
- `STORAGE_PROVIDER=azure` → `AZURE_STORAGE_PRIVATE_CONTAINER_NAME` must be set and differ from `AZURE_STORAGE_CONTAINER_NAME`.

New environment variables this branch adds (all declared in `docker-compose.yml` / `docker-compose.local.yml` / `docker-compose.atlas.yml`):

| Variable | Purpose |
|---|---|
| `S3_PRIVATE_BUCKET` / `AZURE_STORAGE_PRIVATE_CONTAINER_NAME` | Where identity documents are stored — must differ from the public media bucket/container. |
| `PRIVATE_UPLOADS_DIR` | Local-provider fallback path (dev/staging only; local storage is refused in production). |
| `VERIFICATION_HASH_PEPPER` | HMAC key for the document-number and IP hashes (`packages/api/src/lib/hash.ts`). Rotating it orphans every existing hash; refuses to hash with an empty key. |
| `VERIFICATION_ALLOW_UNAUTHORISED` | Staging-only bypass of the Law 2024/017 authorisation gate (`packages/api/src/lib/verificationSettings.ts`). Ignored whenever `NODE_ENV==="production"`, and `NODE_ENV` is hardcoded to `"production"` in `packages/api/Dockerfile`, so this variable has no effect there regardless of what is set. |
| `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID`, `DIDIT_BASE_URL` | Didit KYC adapter credentials (`packages/api/src/lib/kyc/didit.ts`). |

Run the migrations with `cd packages/api && bun run migrate` (`bun run
migrate:status` lists what has and has not been applied). Nothing runs them
automatically — not the Dockerfile, not any compose file, not the deploy
workflow — so this is a manual step on every deploy that adds one.

**P2 ships two migrations, and the second one has an ordering requirement.**

`20260930_000100_p2_verification_data_fixes.ts` rewrites `kyc.faceMatchScore`
from the vendor's 0..1 fraction to the 0..100 the field declares, by
multiplying every value in `(0, 1]` by 100. It must run **before** the new
code writes any score, because a genuine 1 % match written by the fixed
adapter also falls in that range and would be read as 100 %. On an identity
decision that is the worst possible direction of error. Run the migration
first, then start the new image; do not run it on a deployment that has
already been serving the new code.

It also upper-cases existing `business.niu` values, clears `vendorWarnings`
and `originalFilename` on rows the retention strip has already passed, and
cannot backfill `documentNumberLast4` — the raw document number was never
persisted, so that one is a forward-fix only.

`20260930_000000_p2_verification_levels.ts`: It retires `users.verified` (copies `true` values to `legacyVerifiedAt` first, so a stale badge's history is preserved, not silently dropped) and creates a partial unique index `verification_open_key_unique` on `verification-requests.openKey`, enforcing "one open request per shop and level" as a database invariant. Its `down` drops the index but deliberately does not restore `verified` — re-deriving it from `legacyVerifiedAt` would recreate the exact meaningless badge the migration removed.

### 1. Flag off (`AppSettings → Verification → Allow verification requests` unchecked)

Ticking `enabled` is itself gated: `assertAuthorised` (`packages/api/src/lib/verificationSettings.ts`) refuses the save unless all four Law 2024/017 authorisation fields (`reference`, `grantedAt`, `transfersAuthorised`, `consentVersion`) are filled — record those first, or use `VERIFICATION_ALLOW_UNAUTHORISED=true` outside production.

| # | Check | Expected, per the code |
|---|---|---|
| 1 | No verification entry point visible anywhere on web or mobile. | Both clients read `verificationEnabled` from `GET /api/public/config` (`packages/api/src/app/(frontend)/api/public/config/route.ts`) and hide the entry points when it is `false`. |
| 2 | `GET /api/public/config` | `verificationEnabled: false`. |
| 3 | `GET /api/shops/{id}/verification` as the owner | **200**, `enabled: false`, plus the shop's real current state (capabilities, existing requests, levels). This route (`packages/api/src/app/(frontend)/api/shops/[id]/verification/route.ts`) never consults the flag as a gate — by design, so a seller mid-review still sees where they stand. It answers `403 verification.notOwner` for a non-owner regardless of the flag. |
| 4 | The admin "Verifications to review" tile (`GET /api/moderation/summary`) | Reads `0`, not an error — it counts `pendingVerificationsWhere` regardless of the flag. |
| 5 | Seller write routes: `POST/PATCH` on `verification-requests/{id}` (documents, business, submit, kyc-session) | All four answer **403 `verification.disabled`** (`packages/api/src/app/(frontend)/api/verification-requests/[id]/{kyc-session,documents,submit,business}/route.ts`), confirmed by grep — each has its own explicit `enabled !== true` check. |
| 6 | Reviewer routes (`GET/POST /api/moderation/verification`, `/api/moderation/verification/{id}`, the document-view route) | **Keep working.** None of these files gate on `verification.enabled` — confirmed by inspection; no such check exists in any of the three route files. |
| 7 | The Didit webhook (`POST /api/public/verification/webhook/{provider}`) | Keeps working. No flag check in the route — it verifies the signature, records the event, and queues processing regardless. |
| 8 | The nightly purge job (`purgeVerificationData`) | Keeps running. Its own doc comment states it "ignores `verification.enabled` entirely: a shop's data does not stop ageing because the feature is paused." |

### 2. Flag on — manual pass (both clients, Didit sandbox)

Follow the brief's Step 2 sequence. Three corrections worth carrying into the run:

| # | Check | Correction against the current code |
|---|---|---|
| 9 | A level-2 approval whose KYC document expiry is already past. | Must grant nothing. `expiryFor()` (`packages/api/src/services/verification.ts:64-78`) takes the **earlier** of the standard validity period and `kyc.documentExpiresAt`; when the document already expired, that earlier date is in the past, so the computed `expiresAt` is in the past too and the effective level is immediately back to 1. The code comment states this explicitly: "an approval that approves an expired document grants nothing rather than granting 24 months." Confirm this by approving a level-2 request with a past `documentExpiresAt` and checking the shop's effective level immediately after, not just the request's stored status. |
| 10 | A document URL opened after 60 seconds is refused. | The signed URL from `POST /api/moderation/verification/documents/{docId}/view` (`packages/api/src/app/(frontend)/api/moderation/verification/documents/[docId]/view/route.ts`) is minted with a fixed **60-second** TTL (`createSignedDocumentUrl(..., 60)`), and the local-provider redemption route independently re-verifies the signature/expiry (`packages/api/src/app/(frontend)/api/verification/files/[docId]/route.ts`) — checked against the S3/Azure signed-URL equivalent if staging uses those providers. |
| 11 | `verification-document-views` holds one row per document opened, none for any other path. | The view row is written **before** the signed URL is minted, in the same route, and the route is the only caller of `createSignedDocumentUrl` for this collection — confirmed by search, no other code path reaches it. A failed insert must produce no URL (the route's own comment states this; the outer `catch` turns it into a 500 rather than a URL with no logged view). |

Everything else in the brief's Step 2 list (identity end to end on web and mobile including the app-dismissed-without-redirect case, a declined attempt and retry, a business submission with PDF and photo, request-info → resubmit → approve, the badge on listing card/detail/shop page in both languages, revoke dropping the badge and re-indexing) still matches the current code as described — run as written.

### 3. Access checks specific to a feature holding identity papers

| # | Check | Expected, per the code |
|---|---|---|
| 12 | `GET /api/verification-documents` (Payload's own REST list) as an **admin**. | **403**, always. `VerificationDocuments.access` (`packages/api/src/collections/VerificationDocuments.ts`) is `{ read: nobody, create: nobody, update: nobody, delete: nobody }` for every role, admins included — the collection's own comment states this is deliberate: the signed-URL route is the only door, "so there is no second door." |
| 13 | `GET /api/verification-documents/file/{filename}` (Payload's built-in upload file route) as an admin. | **403**, same reason — the collection's `read` access gates the file route too. |
| 14 | Open a document through the moderation view route as a reviewer. | Leaves exactly one `verification-document-views` row (viewer, role, hashed IP, truncated user agent), per section 2, item 11 above. |
| 15 | An unauthenticated `GET` on a private object key (S3/Azure). | 403 — bucket/container is private with Block Public Access (S3) or no public access level (Azure); nothing in this branch's code path issues a public URL for `verification-documents`. |

### 4. Flag off again, with work in flight

With one request in `submitted` and one in `needs_info`, untick `enabled`:

| # | Check | Expected |
|---|---|---|
| 16 | Seller hub | Still renders both requests, their status and the reviewer's message — `GET /api/shops/{id}/verification` never gates on the flag (section 1, item 3). |
| 17 | Seller write routes | 403 `verification.disabled` (section 1, item 5). |
| 18 | Reviewer queue | Still lists both requests; a decision still goes through — reviewer routes never gate on the flag (section 1, item 6). |
| 19 | Nightly purge | Still runs (section 1, item 8). |

### 5. Retention and purge, and what an operator does when the nightly vendor deletion keeps failing

`packages/api/src/jobs/purgeVerificationData.ts`, retention periods from `packages/api/src/lib/verificationRetention.ts` (`RETENTION`):

- Documents: purged 90 days after a terminal decision, or 365 days if the revocation reason was fraud-related (`fraud`, `document_forged`).
- Terminal request rows: names, business block and decision text stripped (not the row itself) once due; the row itself is kept 5 years.
- `verification-document-views`: purged after 3 years.
- Vendor KYC session data: deletion attempted 30 days after decision.
- Idle drafts (30 days) and idle `needs_info` (30 days): auto-expired.
- Stale reviewer claims (48 hours): auto-released.
- Shop level expiry notices: fired once each at 30 and 7 days out.

**Vendor deletion failure handling**, by design (`purgeVendorSessions`'s own comment): each vendor deletion is attempted independently, outside any database transaction, since it is a third-party network call. A failure is **never marked done** — the row stays due and is retried on every subsequent nightly run until the vendor confirms deletion. The job logs `"[verification] vendor deletion failed; will retry"` with the request id, and the job's return value separates `vendorDeleted` from `vendorRetried` for observability. An operator whose nightly run keeps reporting the same request ids in `vendorRetried` should treat that as a vendor-side incident (credentials, API outage, a since-deleted session on the vendor's end) — not as this job's bug — and escalate to the vendor relationship rather than editing the row by hand, since forcing `vendorDataDeletedAt` without a confirmed deletion would falsify the retention record.

### 6. Rollback

- `AppSettings → Verification → Allow verification requests` unticked is immediate and live-editable — no deploy needed, per section 4.
- If the deploy itself needs reverting: redeploy the prior image/tag. Check `packages/api/src/migrations` before rolling back a deploy that already ran `20260930_000000_p2_verification_levels` — its `down` drops the partial unique index but does not restore `users.verified`; a rollback that needs the old boolean back is not supported by this migration and needs a manual decision (deriving it from `legacyVerifiedAt` would recreate the exact meaningless badge the migration retired).
- `S3_PRIVATE_BUCKET`/`AZURE_STORAGE_PRIVATE_CONTAINER_NAME` and the other new env vars are additive — a rollback to the pre-P2 image simply ignores them.

---

## What could NOT be verified here, and why

- **All of Part B.** No Docker daemon, no MongoDB/Redis/Meilisearch, no Didit sandbox, no staging or production environment reachable from this sandbox. Every line in Part B is a checklist for whoever runs the deploy, cross-checked against the source, not a result.
- **The `documents` join field on `VerificationRequests`** (`packages/api/src/collections/VerificationRequests.ts:395-397`). This has never been proven against a real database: the integration test fake used by `packages/api/tests/int` has no join support. Nothing currently depends on it by design — every place that needs a request's documents (the owner's own view, the reviewer's view) queries `verification-documents` directly instead (`documentsFor()` in `packages/api/src/lib/verificationView.ts`, and the moderation route's own comment: "The `documents` join field on `VerificationRequests` has never been proven against a real database ... so documents are always their own direct query, never `request.documents`"). Confirming the join field itself works needs a real MongoDB instance.
- **The Didit sandbox end-to-end flows** (identity on web/mobile including app-dismissed-without-redirect, declined+retry, business submission with PDF/photo, request-info→resubmit→approve) — no vendor sandbox credentials or network egress to Didit from this sandbox.
- **Real S3/Azure private-bucket behavior** (Block Public Access, default encryption, an unauthenticated `GET` on a private key returning 403) — no cloud storage credentials here; verified only by reading the storage plugin's config-time assertions, not by hitting real infrastructure.
- **Search re-indexing on revoke** (a shop's listings dropping out of a "verified" filter after revocation) — no Meilisearch instance reachable here.
