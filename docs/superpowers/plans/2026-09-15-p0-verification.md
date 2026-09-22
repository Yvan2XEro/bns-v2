# P0 Foundations — Task 19 Verification Report

**Date:** 2026-09-22
**Branch:** `feat/p0-foundations` at `ad4f306`
**Scope:** Task 19 of `docs/superpowers/plans/2026-09-15-p0-foundations.md` — everything that can be run without a live Docker daemon, database or dev server, plus the human checklist for what cannot.

## Environment note

`bun install` needs `BUN_INSTALL`/`BUN_TMPDIR` pointed at a writable directory in this sandbox — the default temp path bun picks is not reachable here. This is a sandbox artifact, not a project issue, and does not affect any other command below.

## Automated results

### Types

| Command | Result |
|---|---|
| `cd packages/api && DATABASE_URI=... PAYLOAD_SECRET=... bun run generate:types` then `git diff --exit-code src/payload-types.ts` | **PASS** — generation exits 0, no diff. `payload-types.ts` is already up to date; nothing to commit. |
| `cd packages/api && bun run check-types` | **PASS** — `tsc --noEmit`, exit 0, no errors. |
| `cd packages/web && bun run check-types` | **PASS** — `tsc --noEmit`, exit 0, no errors. |
| `cd packages/search-indexer && bun run check-types` | **PASS** — `tsc --noEmit`, exit 0, no errors. |
| `cd packages/mobile && bunx tsc --noEmit` | **PASS (baseline)** — 43 errors, matching the agreed pre-existing baseline exactly. No new errors. All errors are in `app/onboarding.tsx`, `components/parallax-scroll-view.tsx`, `components/ui/icon-symbol.tsx`, `hooks/use-theme-color.ts` and `.expo/types/router.d.ts` — none touched by this plan. |

### Tests

| Command | Result |
|---|---|
| `cd packages/api && bunx vitest run --config ./vitest.config.mts` | **1 file failed / 22 passed, 296 tests passed.** The only failure is the known pre-existing one: `tests/int/api.int.spec.ts` — `Error: Failed to resolve import "@/payload.config" from "tests/int/api.int.spec.ts"` (vite import-analysis, module-load error, nothing to do with this plan's changes). `listings-before-change.int.spec.ts`, `public-categories-route.int.spec.ts`, `public-search-route.int.spec.ts` and `boost-callback-route.int.spec.ts` all pass — better than the brief's baseline, which still listed the first two as acceptable failures. |
| `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/boost-callback-route.int.spec.ts` (isolated) | **PASS** — 7/7 tests, 4.28s, no timeout. |
| `cd packages/mobile && bun test` | **PASS** — 20/20 tests, 2 files. |
| `cd packages/search-indexer && bun test` | **PASS** — 18/18 tests, 3 files. |

### Lint

| Command | Result |
|---|---|
| `bunx biome check .` (repo root) | **0 errors, 216 warnings.** Exit code 0. No error-level diagnostics exist at all, so none can sit in a file this branch touched. The two warning samples shown before biome truncated its own output (`--max-diagnostics`) were `packages/api/src/lib/payments/stripe.ts` (`noNonNullAssertion`) and `packages/mobile/app/(tabs)/favorites/index.tsx` (`noExplicitAny`, x3) — pre-existing style warnings, not part of this plan's diff. |

### Docker Compose validation

`docker compose ... config --quiet` does not require a reachable daemon; ran directly.

| File | `MONGO_REPLICA_SET` empty | `MONGO_REPLICA_SET=rs0` + `MONGO_KEYFILE_PATH` set |
|---|---|---|
| `docker-compose.yml` | **PASS** (exit 0) | **PASS** (exit 0) |
| `docker-compose.local.yml` | **PASS** (exit 0) | **PASS** (exit 0) |
| `deployments/docker-compose/docker-compose.yml` | **FAIL as literally specified** — exit 1, `required variable MEILI_MASTER_KEY is missing a value` (no `--env-file`, no defaults for production secrets, by design) | **FAIL as literally specified** — exit 1, `required variable MONGO_PASSWORD is missing a value` |

Re-running the deployment file with `--env-file .env.example` (which ships in `deployments/docker-compose/` for exactly this purpose) supplies every required secret and both replica-set modes then validate clean (exit 0, warnings only). This is expected behavior, not a defect: the deployment compose file intentionally has no defaults for production secrets, unlike the two dev compose files. Worth flagging only because the task's literal command (env vars for the replica switch alone) fails on this file — anyone re-running this check needs `--env-file .env.example` or equivalent secrets present.

### Install

| Command | Result |
|---|---|
| `bun install --frozen-lockfile` (repo root) | **Exit code 0.** "Checked 1850 installs across 1779 packages (no changes)". A `husky` postinstall script logged `error: could not lock config file .git/config: File exists` — a benign git-lock contention from the sandbox's git wrapper, not the lockfile; it did not change the process's own exit code and no repository files changed (verified with `git status --short` before/after). |

## Findings that are not the known `api.int.spec.ts` failure

None. Every other command above is green, matches the agreed baseline exactly (mobile: 43 pre-existing tsc errors), or fails only for a documented, expected reason (deployment compose file requiring secrets that were never provided).

## What cannot be checked here

The Docker daemon is not reachable in this sandbox, and there is no live API, database, dev server, or NotchPay/Stripe sandbox connectivity. `docker compose config` above validates syntax and variable interpolation only — it does not start anything, run migrations, or exercise the replica-set transaction path from Task 18's own soak step.

## Human verification checklist (Tasks 19–21)

### Local dev stack (replica set on, `bns-probe-rs` per Task 18 Step 2, seeded database)

| # | Action | Expected result |
|---|---|---|
| 1 | Start the local single-node replica set on port 27017 (`bns-probe-rs`, no `directConnection`), point the API at `mongodb://127.0.0.1:27017/bns-soak?replicaSet=rs0`, run `cd packages/api && bun run seed`, start the API and web app. | All three processes start clean; no `WriteConflict`, `Transaction` or `NoSuchTransaction` lines appear in the API log at any point during the checklist below. |
| 2 | Create a listing, then edit it (title, price, category). | Both operations succeed; the edited fields persist on reload; no transaction error in the API log. |
| 3 | From the moderation queue, approve one pending listing and reject another. | Approved listing becomes publicly visible/published; rejected listing is flagged/hidden with its rejection reason recorded. |
| 4 | Suspend a user, then unsuspend the same user. | Suspended user cannot sign in / list / message while suspended; access is restored immediately after unsuspend. |
| 5 | Reveal a seller's phone number from a listing as a different account. | Phone number is returned once; a `contact-reveals` row exists for that (viewer, listing) pair. |
| 6 | Buy a boost through the NotchPay **sandbox** end to end: initiate purchase, complete payment in NotchPay's sandbox UI, let the callback route land. | Payment intent moves `created → pending → succeeded`; the boost activates on the listing (boosted flag/expiry set); `boost-payments` record has the NotchPay reference. |
| 7 | Post a review on a listing/seller only after a real conversation exists between the two accounts. | Review is accepted and attributed to the reviewer. |
| 8 | Delete a test account that has at least one succeeded boost payment. | Account is removed/anonymised; in the admin panel the boost payment and its payment intent still exist, with the customer field empty (anonymised), not deleted. |

### Local dev stack — reviews refused (each of the three reasons)

| # | Action | Expected result |
|---|---|---|
| 9 | Attempt to review your own listing/account. | Refused with `review.self`. |
| 10 | Submit a second review for the same listing/seller you already reviewed. | Refused with `review.duplicate`. |
| 11 | Attempt to review a seller you have never messaged/interacted with. | Refused with `review.noInteraction`. |

### Local dev stack — contact-phone rate limit

| # | Action | Expected result |
|---|---|---|
| 12 | Call the contact-phone reveal route 21 times in one hour as the same viewer against different listings. | The 21st call in that hour returns 429 with `generic.rateLimited`; the first 20 succeed. |
| 13 | Call the route 61 times in one day (spread across the hourly limit). | The 61st call that day returns 429 with `generic.rateLimited`. |
| 14 | Reveal the same (viewer, listing) phone twice within 24 hours. | Second call still returns the phone (each call is counted against the rate limit) but only one `contact-reveals` row exists for that pair inside the 24-hour window — confirm no duplicate row is created. |

### Local dev stack — webhook durability

| # | Action | Expected result |
|---|---|---|
| 15 | Send a NotchPay webhook for an intent, then replay the exact same webhook payload a second time. | First delivery processes normally (intent settles). Second (replayed) delivery is accepted and safely ignored/idempotent — no duplicate settlement, no error, `webhook-events` shows both deliveries recorded. |
| 16 | Simulate a "lost" webhook: create a boost purchase, complete payment sandbox-side, but block/drop the webhook callback so the intent stays `pending` past 10 minutes. Wait for the reconciliation job (or trigger it manually) to run. | Reconciliation job picks up the stale pending intent, queries the provider, and settles it (`succeeded` or `failed`) without a webhook ever arriving; the boost activates if settled successful. |

### Local dev / staging — migrations on existing data

| # | Action | Expected result |
|---|---|---|
| 17 | On a database seeded with pre-P0 data (existing users, listings, boost payments predating `payment-intents`/`webhook-events`), run the full migration sequence in order. | All migrations apply cleanly in sequence with no manual intervention; existing documents are untouched or correctly backfilled; the app starts and serves existing data afterward without errors. |

### Staging

| # | Action | Expected result |
|---|---|---|
| 18 | Deploy the branch to staging and watch the first `mongodb` container recreation (its `command`, volumes and healthcheck changed per Task 18). | Container restarts cleanly within a few seconds; healthcheck goes green; no data loss; dependent services (API) reconnect automatically. |
| 19 | Repeat checklist items 2, 6, 8, 15 and 16 (listing edit, boost purchase through NotchPay sandbox, account deletion with a boost payment, webhook replay, lost-webhook reconciliation) against staging with `MONGO_REPLICA_SET` still unset (standalone `mongod`, as Task 19's brief confirms it stays off unless a host opts in). | Same expected results as local — behavior must not depend on the replica set being on, since staging/production run standalone `mongod` until a host explicitly sets `MONGO_REPLICA_SET`. |
| 20 | Confirm environment variables for `NOTCHPAY_PUBLIC_KEY`, `NOTCHPAY_HASH_KEY`, `CHAT_SERVICE_EMAIL`, `CHAT_SERVICE_PASSWORD`, `MEILI_MASTER_KEY`, `MONGO_PASSWORD`, `REDIS_PASSWORD` are all set on the staging host (these have no defaults, confirmed above via `docker compose config`). | `docker compose -f deployments/docker-compose/docker-compose.yml config --quiet` exits 0 on the staging host with its real `.env`, no "missing a value" errors. |

### Production (after staging sign-off)

| # | Action | Expected result |
|---|---|---|
| 21 | Repeat item 18 (container recreation) during the production deploy window. | Same as staging: brief restart, healthcheck green, no data loss. |
| 22 | Spot-check one real boost purchase through NotchPay's live (non-sandbox) flow with a small real amount, then refund/cancel it if the flow supports test transactions safely. | Payment intent settles correctly end to end against the live provider, not just the sandbox. |
| 23 | Confirm the account-deletion anonymisation result (item 8) holds against a real account with real payment history, checked by an operator with admin access. | Deleted account's boost payments/intents remain in the admin panel with customer fields anonymised/empty, matching the sandbox behavior. |
