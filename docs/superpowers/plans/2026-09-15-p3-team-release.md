# P3 Team — Task 31 Release Report

**Date:** 2026-10-01
**Branch:** `feat/p2-verification`
**Scope:** Task 31 of `docs/superpowers/plans/2026-09-15-p3-team.md` — the staging pass, then production. All 31 other tasks are merged; this document is the release gate. Part A below is what was actually run, in this sandbox. Part B is the checklist for staging and production — there is no deployment, no Redis, no second chat-service replica and no Novu reachable here, so nothing past the source tree and local toolchain was exercised. Nothing in Part B is a result; it is corrected against what the code on this branch actually does, the same split P2's own Task 34 report used.

## Part A — automated gates (what was actually run, and already confirmed by this phase's own checkpoints)

| Gate | Result |
|---|---|
| `check-types` — all 5 packages (api, web, mobile advisory, chat-service, chat-client-sdk) | **PASS**, clean. |
| `packages/api` — `bun run test:int` | **96 files / 1383 tests, zero failures.** |
| `packages/web` — `bun test` | **215 tests, pass.** |
| `packages/web` — `bun run build` | **Clean build.** |
| `packages/mobile` — `bun test` | **281 tests, pass.** |
| `packages/mobile` — `bunx tsc --noEmit` | **35 errors**, under the 39 ceiling held through this phase. |
| `packages/chat-service` — `bun test` (run per-file; the suite is TDD-contended during the phase and was checked file-by-file rather than trusted in parallel) | **55 tests, pass.** |
| `cd packages/api && bun run generate:types` then `git diff` | **No diff.** Every collection change this phase made is reflected in the committed `payload-types.ts`. |
| `bunx biome check` over the 222 files this phase committed | **Clean** — zero errors, after one earlier `--no-verify` bypass's unsorted imports were caught at the end-of-phase gate and fixed (see the ledger, `.superpowers/sdd/2026-09-15-p3-team/progress.md`). |

No new defect class was found in this pass; these numbers are carried forward from the phase's own end-of-spec restoration gate, not re-run here, since nothing in the source tree has changed since they were measured.

### Known-imperfect, carried forward rather than fixed

- **76 locale keys drift between mobile's French and English**, pre-dating P3: 73 keys exist only in `fr.json`, 2 only in `en.json` (`packages/mobile/src/locales/parity.test.ts`). The entire `boostHistory` namespace is French-only. An English-reading user hits a raw key path there. P3 added no new drift — its own four namespaces (`team`, `invite`, `inbox`, `shopActivity`) are in exact en/fr lockstep, mutation-tested — but it did not clear the backlog either; the test pins the count as a ceiling, not a target.
- **21 `noExplicitAny` warnings** sit in `packages/mobile/src/components/messages/ConversationScreen.tsx`. They are not new: the pre-P3 monolith this file was extracted from carried the same 21. The git history attributes the file to P3, which is a true statement about authorship of the file and a misleading one about the defect's age.
- **`packages/api/tests/int/shop-team-effects.int.spec.ts` carries seven `as never` casts**, where its sibling spec files in the same wave carry one each. `tests` is excluded from `tsconfig.json`'s type-checking, which is the only reason any of this convention exists; the phase's cast ceiling (98 in API tests, paired with the 105 type-error ceiling so neither can be gamed against the other) was set one task late, after these seven already existed, so it stops new ones without undoing these.

## Part B — staging and production checklist

Nothing below was exercised against a live system. Every check states what a correct result looks like, so an operator can tell success from "it did not error."

### 0. Before anything — migrations and env vars

**Migrations do not run themselves.** Nothing in `packages/api/Dockerfile` (`CMD HOSTNAME="0.0.0.0" node server.js`), any of the four compose files, or `.github/workflows/build-and-push.yml` / `deploy.yml` runs a migration. This is a manual step on every deploy that ships one:

```bash
cd packages/api
bun run migrate:status   # lists what is pending
bun run migrate          # applies it
```

A correct `migrate:status` before running shows three pending P3 migrations by name (`20261001_000000_p3_invitation_pending_key`, `20261001_000100_p3_shop_listing_seller`, `20261001_000200_p3_shop_member_defaults`); after `migrate`, `migrate:status` shows none pending and the process exits 0 with no stack trace.

**The invitation-index migration (`20261001_000000_p3_invitation_pending_key.ts`) can fail on purpose.** It creates a partial unique index on `shop-invitations.pendingKey` (scoped to `status: "pending"`), enforcing one pending invitation per shop/channel/target. Before creating it, it aggregates existing pending rows grouped by `pendingKey` and checks for duplicates. If it finds any, it logs each colliding `pendingKey` and the full list of invitation ids under that key (`payload.logger.error`), then **throws** rather than creating the index over bad data — the migration is left unrecorded, so the next deploy retries it rather than silently skipping. **What an operator does when this happens:** read the logged invitation ids, open each in the admin panel, decide which is the one that should remain pending (normally the most recent), revoke the others (`DELETE /api/shops/{id}/invitations/{invId}` or the admin UI's revoke action — this is a data-hygiene decision, not something the migration should guess), then re-run `bun run migrate`. On real data this should find nothing: P3 is the phase that introduces this collection, so duplicates would only exist from a prior partial or interrupted deploy of this same phase.

**The listings-seller migration (`20261001_000100_p3_shop_listing_seller.ts`)** rewrites every shop listing's `seller` field to the shop's owner, for any listing where it currently differs. On data written since P1 (owner-only shop memberships) this should update zero rows; it exists because "should update zero" is a belief about data, not a guarantee. The run logs one count: `updated`. A correct run shows `updated: 0` on an already-consistent database; a nonzero count means some listing's `seller` had drifted (e.g. from a since-removed former-member write path) and has now been corrected to the owner.

**The shop-members defaults migration (`20261001_000200_p3_shop_member_defaults.ts`)** backfills `joinedAt` (from `createdAt`) and `inboxNotifications` (defaulting to `"all"`) on any `shop-members` row written before these fields existed — in practice the owner rows P1's `createShop` wrote, since Task 9 is the first writer of any other row and lands after this migration. It logs `joinedAtBackfilled` and `inboxNotificationsBackfilled` counts. A correct run on a database that already went through P1 and P2 shows both counts equal to the number of shops that existed before this deploy; 0 on a fresh database.

**Env vars.** P3 added no new environment variable: the team feature reuses `REDIS_URL` (already present in all four compose files — `docker-compose.yml`, `docker-compose.local.yml`, `docker-compose.atlas.yml`, and `deployments/docker-compose/docker-compose.yml`, which is the one the GitHub Actions deploy workflow actually `scp`s and runs, per `.github/workflows/build-and-push.yml` and `deploy.yml`) and the existing `CHAT_SERVICE_EMAIL`/`CHAT_SERVICE_PASSWORD`/`NOVU_*` variables, all four of which already carry them. This is worth checking anyway rather than assumed, because `docs/ci-cd.md` treats `deployments/docker-compose/.env.example` as the canonical variable list and AGENTS.md's "the docker-compose.yml files" / this phase's own prior wording of "three compose files" still understates the count — there are four, and the fourth is the one that actually ships. Any future env var must be added to all four, not three.

Confirm before the staging pass starts:
- `REDIS_URL` resolves to the **same** Redis instance from the API container and from **both** chat-service replicas — a different Redis per replica makes the eviction pass (Section 4) silently pass for the wrong reason (no cross-node event ever needed to travel).
- `CHAT_SERVICE_EMAIL` is set on **both** the API and chat-service. Without it on the API, `isChatServiceAccount` matches nobody and the service account's REST writes (`conversations/{id}/read`, `inbox-members`) are refused as an ordinary user, and websocket messages stop persisting.
- `AppSettings.shops.enabled` and `AppSettings.verification.enabled` are both on — the team feature sits on top of shops and level 2.

### 1. Running two chat-service replicas — the point of this staging pass, not a nicety

`deployments/docker-compose/docker-compose.yml` defines **one** `chat-service` service block with no `deploy.replicas`. As shipped, a `docker compose up -d` on that file runs a single instance. Cross-node socket eviction — a member removed on one replica losing their socket on another — cannot be observed on one process; the whole point of this pass is proving the Redis adapter forwards the event between two.

To run two for this pass: `docker compose -f deployments/docker-compose/docker-compose.yml up -d --scale chat-service=2` (Traefik/Dokploy load-balances across the two containers by service name, not by individual container, so this is sufficient — no second service block needed for the test). Confirm two containers are up: `docker compose ps chat-service` shows two rows, both `running`.

The unit tests (`packages/chat-service/src/__tests__/membership.test.ts`) prove the **subscriber** computes the right room list from `shop:{shopId}:rooms` in Redis and calls `socketsLeave` with the right arguments — that is Part A, already green. They cannot prove the **adapter** actually carries that call across a process boundary; only two live replicas, with a socket connected to each, show that.

Then sync the Novu workflows before any team notification can fire:

```bash
cd packages/api
bun run sync:notification-workflows
```

A correct run prints one line per workflow id (`[notifications] synced workflow "shop-invitation" (created)`, or `(updated)` on a re-run) ending with a summary line (`N created, M updated`). Confirm the eight team workflow ids appear: `shop-invitation`, `shop-invitation-accepted`, `shop-invitation-declined`, `shop-member-removed`, `shop-member-role-changed`, `shop-team-paused`, `shop-inbox-message`, `shop-conversation-assigned`. The script is idempotent — it fetches each workflow by id first and creates it only on a 404, so re-running it after a partial failure is safe and simply reports `(updated)` for whatever already landed.

### 2. The level-2 team pass

With a level-2 staging shop, run every item in the original plan's Task 31 brief Step 2 (`.superpowers/sdd/2026-09-15-p3-team/task-31-brief.md`) as written:

| # | Check | What success looks like |
|---|---|---|
| 1 | Invite a staff member by phone, no existing account | SMS arrives bilingual (FR/EN in one message, per `shopMembers.ts`'s invitation copy), the link opens the **web** page `/invite/{token}` (not an app deep link — see Section 7), register → verify phone → accept → the seller space of that shop opens. |
| 2 | Invite a manager by email, existing signed-in account | Email arrives; the in-app notification arrives (Novu `shop-invitation` fired to the existing user id); accepting from the signed-in session works. |
| 3 | Invite the same email again | `team.invitationPending`. |
| 4 | Invite the owner's own number | `team.cannotInviteSelf`. |
| 5 | A manager invites a manager | refused; invites staff | allowed. |
| 6 | Staff opens `/seller/team` | roster renders, no Invite button, no actions menu. |
| 7 | Fill the shop to five seats, invite again | `team.limitReached`, meter reads "5 / 5". |
| 8 | Resend, then open the first link | `team.invitationInvalid`; the second (resent) link works. |
| 9 | Resend twice more (third resend total) | third resend refused with `team.resendLimit`. |

### 3. The permission pass

As a staff member, web and mobile: no cost, margin, stock value or stock summary anywhere; no Verification/Settings/Activity entry point; archiving a product not offered and `PATCH` on it answers `shop.forbidden`; `POST /api/shops/{id}/handle` answers `shop.forbidden`. All of this is driven by the single permission matrix in `access/shopRoles.ts` (Task 1/2 of this phase) — a failure here means a route still has an inline role check the matrix conversion missed, which is exactly the class of bug Tasks 2 and 18 were built to catch and did not find any remaining instance of.

### 4. The inbox pass

Run the brief's Step 4 sequence: a buyer message triggers a push to every `all`-preference member, a second message inside two minutes sends no second push (the `notif:inbox` rate-limit window is 120s — confirm by checking the timestamp gap, not by trusting silence), assigning routes future notifications to the assignee alone and fires `shop-conversation-assigned`, the buyer sees the shop name and logo (never the member's name), marking done then a new message reopens the conversation, concurrent assignment from both clients settles on one winner on both screens, and a second listing from the same shop reuses the same thread rather than opening a new one.

### 5. The eviction pass — needs the two replicas from Section 1

Sign the staff member in on a device landing on replica A (confirm via chat-service logs, which log the replica's own hostname/pid on each connection), open the shop inbox, then remove them from the owner's session on a device landing on replica B. Confirm: the screen closes with the alert; a send attempt on a shop conversation is refused; **replica A's own logs show the socket leaving the rooms** (the membership-change log line, not a fresh disconnect from that process) — that is the one observation that proves the event arrived through Redis rather than from the same process that issued the removal; and `GET /api/shops/{id}/inbox` for that user now answers `shop.notMember`.

Then the two no-id cases: suspending the shop from moderation closes every member's inbox screen and both sides get `shop.inactive` on a send attempt; revoking the shop's level 2 (P2) drops pending invitations, fires `shop-team-paused` for the owner and members, drops member access while the owner keeps theirs, and the team page shows the locked state — restoring the level must restore access with **no re-invitation needed**.

### 6. The moderation and deletion pass

Suspending a member from moderation drops their inbox access but keeps their assignment, shown with a `suspended` chip, so the owner can reassign; lifting suspension restores access with no write needed. Deleting a member's account leaves their shop messages attributed to the shop with "Former member", membership reads revoked. Closing a shop revokes every non-owner membership and pending invitation, and the activity log holds exactly one `member.removed` per member plus one `shop.closed`.

### 7. What is a deep link and what is not — correcting the brief's own framing

The invite flow's **actual** link, sent by both SMS and email, is the web URL: `${PUBLIC_WEB_URL}/invite/{token}` (`packages/api/src/services/shopMemberNotifications.ts:208`, and the bilingual SMS copy at `packages/api/src/services/shopMembers.ts:499`). The mobile app does have a route that would answer a `buynsellem://invite/{token}` deep link (`packages/mobile/app/invite/[token].tsx`, reachable via the `buynsellem` scheme declared in `app.json`), and it implements the same accept/decline flow as the web page. But **no code in this repository constructs or presents a `buynsellem://invite/{token}` URL, and the web invite page has no "Open in the app" button or any other handoff to it** — a repo-wide search for the literal scheme string finds it used only for the unrelated verification-return flow (`buynsellem://seller/verification/return`), never for invites. So "the deep link and the landing page's handoff, verified only statically" is true only in the narrow sense that the mobile route exists and would resolve if reached; there is no product surface that reaches it, and that absence is not a staging-pass gap to close but a fact worth flagging to whoever wrote that requirement, since it describes a feature this branch does not contain.

The per-conversation deep link (`packages/mobile/app/messages/[conversationId].tsx`) opening before the inbox list screen has ever mounted is a real, distinct item: `useShopInboxSocket` (which joins the shop's inbox room and wires `inbox:conversation-updated`/`message:new` invalidation) only runs from the inbox list screen; `ConversationScreen` itself calls `chatClient.joinConversation(conversationId)` directly on mount, independent of that hook. Whether a cold deep-link open — with the socket provider (`ChatContext`) only just connecting — reliably delivers live updates before the inbox screen has ever been visited is not proven by any test here and needs a live device check.

### 8. Production

```bash
cd packages/api
bun run migrate:status   # confirm the three P3 migrations are the only pending ones
bun run migrate
```

Confirm `CHAT_SERVICE_EMAIL` is set on the API (Section 0). Sync the Novu workflows (Section 1). Deploy. Repeat Steps 2 (team), 4 (inbox) and 5 (eviction) abbreviated against one real shop before announcing the feature.

### 9. Rollback

| Migration | `down` exists? | What it does and does not restore |
|---|---|---|
| `20261001_000000_p3_invitation_pending_key` | Yes. Drops the `pendingKey_1_unique_pending` partial index (swallowing the error if it is already gone). | Restores nothing beyond removing the index — invitation rows are untouched. Safe to roll back at any time; the only consequence is the uniqueness guarantee stops being enforced at the database layer (the service's own pre-insert check still runs, just without the race-closing index behind it). |
| `20261001_000100_p3_shop_listing_seller` | **No** (`down` is a no-op with a comment explaining why). | **Irreversible.** The listing's original `seller` value before this migration ran was never recorded anywhere, so there is nothing to restore it from. Rolling back the deploy does not undo this rewrite — a listing whose seller was corrected to the shop owner stays that way even if the code that enforces the rule is rolled back. |
| `20261001_000200_p3_shop_member_defaults` | **No** (same reasoning). | **Irreversible, for the same structural reason as above:** a row backfilled by this migration is indistinguishable from one that always had these fields, so there is no way to tell which `joinedAt`/`inboxNotifications` values were real versus backfilled, and therefore nothing to revert to. |

The practical reading for a 2am rollback decision: rolling back the **code** (redeploying the prior image/tag) is safe and independent of these migrations — nothing new in P3's code depends on the migrations having run in order to degrade gracefully, it simply stops exercising the team feature. Rolling back the **migrations themselves** is only meaningful for the first one; the other two are one-way data corrections, not schema toggles, and re-running the old code against the now-corrected data causes no harm (a listing whose seller already reads "the owner" is exactly what the old owner-only-membership code expected anyway).

## Unverified — list, honestly

Nothing below was exercised against a live system; each is a specific, named gap rather than a blanket disclaimer.

1. **Cross-node socket eviction** (Section 5) — needs two live chat-service replicas sharing one Redis; the unit tests prove the subscriber's logic, not the adapter's cross-process delivery.
2. **The `buynsellem://invite/{token}` mobile route and any "Open in the app" handoff** — verified only by static code reading (the route exists; no code constructs or links to that URL from the actual invite flow — see Section 7).
3. **SMS delivery of an invitation** — the code path is provider-agnostic (`avlytext` / `mtarget` / `console`, selected by `AppSettings.sms.provider`); which real vendor staging is configured with, and whether it actually delivers, is unverified here.
4. **The email invitation's inline Novu subscriber** (`invite-{invitationId}`) for a non-subscriber target — the code path exists (`notifyShopInvitation` in `shopMemberNotifications.ts`) but was never exercised against a live Novu instance.
5. **The per-conversation deep link with no prior inbox visit** — whether live updates reach `ConversationScreen` reliably before `useShopInboxSocket` has ever run, on a cold app start from a push or deep link (Section 7).

Five items.

## What the brief asked for that could not be written from the repo

The brief (and the parent task's instructions) described "the landing page's 'Open in the app' handoff" as an existing, statically-verified mechanism. It is not in the repository: there is no button, link, or smart-app-banner on `packages/web/src/app/invite/[token]/` pointing at the mobile scheme, and no code anywhere constructs a `buynsellem://invite/...` URL. This document keeps the item in the unverified list (Section 7, item 2) but corrects the framing rather than asserting a handoff that does not exist in the source.
