# P1 Shops — Task 39 Verification Report

**Date:** 2026-09-24
**Branch:** `feat/p1-shops` at `72e5c37`
**Scope:** Task 39 of `docs/superpowers/plans/2026-09-15-p1-shops.md` — Step 1 (every automated gate), run for real in this sandbox. Steps 2–4 need a staging deployment, a running API container and a Meilisearch instance, none of which exist here; Part B below turns them into a checklist for whoever runs the deploy, corrected against what the code actually does.

## Environment note

`origin/main` in this checkout is stale: `git fetch origin main` failed (`Host key verification failed` — no network egress to the real remote from this sandbox), and the cached ref is dated 2026-04-29, 184 commits behind `HEAD`. Diffing against it for the Biome sweep pulls in nearly the whole repository (548 files), not this branch's actual change. Per the brief's fallback, the sweep below instead covers the files touched by the P1 shops commits themselves: `1c733b0^..HEAD` (`1c733b0` is the first shop-specific commit, "shop handle rules and shop error codes"; the 83 commits from there to `HEAD` are shop work end to end) — 353 `.ts`/`.tsx`/`.json` files.

## Part A — automated gates

### Types

| Command | Result |
|---|---|
| `cd packages/api && bun run generate:types` then `git status`/`git diff` on `src/payload-types.ts` | **PASS, no diff.** Regeneration is clean; the committed file already matches a fresh `payload generate:types`. No collection shipped without its types. |
| `cd packages/api && bun run check-types` | **PASS** — `tsc --noEmit`, exit 0, no errors (11.6s). |
| `cd packages/web && bun run check-types` | **PASS** — `tsc --noEmit`, exit 0, no errors (5.9s). |
| `cd packages/search-indexer && bun run check-types` | **PASS** — `tsc --noEmit`, exit 0, no errors. |
| `cd packages/mobile && bunx tsc --noEmit` | **PASS (baseline), 42 errors** — counted with `grep -c "error TS"` on the raw output, not `wc -l`. Matches the agreed pre-existing baseline exactly; no new error. Distribution: `app/listing/[id].tsx` (15), `app/onboarding.tsx` (7), `app/(tabs)/_layout.tsx` (5), `app/account/boosts.tsx` (3), `hooks/use-theme-color.ts` (2), `components/ui/icon-symbol.tsx` (2), `app/moderation/index.tsx` (2), and one each in `components/parallax-scroll-view.tsx`, `app/moderation/listing/[id].tsx`, `app/auth/register.tsx`, `app/auth/login.tsx`, `app/auth/callback.tsx`, `app/(tabs)/account/index.tsx`. None of these files were touched by the P1 shops commits (`1c733b0^..HEAD`), and zero errors reference `.expo/types/router.d.ts` (its stale route-literal errors from the P0 baseline are not present in this run at all — a shrinking baseline, not a growing one). |

### Tests

| Command | Result |
|---|---|
| `cd packages/api && bunx vitest run --config ./vitest.config.mts` | **3 test files failed / 43 passed (46), 2 tests failed / 657 passed (659).** Breakdown below. |
| `cd packages/search-indexer && bun test` | **PASS** — 27/27 tests, 5 files. |
| `cd packages/mobile && bun test` | **PASS** — 125/125 tests, 12 files. |

API test failure breakdown:

- `tests/int/api.int.spec.ts` — **pre-existing, unchanged.** `Failed to resolve import "@/payload.config"` (vite import-analysis, module-load error). Same shape as documented at HEAD before this work; not part of the P1 diff.
- `tests/int/product-stock-routes.int.spec.ts` — timed out in the batched run (`Test timed out in 5000ms` on the first test). **Pre-existing batching-timeout class**, confirmed: run alone it passes, 13/13 tests, 3.46s. This is the exact "known to time out when batched, passes alone" file named in the brief.
- `tests/int/public-shops.int.spec.ts` — timed out in the batched run the same way. This file is **new** (added by the P1 shops work), but the failure is the **same pre-existing batching-timeout class**, not a new kind of failure: run alone it passes, 11/11 tests, 2.3s. Confirmed by isolated run, not assumed.
- `tests/int/boost-callback-route.int.spec.ts`, `tests/int/listings-before-change.int.spec.ts`, `tests/int/public-categories-route.int.spec.ts`, `tests/int/public-search-route.int.spec.ts` — all **passed** in this run (part of the "43 passed" files), better than the brief's stated baseline which still lists them as expected failures. Verified in the batch output directly.

No new failure class. The only two failing test files are: one pre-existing module-resolution failure (`api.int.spec.ts`) and one pre-existing batching-timeout class now also covering one new file (`public-shops.int.spec.ts`, alongside `product-stock-routes.int.spec.ts`) — both confirmed to pass in isolation.

### Web (types, build, and `bun test`)

| Command | Result |
|---|---|
| `cd packages/web && bun run check-types` | **PASS** (see Types table above). |
| `cd packages/web && bun run build` | **PASS.** `next build` (Turbopack) compiles in 22.6s, generates 32 routes including `/s/[handle]`, `/shop/new`, `/shop/manage`, `/seller`, `/seller/catalogue`, `/seller/catalogue/[id]`, `/seller/catalogue/new`, `/seller/stock`, `/seller/stock/inventory` — all the P1 shop routes are present in the production route manifest. Only warning: the pre-existing "middleware file convention is deprecated" notice, unrelated to this branch. |

### Lint (Biome)

`bunx biome check <353 P1-changed files>` (files list: `git diff --name-only 1c733b0^...HEAD -- '*.ts' '*.tsx' '*.json'`, see Environment note above for why `origin/main` was not used).

| Result |
|---|
| **PASS — 0 errors, exit 0.** 352 files checked (one path no longer exists at `HEAD`), 63 warnings, 1 info. All warnings are style-level: `noExplicitAny`, `noUnusedVariables`/`noUnusedFunctionParameters`, `useExhaustiveDependencies`, `noEmptyBlockStatements`. No error-level diagnostic anywhere in the P1 diff. |

## Findings

- **No new gate failures.** Every failure above is either the exact pre-existing failure named in the brief, or the same pre-existing batching-timeout *class* now also touching one new file (`public-shops.int.spec.ts`), confirmed harmless by running it alone.
- **Payload types are in sync.** Regenerating `payload-types.ts` produces no diff against what is committed — no collection shipped without its types.
- **Mobile `tsc` baseline held exactly at 42**, all in files this branch never touched.

## What this pass could NOT verify here

No Docker daemon, no running API container, no MongoDB/Redis/Meilisearch instance, and no staging or production deployment are reachable from this sandbox — only the source tree and local toolchain. Everything in Part B below (the notification workflow sync, the search reindex, the flag-off/flag-on manual passes, the moderation and deep-link checks, rollback) is **unrun**. Treat every line in Part B as a checklist to execute, not as a result — nothing there has been exercised, only cross-checked against the code that will run it.

## Part B — staging checklist (flag off, then on, then rollback)

Corrected against the current code: the feature flag (`AppSettings → Shops → Allow shop creation`, `shops.enabled`) gates shop **creation** only. `useMyShop`/`useMyShopGate` fetch the caller's shop unconditionally (`packages/web/src/hooks/use-my-shop.tsx`, `packages/mobile/src/hooks/useCreateShopGate.ts`) — an existing shop, and its manage/seller screens, stay fully usable with the flag off on both clients. Only the "open a shop" entry point disappears.

### 0. Before deploying — stale `productSummary.available` check

A pre-fix build wrote `listings.productSummary.available` as a unit COUNT; this
branch writes a purchasability BOOLEAN. Unreachable in production, since nothing
in this branch shipped there — but live on any staging environment a pre-fix
build already touched. Do this before deploying, not after.

| # | Action | Expected result |
|---|---|---|
| 0.1 | Ask the database whether any stale number is stored: `db.listings.countDocuments({ "productSummary.available": { $type: "number" } })` (mongosh, against the target database). | `0` — nothing to do, skip the rest of this section. Anything higher is the count of documents to repair. |
| 0.2 | Repair them: re-save every product-backed listing (a no-op `payload.update` with `overrideAccess` and `context: PRODUCT_SERVICE_CONTEXT` re-derives `productSummary` through `deriveListingData`, which now always writes a boolean), or run a one-off backfill script. | Re-running the query in 0.1 returns `0`. |
| 0.3 | Then re-run `cd packages/search-indexer && bun run reindex`. | Meilisearch picks up the corrected documents. **Reindexing alone is not enough** — the source document has to be fixed first, or the reindex just copies the stale number across. |

Why the check is needed at all: every read path added a runtime coercion except
one. The public search route and the search-indexer both coerce (`asBoolean`,
`typeof … === "boolean"`), so a stale number is dropped rather than forwarded
there — but a raw `GET /api/listings`, or any consumer reading the field
directly rather than through those two shaped paths, still gets the number back
verbatim.

### 0b. After deploying (run once, on the API container / a machine with `PAYLOAD_API_URL` and DB access)

| # | Action | Expected result |
|---|---|---|
| 1 | `cd packages/api && bun run sync:notification-workflows` | Creates/updates four Novu workflows: `shop-created`, `shop-suspended`, `shop-unsuspended`, `stock-low` (confirmed present in `packages/api/src/scripts/syncNotificationWorkflows.ts`, alongside the existing `listing-approved`, `listing-rejected`, etc.). Command exits 0; each workflow logs "synced" (or "would sync" only if run with a dry-run flag). |
| 2 | `cd packages/search-indexer && bun run reindex` | Configures the `shops` Meilisearch index and the listing index's new shop-related searchable/filterable attributes, then reindexes. Log lines: `reindex starting bulk reindex...`, `reindex clearing existing index...`, `reindex fetched N total listings...`, and a shops equivalent. Exits 0. |

### 1. Flag off (`AppSettings → Shops → Allow shop creation` unchecked)

| # | Action | Expected result |
|---|---|---|
| 3 | `curl -s https://<staging-api>/api/public/config \| jq .shopsEnabled` | `false` (`packages/api/src/app/(frontend)/api/public/config/route.ts` reads `getShopSettings(payload).enabled`). |
| 4 | Web: header menu, `/profile/me`, search, listing create/edit forms with no shop of your own. | No "open a shop" entry anywhere: `shopEntryFor(myShop, shopsEnabled)` (`packages/web/src/lib/shop-entry.ts`) returns `null` when there is no shop and the flag is off. |
| 5 | Mobile: Account tab, search segments, create flow, with no shop of your own. | Same: `useCreateShopGate()` (`packages/mobile/src/hooks/useCreateShopGate.ts`) returns `{ phase: "unavailable" }` when `hasShop` is false and `shopsEnabled` is false — create flow stays unreachable, including by deep link. |
| 6 | `POST /api/shops` with a signed-in cookie. | `403`, body `{"code":"shop.disabled","message":"..."}` (`packages/api/src/services/shops.ts:193`, via `ERROR_CODES.shopDisabled = "shop.disabled"`). |
| 7 | With an account that **already owns a shop**: open its manage/seller pages on both clients. | Still fully usable — `useMyShop`/`useCreateShopGate` fetch and render regardless of the flag; only new-shop creation is blocked. |
| 8 | Regression pass on the listing hook changes: create a listing, edit it, moderation approve, moderation reject, suspend/unsuspend a user. | All succeed exactly as before P1; no shop-flag interaction affects any of these paths. |

### 2. Flag on — manual pass (both clients)

Follow the brief's Step 3 sequence (items 1–13) as written — nothing in the code changed the flow itself. Three call-outs worth re-checking against the live code while running it, since they are easy to get wrong from memory:

| # | Action | Expected result (verified against source) |
|---|---|---|
| 9 | Open a listing's buyer variant picker. | Variants come from `GET /api/public/products/{id}/variants` (`packages/api/src/app/(frontend)/api/public/products/[id]/variants/route.ts`), returning `{ docs: [{ id, optionValues, price, trackInventory, available }] }`. `available` is a derived boolean (`!isOutOfStock(variant)`); **no `stockOnHand`, `stockReserved` or `cost` reaches this response** — confirm the network payload has no raw stock numbers. |
| 10 | Change the handle from `akwa-staging` to `akwa-store`, then open `/s/akwa-staging`. | Web: `permanentRedirect` to `/s/akwa-store`, i.e. HTTP **308** (`packages/web/src/app/s/[handle]/page.tsx`). Mobile follows the redirect the same way. |
| 11 | Attempt a shop logo/banner or product photo upload outside JPEG/PNG/WebP, or over 10 MB. | Rejected before it reaches storage: `enforceMediaFileLimits` (`packages/api/src/hooks/mediaLimits.ts`) allows only `image/jpeg`, `image/png`, `image/webp`, and caps at exactly 10 MB (`10 * 1024 * 1024`) — wrong type answers `400 {"code":"upload.invalidType"}`, oversized answers `413 {"code":"upload.tooLarge"}`. |

Everything else in the brief's Step 3 (phone gate, shop creation, product/variant creation, stock movements, `stock-low` notification once per downward crossing, the "Stock cannot go below zero" error, publish-in-shop and transfer-my-listings, deep link, search, moderation suspend/lift, `moderation.rankTooLow`, close-a-shop and `shop.handleTaken`) matches the current code as written in the brief — the error codes and route shapes quoted there (`shop.notFound`, `moderation.rankTooLow`, `shop.handleTaken`, `stock.negative` → "Stock cannot go below zero.") are all present verbatim in `packages/api/src/lib/errors.ts`.

### 3. Access-control spot check (new in this branch, not in the brief's step list)

`packages/api/src/collections/ProductVariants.ts` field access, worth a direct check since it's easy to misstate:

| # | Action | Expected result |
|---|---|---|
| 12 | Read a variant as a shop **owner or manager**. | `cost` visible (`shopRoleFieldAccess(canManageShop)` — owner/manager only, plus platform moderators/admins via `isModerator` bypass). `stockOnHand`/`stockReserved` also visible. |
| 13 | Read a variant as shop **staff** (the third shop role, not owner/manager). | `cost` **hidden** (staff fails `canManageShop`). `stockOnHand`/`stockReserved` **visible** — their field access is `role !== null`, i.e. any active shop member, staff included, not just owner/manager. |
| 14 | Read a variant as a platform moderator/admin who is not a shop member. | All three fields visible — `shopRoleFieldAccess` short-circuits true for `isModerator(req.user)` before resolving a shop role. |
| 15 | Read a variant as a signed-out visitor or a shop outsider. | None of the three fields present; `available` (virtual, set in `beforeRead` from the raw counters) is the only purchasability signal exposed. |

### 4. Rollback

| # | Action | Expected result |
|---|---|---|
| 16 | Uncheck `AppSettings → Shops → Allow shop creation`. | Immediate: new shop creation blocks (`403 shop.disabled`), entry points disappear on both clients, per section 1 above. No deploy needed — this is a live-editable global, not a build-time flag. |
| 17 | If the deploy itself needs reverting: redeploy the prior image/tag. | Existing shops, products, variants and stock movements are ordinary collections — no destructive migration was added in this branch (confirm with `packages/api/src/migrations` before rollback if any P1 migration ran in production; if one has, its down path needs checking separately, since none was covered by this verification pass). |
| 18 | Re-run `bun run sync:notification-workflows` and `search-indexer`'s `reindex` after any rollback that touched their targets. | Same idempotent result as section 0 — both scripts are safe to re-run. |
| 19 | If a migration run logs a duplicate-key error and mentions a partial unique index it did NOT create (`listings.product`, `products.listing`, or `product-variants.(shop, sku)`). | For the two P1 listing/product migrations: the migration still records itself as applied even though the index is absent — resolve the logged duplicate groups by hand, then delete that migration's row from the `payload-migrations` collection and re-run migrations so it retries and actually builds the index. For the `product-variants.(shop, sku)` migration (20260924_000000_p1_variant_sku): it throws instead, so it is NOT recorded as applied — resolve the logged shop/SKU groups (keep one variant's SKU per group, blank or renumber the rest) and simply re-run migrations; no manual `payload-migrations` edit needed there. |

## Files referenced

- `packages/api/src/lib/errors.ts` — error code registry (`shop.disabled`, `shop.notFound`, `shop.handleTaken`, `moderation.rankTooLow`, `stock.negative`, `upload.invalidType`, `upload.tooLarge`).
- `packages/api/src/services/shops.ts:193` — `shop.disabled` raised on create when the flag is off.
- `packages/api/src/app/(frontend)/api/public/config/route.ts` — `shopsEnabled` in `/api/public/config`.
- `packages/api/src/app/(frontend)/api/public/products/[id]/variants/route.ts` and `packages/api/src/services/catalogue.ts` (`listPublicVariants`, `PublicVariantView`) — buyer-facing variant surface.
- `packages/api/src/hooks/mediaLimits.ts` — media type/size limits.
- `packages/api/src/collections/ProductVariants.ts` and `packages/api/src/access/shopRoles.ts` — field-level access for `cost`, `stockOnHand`, `stockReserved`.
- `packages/web/src/hooks/use-my-shop.tsx`, `packages/web/src/lib/shop-entry.ts`, `packages/web/src/app/s/[handle]/page.tsx` — web flag/redirect behavior.
- `packages/mobile/src/hooks/useCreateShopGate.ts` — mobile flag gate.
- `packages/api/src/scripts/syncNotificationWorkflows.ts`, `packages/search-indexer/src/reindex.ts` — deploy-time scripts.
