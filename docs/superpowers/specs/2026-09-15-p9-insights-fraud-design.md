# P9 Seller Insights and Fraud Design

Date: 2026-09-15
Parent: `2026-09-15-business-layer-design.md`
Depends on: `2026-09-15-p1-shops-design.md`, P4 COD orders. Uses P2, P3, P5, P6 and P8 data when those phases have shipped; each rule that needs them is inert until then.

## Goal

Give sellers a short set of numbers they can act on today — reply faster, restock, confirm COD orders, stop cancelling — built nightly from data the platform already records. Give moderators one queue of risk flags, fed by explicit rules and Redis velocity counters, so fraud is reviewed by a human before it costs buyers, suppliers or BuyNSellem money.

## Scope

1. Trustworthy listing view counting, replacing the client-side counter.
2. `shop-daily-stats`, aggregated nightly from listing views, favourites, contact reveals, conversations, `order-events` and `stock-movements`.
3. Seller insights: a dashboard section and an insights page on web, a summary card and an insights screen on mobile.
4. A shared Redis rate limiter and counters, with the split between limits shipped in P4 and signals added in P9.
5. `risk-flags` with rules for velocity, identity duplication, ratios, COD refusal streaks and resale collusion.
6. A risk queue integrated into `services/moderation.ts`, the moderation routes, the mobile moderation hub and a Payload admin view.
7. Privacy, hashing and retention of signals; staff notifications; feature flags.

## Out of scope

- Platform-wide analytics for staff (GMV dashboards, cohort analysis).
- Machine-learned scoring. Scores are rule weights, reviewable and explainable.
- Automatic suspensions. Automation is limited to velocity refusals and payout or commission holds; any sanction is a moderator decision.
- Search impressions and ranking positions: sellers cannot act on them, and Meilisearch does not record them.
- Buyer-facing insights and follow counts (following a shop is its own feature).
- Device fingerprinting beyond a random installation identifier.

## Current state (verified 2026-09-15)

- `collections/Listings.ts` has `views` (number, read-only in admin). The only writer is `web/src/components/listing/view-tracker.tsx`, which sends `PATCH /api/listings/{id}` with `{ views: currentViews + 1 }`. `access.update` is `isOwnerOrAdmin` (`seller = user.id` or admin), so a visitor's increment is refused and only the owner's own visits count; concurrent visits lose updates. Mobile sends nothing (`views` appears only in `mobile/src/types/api.ts`). No per-day view history exists.
- `collections/Favorites.ts` stores `user`, `listing`, `createdAt`; `Conversations.ts` stores `participants`, `listing`, `lastMessage`; `Messages.ts` stores `conversation`, `sender`, `content`, `listing`, `read`, `createdAt`. First-response time is computable from messages.
- Redis: the API uses the `redis` package (`hooks/searchEvents.ts`, `createClient`); `docker-compose.yml` runs `redis:7-alpine`. The chat service rate-limits with `INCR ratelimit:msg:{userId}` and a separate `EXPIRE` on the first hit (`chat-service/src/messageHandler.ts`, 5 per second): if the process dies between the two calls, the key never expires.
- No installation or device identifier is sent by any client. Mobile has `expo-secure-store` and builds headers in `mobile/src/lib/api.ts`.
- Jobs follow `jobs/expireListings.ts`: `TaskConfig` with `schedule: [{ cron, queue: "nightly" }]`, autoRun by `payload.config.ts`.
- Moderation: `services/moderation.ts` writes through `overrideAccess` and `MODERATION_CONTEXT` then `writeLog`; `ModerationLog.targetType` is `listing | user | report`. `api/moderation/summary/route.ts` returns `pendingListings`, `pendingReports`, `total`. Mobile `app/moderation/index.tsx` has two queues (`listings`, `reports`) and sheets under `moderation/listing`, `moderation/report`, `moderation/user`, built on `ModerationScreen` and `DecisionSheet`. The Payload admin registers custom views `ModerationQueue`, `ReportsQueue`, `UserManagement` in `payload.config.ts`. Web has no moderation screens.
- P0 specifies the contact-phone reveal limit in Redis (20 per hour, 60 per day, `generic.rateLimited`) and the `contact-reveals` collection. No order, stock or shop code exists yet; this spec uses the names fixed by the P0, P1 and P8 specs and the P4 interfaces listed at the end.

## Design

### Principles

- **Actionable only.** A metric is shown to a seller only if the screen offers the action that improves it. Each insight card carries that action.
- **Ratios from sums.** Period ratios are computed from summed numerators and denominators, never averaged daily ratios. A ratio with a denominator below 5 shows "—".
- **Signals are evidence, not verdicts.** A flag names a rule, its window and the counts that tripped it. Nobody is told they are flagged; only moderator actions reach the subject, through the existing sanction notifications.
- **Minimise and hash.** Phones and installation identifiers are stored as keyed hashes; evidence references ids rather than copying personal data.

### 1. Listing views

New route `POST /api/public/listings/{id}/view`, anonymous or authenticated:

1. The listing must be `published`; otherwise 204 without counting.
2. Viewer key: user id when signed in, else the installation hash (see Installation identifier), else `HMAC(ip + user-agent)`.
3. Views by a member of the listing's shop, or by the listing's `seller`, are not counted.
4. Dedupe: `SET view:dedupe:{listingId}:{viewerKey} 1 EX 1800 NX`. Only a successful `SET` counts.
5. Count: `HINCRBY stats:views:{yyyymmdd} {listingId} 1` with `EXPIRE … 691200 NX` (8 days). The date is the Africa/Douala calendar day (UTC+1, no daylight saving).
6. Rate limit per viewer key: 120 calls per hour, silently ignored beyond (204).

`ViewTracker` on web calls this route; mobile listing detail calls it once per mount. The `views` field on listings becomes service-written: `beforeChange` ignores it unless `req.context.statsService === true`. The nightly job adds the day's count to `listings.views` so existing sorting by `views` keeps working.

### 2. Installation identifier

- Mobile: a random UUID v4 generated on first launch, stored with `expo-secure-store`, sent as `X-BNS-Install-Id` by `mobile/src/lib/api.ts`.
- Web: a random UUID v4 in `localStorage` (`bns_iid`), sent as the same header by `web/src/lib/api.ts` and `ViewTracker`.
- The API never stores the raw value: `installHash = HMAC-SHA256(RISK_HASH_SECRET, installId)`, first 32 hex characters.
- It resets on reinstall or cleared storage, and shared phones are common in Cameroon (families, phone kiosks). Installation signals are therefore low-weight and never block on their own.

### 3. Shop daily stats

#### `shop-daily-stats`

One row per shop per Africa/Douala day. Unique compound index `(shop, date)`.

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | |
| `date` | text | `YYYY-MM-DD`, Douala day |
| `views` | number | counted listing detail views across the shop's listings |
| `phoneReveals` | number | `contact-reveals` rows on the shop's listings |
| `favouritesAdded` | number | `favorites` created on the shop's listings |
| `conversationsStarted` | number | conversations on the shop's listings created that day |
| `ordersPlaced` | number | `order-events` `placed` |
| `ordersConfirmed` | number | `confirmed` (COD) or `paid` (prepaid) |
| `ordersAccepted` | number | `accepted` |
| `ordersDelivered` | number | `delivered` |
| `ordersCancelledBySeller` | number | cancellations with actor seller or system for seller fault (declined, acceptance timeout, out of stock) |
| `ordersCancelledByBuyer` | number | cancellations with actor buyer |
| `codShipped` | number | COD orders `shipped` |
| `codRefused` | number | COD orders `delivery_failed` with reason refused or unreachable |
| `gmvDelivered` | number, integer | Σ item totals of orders delivered that day, delivery fees excluded, XAF |
| `unitsDelivered` | number | |
| `responseBuckets` | group | counts of first responses: `m5`, `m15`, `h1`, `h4`, `h24`, `over24h`, `unanswered` |
| `awaitingReply` | number | conversations whose last message is from a buyer and older than 12 hours at aggregation time |
| `cogsDelivered` | number, integer | Σ `quantity × variant cost` for `sale` movements of delivered orders; owner and manager only |
| `inventoryCostValue` | number, integer | Σ `stockOnHand × cost` at aggregation time; owner and manager only |
| `outOfStockVariants`, `lowStockVariants` | number | at aggregation time, tracked variants only |
| `topProducts` | array, up to 10 | `{ product, listing, views, ordersPlaced, unitsDelivered, gmvDelivered }`, ranked by `gmvDelivered` then `views` |
| `resale` | group | when P8 is live: `purchaseOrdersReceived`, `purchaseOrdersAcceptedInTime`, `purchaseOrdersCancelledBySupplier` (supplier side); `resaleDelivered`, `commissionAccrued` (reseller side) |
| `computedAt` | date | |
| `version` | number | aggregation code version, to recompute after a formula change |

Access: read by active members with role `owner` or `manager` and by staff; `cogsDelivered` and `inventoryCostValue` have field access owner, manager and staff only (P3 `staff` members see neither the collection nor costs). Writes service-only.

Retention: 25 months, then deleted by `purgeShopDailyStats`.

#### First-response measurement

For each conversation on a shop listing, a **buyer burst** starts with a message from a non-member after the conversation's first message or after 12 hours without messages. Its response time is the delay to the first message from any active shop member (P3 inbox) or the listing seller. A burst without reply after 24 hours counts `unanswered` on the day it started, and a later reply does not move it. A period median is read from the summed buckets: the bucket containing the middle count ("moins de 15 min", "moins d'1 h", …).

#### Aggregation job

`aggregateShopDailyStats`, daily at 23:30 UTC (00:30 in Douala), queue `nightly`:

1. **Views flush.** For the Douala day that just ended, read `stats:views:{yyyymmdd}` with `HSCAN`, add counts to `listings.views` with `context.statsService`, and keep the hash (TTL 8 days) for recomputation.
2. **Window.** Recompute the last 3 Douala days, so delivery and cancellation events recorded late land on the right day.
3. **Aggregation.** Mongo aggregation pipelines through the Payload Mongoose models (`payload.db.collections[slug].aggregate`), grouped by shop and day, over `favorites`, `contact-reveals`, `conversations`, `messages`, `order-events`, `stock-movements`, joined to listings and variants by id. Inventory snapshots are taken only for the day just ended.
4. **Upsert** `(shop, date)` with `computedAt` and `version`; unchanged days are skipped by comparing a hash of the metric values.
5. **Scope.** Shops with `status` `active` or `suspended`; closed shops stop after their closing day.
6. Processes shops in pages of 200, logs duration and row counts, retries once.

A backfill script `scripts/backfillShopDailyStats.ts --from=YYYY-MM-DD` runs the same code over history; views before P9 are unavailable and stay 0.

### 4. Seller insights

#### Route

`GET /api/shops/{id}/insights?period=7d|30d|90d`. Owner or manager (`shop.notMember` otherwise). Response:

- `totals` for the period and the previous period of equal length, with deltas: views, conversations started, orders placed, orders delivered, GMV delivered, units delivered.
- `funnel`: views → conversations or phone reveals → orders placed → delivered; `conversion = ordersPlaced / views`.
- `rates`: seller cancellation rate (`ordersCancelledBySeller / ordersPlaced`), COD refusal rate (`codRefused / codShipped`), delivery completion (`ordersDelivered / ordersAccepted`).
- `responseTime`: median bucket, share answered within 1 hour, `awaitingReply` now (live count, not from stats).
- `daily`: series of views, orders placed, GMV delivered.
- `topProducts`: merged over the period, top 5.
- `stock` (owner and manager): turnover over 30 days = `Σ cogsDelivered / average inventoryCostValue`; `restock`: tracked variants with `available / average daily units delivered over 30 days < 7` days of cover, sorted by days of cover; out-of-stock variants with views in the last 7 days.
- `actions`: at most 4, computed server-side, each with a deep link:

| Condition | Action shown |
|---|---|
| `awaitingReply > 0` | "{n} conversations attendent une réponse" → inbox |
| out-of-stock variants with views in 7 days | "{n} produits en rupture sont encore consultés" → stock adjust |
| restock list non-empty | "Réapprovisionnez {product} : {d} jours de stock" → stock adjust |
| COD refusal rate ≥ 20% over ≥ 5 shipped | "Confirmez chaque commande par appel avant expédition" → orders to confirm |
| seller cancellation rate ≥ 10% over ≥ 5 placed | "Mettez à jour votre stock pour éviter les annulations" → catalogue |
| conversion < 0.5% over ≥ 200 views on a product | "{product} est très vu mais peu commandé : vérifiez prix et photos" → product editor |
| median response bucket slower than 1 hour | "Activez les notifications de messages" → notification settings |

Metrics deliberately not shown: platform rank, competitor prices, search impressions, average order value across the platform. Resale suppliers see purchase orders accepted in time; resellers see commissions accrued (links to P8 screens).

Rates limited: 60 calls per hour per user (`generic.rateLimited`).

#### Web

- `/seller` (P1 "Dashboard"): a 7-day section with four tiles (GMV delivered, orders delivered, conversion, median response time), the `actions` list and a link to the insights page.
- `/seller/insights`: period switcher, totals with deltas, a daily line chart (views, orders, GMV on its own axis), the funnel, rates with their thresholds, top products table, stock turnover and restock table (owner and manager).

#### Mobile

- `app/seller/index.tsx` (P1 hub) gains an insights card: GMV delivered and orders delivered over 7 days with deltas, response time, and the first two actions.
- `app/seller/insights.tsx`: period segments, totals, a compact sparkline per metric, funnel, rates, top products, restock list. No multi-axis chart on mobile.

#### Notification

`shop-weekly-insights` (Novu, email and push, opt-out in notification settings), Monday 07:00 UTC to owners and managers of shops with at least one order or 50 views in the week: GMV delivered, orders, response time, top action.

### 5. Rate limiting and counters

New `lib/rateLimit.ts` in the API, used by every limit in P0, P4, P5, P8 and P9 so behaviour is uniform:

- `hit(key, { limit, windowSeconds })` runs `MULTI; INCR key; EXPIRE key windowSeconds NX; EXEC` (Redis 7), returning `{ count, allowed, resetAt }`. This removes the chat-service failure where the key is incremented but never expires.
- `count(key)` reads without incrementing; `distinctAdd(key, member, windowSeconds)` uses `SADD` + `EXPIRE NX` and returns `SCARD` for "distinct things per subject" rules.
- Keys: `rl:{name}:{subjectKind}:{subjectHash}:{windowStart}`, where `windowStart` is the floor of the current window, so windows are fixed and restart cleanly. Phones and installation ids appear only as hashes.
- Redis unavailable: limits fail open with an error log `rateLimit.unavailable`; commerce is not blocked by a Redis outage, and no flags are raised for that period.
- An optional `onExceeded(name, subject, count)` hook calls the P9 rule engine.

If P0 or P4 lands first, that phase creates `lib/rateLimit.ts` with this contract and P9 adds `onExceeded`.

#### Limits: what ships where

**Shipped before P9 (enforcement caps, no flags):**

| Limit | Phase | Value | Refusal |
|---|---|---|---|
| Contact-phone reveals per viewer | P0 | 20 per hour, 60 per day | `generic.rateLimited` |
| Handle availability checks per IP | P1 | rate limited | `generic.rateLimited` |
| Open COD orders and order total per buyer | P4 | by phone tier: `new` 1, `regular` 3, `trusted` 5, `watch` 1, `blocked` 0 | `order.buyerCapReached`, `order.codUnavailable` |
| Checkout quote and place calls | P4 | 10 per user per hour, 30 per IP per hour | `generic.rateLimited` |
| Handover code attempts per order | P4 | 5, then the order is locked until the buyer regenerates the code (at most 3 times) | `order.handoverLocked` |
| COD daily caps per level-1 shop | P4 | P4 values | P4 code |
| COD blocked for a phone above the refusal score threshold | P4 | P4 threshold | P4 code |
| Payout account changes | P5 | 1 per 7 days; payouts held 72 hours after a change | P5 code |

**Added in P9 (signals and new limits):**

| Rule | Kind | Window | Effect |
|---|---|---|---|
| Any P4 or P5 cap reached | signal | per cap | flag on the subject (see rules) |
| Shops created per user, per installation, per verified phone | limit + signal | 30 days | creation refused above 2 per installation or phone (`shop.creationLimited`); flag at 2 |
| Accounts signing in per installation | signal | 7 days | flag at 5 distinct users |
| Accounts registered per IP | limit | 1 hour | 10, then `generic.rateLimited` |
| Payout accounts per mobile-money number | signal | lifetime | flag when one number is attached to 2 unrelated shops |
| Review creation per user | limit | 1 day | 10, then `generic.rateLimited` |

### 6. Risk flags

#### `risk-flags`

| Field | Type | Rules |
|---|---|---|
| `subjectType` | select `user`, `shop`, `phone`, `device` | |
| `subjectKey` | text, indexed | user or shop id; for `phone` and `device` the HMAC hash |
| `subjectRef` | relationship users or shops | set for `user` and `shop` |
| `subjectLabel` | text | masked for display: `+237 6•• •• •• 42`, `Appareil •••• 9f3a`; never the full phone |
| `signal` | select | the rule ids below |
| `score` | number 0–100 | max of occurrences' scores, plus 5 per repeat within 30 days, capped at 100 |
| `severity` | select `low`, `medium`, `high` | derived: < 40, 40–69, ≥ 70 |
| `status` | select `open`, `reviewed`, `dismissed`, `actioned` | |
| `evidence` | json | rule inputs: window, counts, thresholds, related ids (orders, purchase orders, shops, users); no names, phones or document images |
| `occurrences` | number | |
| `firstSeenAt`, `lastSeenAt` | date | |
| `related` | relationship risk-flags, hasMany | flags sharing a subject key found in the evidence, one hop |
| `autoEffects` | select hasMany | `payout_hold`, `commission_hold`, `limit_applied` already applied by the rule |
| `assignedTo` | relationship users | moderator who opened the sheet last |
| `reviewedBy`, `reviewedAt` | relationship users, date | |
| `resolution` | select `none`, `warned`, `limited`, `user_suspended`, `shop_suspended`, `payouts_held`, `resale_link_suspended`, `order_cancelled`, `false_positive` | |
| `resolutionNote` | textarea | internal |
| `purgeAt` | date | see Privacy and retention |

Unique partial index on `(subjectType, subjectKey, signal)` where `status = open`: a rule that fires again updates the open flag instead of creating a new one.

Access: read by moderators and admins; create, update and delete closed. `services/risk.ts` writes flags; `services/moderation.ts` writes review outcomes.

Status transitions: `open → reviewed | dismissed | actioned`; `reviewed → actioned | dismissed` within 30 days; `dismissed` and `actioned` are terminal. A new trigger after a terminal status creates a new open flag, with the previous one in `related`.

#### Rule engine

`services/risk.ts` exposes `recordRiskSignal({ subjectType, subjectId, signal, evidence, scoreOverride? })`. It hashes phone and device subjects, applies the rule's base score, upserts the flag, links related flags, applies automatic effects when enabled, and triggers staff notifications. Rules run in four places:

- **Inline** from services at the moment of the event (checkout, payout-account change, verification submission), always after the business write commits and never failing the request.
- **Outbox**: P6 and P8 record their signals in P6's `risk-signal-outbox`, inside the transaction that causes them. Job `consumeRiskSignalOutbox` (every 5 minutes) feeds unconsumed rows to `recordRiskSignal` and sets `consumedAt`, so signals recorded before P9 ships are processed on first run.
- **Limit hook** from `lib/rateLimit.ts` `onExceeded`.
- **Nightly** `evaluateRiskRules` at 00:15 UTC, after aggregation, for ratio rules.

| Signal | Subject | Source | Trigger | Base score | Auto effect |
|---|---|---|---|---|---|
| `velocity.orders_per_phone` | phone | P4 cap hit | COD daily cap reached 2 days in 7 | 35 | — |
| `velocity.checkout_attempts` | user, device | P4 cap hit | checkout cap reached | 30 | — |
| `velocity.payout_account_changes` | shop | P5 | 3 changes in 30 days, or a change followed by a payout request within 24 hours | 60 | `payout_hold` 72 h (P5 already holds) |
| `velocity.shop_creation` | user, device, phone | shop creation | 2 shops created in 30 days, or a shop created within 7 days of another closed or suspended shop on the same phone or device | 45; 75 if the other shop was suspended | `limit_applied` |
| `velocity.accounts_per_device` | device | sign-in | 5 distinct users in 7 days | 25 | — |
| `identity.duplicate_document` | user | P2 | a verification document hash already attached to another user | 80 | none needed: the P2 review signal already keeps the request out of automatic approval |
| `identity.duplicate_payout_account` | shop | P5 | one mobile-money number on 2 shops with different owners | 70 | `payout_hold` on the newer shop |
| `orders.seller_cancellation_ratio` | shop | nightly | seller cancellations ≥ 20% of ≥ 20 placed orders in 30 days | 40 | — |
| `orders.dispute_ratio` | shop | nightly (P6) | disputes lost ≥ 5% of ≥ 20 delivered orders in 60 days | 55 | — |
| `cod.refusal_streak` | phone | P4 | 3 consecutive refused COD deliveries | 50 | P4 refusal score already applies |
| `cod.refusal_ratio_shop` | shop | nightly | refused ≥ 40% of ≥ 15 COD shipped in 30 days (fake or unconfirmed orders) | 45 | — |
| `resale.self_dealing` | user, shop | P8 | see P8 anti-collusion | 85 | `commission_hold` |
| `resale.shared_identity` | shop | P8 | link with `riskHold` | 60 | link needs moderator approval (P8) |
| `resale.handover_at_supplier` | shop | P8 | handover near supplier or too soon | 55 | `commission_hold` |
| `resale.buyer_concentration` | shop, phone | P8 | > 3 delivered resale orders from one reseller to one phone in 7 days | 50 | `commission_hold` |
| `resale.cancellation_pattern` | shop | P8, nightly | P8 thresholds | 40 | — |
| `resale.refusal_pattern` | shop | P8, nightly | P8 threshold | 45 | — |
| P6 signals (`dispute_lost_seller`, `counterfeit_confirmed`, `refund_overdue`, `seller_no_response`, `unavailable_after_confirmation`, `dispute_abuse_buyer`, `cod_refusal_abuse`, `serial_withdrawal`, `evidence_reused`, `review_extortion`, `resale_collusion_suspected`) | as recorded | P6 outbox | as defined in P6 | outbox severity: `low` 25, `medium` 50, `high` 75 | — |

A flag above 70 on a shop that has a user flag above 70 on its owner is raised to `high` regardless of its own score, and both appear in each other's `related`.

Automatic effects are applied only when `risk.autoEffectsEnabled` is true, and each effect is reversible by the moderator's outcome. Suspending a user or a shop is never automatic.

### 7. Moderation risk queue

#### Service

`ModerationLog`: `targetType` gains `risk-flag`; `MODERATION_ACTIONS` gains `risk_flag.review`, `risk_flag.dismiss`, `risk_flag.action`.

`services/moderation.ts` gains `decideRiskFlag(payload, actor, flagId, input)`:

- `input`: `outcome` (`reviewed`, `dismissed`, `actioned`), `resolution`, `note` (required for `dismissed` and `actioned`), and for `actioned` the action payload: `{ type: "suspend_user" | "suspend_shop" | "hold_payouts" | "release_holds" | "suspend_resale_link" | "cancel_order", targetId, reason, durationDays }`.
- Checks the transition (`moderation.invalidTransition`) and moderator role.
- `actioned` delegates to the existing functions — `suspendUser`, `suspendShop` (P1), `suspendResaleLink` and `cancelPurchaseOrder` (P8), P5's payout hold, P4's order cancellation — which apply their own rank rules via `canActOn` and write their own log entries. The risk flag entry references them in `metadata.linkedActions`.
- `dismissed` with `false_positive` removes the flag's automatic effects (`release_holds`) in the same operation.
- Writes `risk_flag.review | dismiss | action` with `metadata: { signal, score, previousStatus, resolution }`.

#### Routes

Following `api/moderation/users/[id]/route.ts` and `lib/moderationRoute.ts`:

- `GET /api/moderation/risk-flags?status=open&severity=&signal=&subjectType=&cursor=`: sorted by severity, then score, then `lastSeenAt` descending; 50 per page.
- `GET /api/moderation/risk-flags/{id}`: the flag; a subject summary (for users: account age, level, shops, suspension history; for shops: level, status, 30-day stats rates, open disputes; for phones and devices: linked users and shops by hash, masked); evidence rendered as labelled rows; related flags; the moderation history of the subject.
- `POST /api/moderation/risk-flags/{id}`: calls `decideRiskFlag`.
- `GET /api/moderation/summary` adds `openRiskFlags` (open, all severities) and `highRiskFlags`; `total` adds `highRiskFlags` only, so low flags do not inflate the badge.

#### Mobile

- `app/moderation/index.tsx`: `QueueKey` gains `risk`. The risk queue row shows severity chip, signal label, masked subject label, score, occurrences and relative age (existing `relativeAge`).
- New `app/moderation/risk/[id].tsx` built on `ModerationScreen` and `DecisionSheet`: subject card, evidence rows, related flags (tap opens their sheet), and a decision sheet with outcome, resolution, note and the action form reusing the suspension duration picker from the user sheet.
- `src/hooks/useModeration.ts` gains `useRiskFlags` and `useRiskFlag`.

#### Payload admin

New custom view `@/components/views/RiskQueue`, registered next to `ModerationQueue`: the same list and sheet for desk work, calling the same routes.

### 8. Privacy and retention

Processing purpose: fraud prevention and platform security, entered in the processing register required by Law 2024/017 with the retention periods below.

- **Minimisation:** phones and installation ids are hashed with `HMAC-SHA256(RISK_HASH_SECRET, value)` before they reach Redis keys, flags or logs. `RISK_HASH_SECRET` is rotated only with a migration that recomputes open flags. Evidence stores ids and counts, never message content, document images, names or full addresses. GPS evidence (P8 handover) is stored as a distance in metres, not coordinates.
- **Access:** moderators and admins only; buyers and sellers never see flags. Each open of a flag sheet is written as a structured log line with actor and flag id.
- **Redis:** counters expire with their window (at most 30 days); view dedupe keys after 30 minutes; view hashes after 8 days.
- **Retention of flags:**
  - `dismissed`: `purgeAt = reviewedAt + 90 days`, then deleted.
  - `reviewed` without action: `purgeAt = reviewedAt + 12 months`, then deleted.
  - `actioned`: `purgeAt = reviewedAt + 3 years`, then `evidence` is reduced to `{ signal, score }` and `subjectLabel` cleared; the moderation log entries remain.
  - `open` flags older than 180 days without a new occurrence are closed as `dismissed` with resolution `none` by the purge job and follow the dismissed schedule.
- **Account deletion:** `deleteUserRelatedData` clears `subjectLabel` and `subjectRef` on the user's flags and keeps `subjectKey` and evidence until `purgeAt`, since fraud prevention survives the account (legitimate interest; confirmed with counsel before launch). Shop daily stats of a closed shop stay until their 25-month retention.
- Job `purgeRiskData`: daily at 03:30 UTC.

### 9. Jobs

| Job | Schedule (UTC) | Work |
|---|---|---|
| `aggregateShopDailyStats` | 23:30 daily | views flush, last 3 days recomputed |
| `evaluateRiskRules` | 00:15 daily | ratio rules over the fresh stats |
| `consumeRiskSignalOutbox` | every 5 minutes | P6 and P8 outbox rows into flags |
| `sendWeeklyInsights` | Monday 07:00 | `shop-weekly-insights` |
| `sendRiskDigest` | 07:00 daily | `risk-flags-digest` |
| `purgeShopDailyStats` | Sunday 04:00 | rows older than 25 months |
| `purgeRiskData` | 03:30 daily | retention rules |

All are idempotent and page through 200 records at a time.

### 10. Notifications

New Novu workflows in `syncNotificationWorkflows.ts`:

| Workflow | Recipient | Trigger |
|---|---|---|
| `risk-flag-high` | Novu topic `staff-moderators` | a flag becomes `high`, at most one notification per flag per 24 hours |
| `risk-flags-digest` | topic `staff-moderators` | daily count of new medium flags and open high flags, with oldest age |
| `shop-weekly-insights` | shop owners and managers | weekly summary |

Moderators and admins are added to the `staff-moderators` topic when their role is set and removed when it changes (`Users` `afterChange`). Subjects of flags receive nothing from P9.

### 11. Feature flags

`AppSettings` gains:

- `insights.enabled` (default `false`): insights route, dashboard section and weekly email. The aggregation job and the view route run regardless, so data exists when the flag turns on.
- `risk.enabled` (default `false`): rule engine writes flags. Limits from P0, P1, P4 and P5 are unaffected.
- `risk.autoEffectsEnabled` (default `false`): automatic holds; switched on after two weeks of flag review in production.
- `risk.newLimitsEnabled` (default `false`): the P9 limits (shop creation, registrations per IP, reviews per user).

`GET /api/public/config` exposes `insightsEnabled` only.

### 12. Error codes

Added to `lib/errors.ts`, with fallbacks and translations in both clients:

- `insights.disabled`
- `insights.periodInvalid`
- `shop.creationLimited`
- `risk.actionNotAllowed` (an action type that does not apply to the flag's subject)

Existing codes reused: `generic.rateLimited`, `shop.notMember`, `moderation.forbidden`, `moderation.targetNotFound`, `moderation.invalidTransition`, `moderation.reasonRequired`, `moderation.rankTooLow`.

### 13. Internationalisation

Every new string in English and French on web (next-intl) and mobile (i18next) in the same change, including signal labels, evidence row labels and action sentences. Numbers use the locale's grouping ("2 440 FCFA" in French, "XAF 2,440" in English); response-time buckets are translated labels, not raw minutes.

## Testing

**Unit tests:**

- Views: dedupe window, member and seller views ignored, unpublished listing ignored, Douala day boundary (23:30 UTC counts on the next Douala day), `views` field pinned against REST writes.
- Rate limiter: window boundary, `EXPIRE NX` sets the TTL once, fail-open when Redis throws, `distinctAdd` counts.
- Aggregation, with fixture events: each metric; idempotent re-run; late delivery event lands on its day in the 3-day recompute; seller versus buyer cancellation attribution; cost fields computed from variant cost.
- Response time: burst detection after 12 hours, member reply from another member, unanswered after 24 hours, bucket median.
- Insights: ratios from sums, denominators below 5 return null, turnover and days of cover, action selection order and the cap of 4, cost fields absent for non-owner roles.
- Rule engine: each rule's trigger at, below and above threshold; open flag upsert and score bump; related linking; high escalation across owner and shop; automatic effects only when enabled; no raw phone or installation id in the flag, the evidence or any Redis key.
- Moderation, with the in-memory Payload fake: `decideRiskFlag` transitions, required note, delegation to `suspendUser` with rank rules, false positive releasing holds, log entries.
- Retention: purge schedule per status, 180-day stale close, account deletion clearing label and reference.

**Route tests:** view route anonymous and signed in; insights as owner, manager, staff member (403) and non-member (403); insights period validation; risk-flag routes as a regular user (403) and moderator; summary counts; shop creation refused above the installation limit when `risk.newLimitsEnabled`.

**Clients:** typecheck and biome on web and mobile; `bun test` for the mobile insights formatting helpers. Manual pass: open a listing from two devices and check one view each after aggregation; seller insights on web and mobile with seeded stats; trip a COD refusal streak on staging and act on the flag from mobile moderation.

## Verification targets

- `bun run generate:types` in `packages/api`
- `bun run check-types` in `packages/api`, `packages/web`, `packages/mobile`, `packages/search-indexer`
- `bunx vitest run --config ./vitest.config.mts` in `packages/api`
- `bun test` in `packages/mobile`
- `bunx biome check` on touched files
- Staging: backfill 30 days, run the aggregation twice and diff the rows (no change), manual pass above. Production order: view route and aggregation first (flags off), `insights.enabled` after one week of data, `risk.enabled` next, `risk.autoEffectsEnabled` after two weeks of reviewed flags.

## Cross-phase interfaces assumed

- **P1:** `shops`, `shop-members`, `products`, `product-variants` (`cost`, `stockOnHand`, `stockReserved`, `lowStockThreshold`, `trackInventory`), `stock-movements` with `orderRef`, `listings.shop` and `listings.product`, `suspendShop`.
- **P2:** `sha256` on verification documents and `kyc.documentNumberHash`, and the post-commit `recordRiskSignal` call on `identity_reused` and `document_reused` signals.
- **P3:** active members with roles; conversations on shop listings answered by any member.
- **P4:** `order-events` rows carrying `order`, `type` (`order.placed`, `order.confirmed`, `order.paid` (P5), `order.accepted`, `order.shipped`, `order.delivered`, `order.delivery_failed`, `order.cancelled`, `order.returned` (P6)), `actorType` (`buyer`, `seller`, `staff`, `system`, `courier`), `reason`, `createdAt`, with the shop read from the order; item totals on orders; buyer phone on orders; the caps listed above raised through `lib/rateLimit.ts`; refusal events; order cancellation callable by moderation (`cancelOrder`).
- **P5:** payout-account change events, a payout hold and release function (`holdPayouts`, `releasePayoutHold`), mobile-money number on payout accounts.
- **P6:** dispute outcomes per order with the losing side; `risk-signal-outbox`.
- **P8:** signals written to the P6 outbox; `suspendResaleLink`, `cancelPurchaseOrder`, commission holds.
