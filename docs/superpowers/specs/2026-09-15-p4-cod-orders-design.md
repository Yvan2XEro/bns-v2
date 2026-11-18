# P4 Cash-on-Delivery Orders Design

Date: 2026-09-15
Parent: `2026-09-15-business-layer-design.md`
Depends on: `2026-09-15-p0-foundations-design.md`, `2026-09-15-p1-shops-design.md`, `2026-09-15-p2-verification-design.md` (capability helper). Uses `2026-09-15-p3-team-design.md` (shop inbox, permissions) when it has shipped; see Order conversation for the fallback.

## Goal

Let a buyer order a shop's products and pay cash on delivery in Douala and Yaoundé, with the legal steps Law 2010/021 requires, stock that stays correct, and delivery proven by a code the buyer gives at the door. The shop is the seller of record (D1). BuyNSellem earns 8% commission on delivered orders only (D2), invoiced to the shop and paid by mobile money. No buyer money flows through the platform.

## Scope

1. Server-side carts, single shop per checkout. An order always has exactly one fulfilling shop; the data model already groups the orders of one checkout under a checkout group for multi-shop checkout.
2. Checkout: delivery address (city, district, landmark, GPS pin, phone), delivery method `seller_delivery | pickup`, payment method COD, pre-contract information (art. 15), order summary and explicit confirmation (art. 17), acknowledgement of receipt (art. 19).
3. `orders`, `order-items` and the append-only `order-events` timeline, with a monthly order number sequence.
4. One order service writing `status`, `paymentStatus` and per-item `fulfillmentStatus` through explicit transition tables.
5. Stock integration: reservation at placement, release on cancellation or failed delivery, sale on delivery, all through `services/stock.ts`.
6. COD confirmation by SMS code or seller call, and a 4-digit handover code sent by SMS.
7. Risk controls: buyer refusal score per phone, buyer tiers and shop caps by verification level.
8. Jobs: confirmation expiry, seller acceptance deadline, stale delivery, auto-completion, commission invoicing, overdue enforcement.
9. Withdrawal requests within 15 days of receipt (art. 20), handed off to P6 as return cases.
10. Verified-purchase reviews and shop ratings.
11. Commission lines, weekly commission invoices per shop, payment through `payment-intents` purpose `commission`, restriction of new orders when overdue.
12. One conversation per order in the shop inbox, with system messages.
13. Notifications, moderation (`order.cancel`), error codes, web and mobile screens, feature flag and launch cities.

## Out of scope

- Prepaid mobile-money checkout, payouts, buyer protection fee (P5). The enums below already contain `mobile_money`, `unpaid`, `awaiting_payment`, `paid`, `failed` and `refunded` so P5 needs no migration.
- Disputes, return processing, refunds and commission credits (P6). P4 only creates the return case and stops the clock.
- Delivery zones, pickup locations, shipments and couriers (P7). P4 uses flat per-city fees and a single pickup point per shop.
- Resale items and purchase orders (P8). `order-items.sourcing` exists but P4 only writes `own`.
- Multi-shop checkout (P10). One checkout creates exactly one order in P4. When a checkout later spans several fulfilling shops, it creates one order per fulfilling shop under the same `checkoutGroup`; an order never mixes fulfilling shops.
- Cross-city delivery (D4).
- Shop analytics and velocity limits beyond the caps below (P9).
- Partial shipment or partial acceptance of an order. All items of an order move together in P4.
- Editing a published review.

## Current state (verified 2026-09-15)

- There is no cart, order, invoice or sequence collection. `payload.config.ts` registers 14 collections and one global (`AppSettings`).
- `Reviews.ts`: `reviewer`, `reviewedUser`, `listing`, `rating`, `comment`. `afterChange` calls `updateUserRating` (`hooks/reviews.ts`), which averages every review of `reviewedUser` with `limit: 1000`, and triggers `new-review`. P0 adds server-set `reviewer`, the `(reviewer, reviewedUser)` unique index and the interaction rule.
- `Conversations.ts`: `participants` (users, hasMany), `listing`, `lastMessage`. No shop or order link. P3 adds `conversations.shop` and the shop inbox.
- `Messages.ts`: `conversation`, `sender` (required), `content` (required text), `listing`, `read`. `beforeChange` enforces suspension and blocks; `afterChange` triggers `new-message` for every other participant. No notion of a system message.
- `chat-service/src/messageHandler.ts` persists socket messages through the API and broadcasts `message:new` to the conversation room and each participant's `user:{id}` room. It has no path for messages created by the API itself.
- `services/smsProvider.ts` exposes `sendSms(payload, { to, message, from })` over Avlytext or mTarget, configured in `AppSettings.sms`.
- `services/phoneVerification.ts` already implements the OTP pattern P4 reuses: SHA-256 of `PAYLOAD_SECRET:userId:phone:code`, 10-minute TTL, 60-second resend cooldown, 5 attempts, `randomInt` codes.
- `lib/payments/types.ts` defines `PaymentProvider` (`createPayment`, `verifyWebhook`); P0 extends it and adds `payment-intents` with purpose `boost`, planned extensions `checkout`, `verification_fee`, `subscription`.
- Jobs are Payload tasks (`jobs/expireBoosts.ts`: `TaskConfig` with `schedule` and `queue`), run by `jobs.autoRun` crons on the `nightly` queue. No job runs more often than every 6 hours today.
- `ModerationLog.MODERATION_ACTIONS` covers listings, users and reports; P1 adds `shop.suspend` and `shop.unsuspend`.
- `listings.coordinates` (`lat`, `lng`) exists. `users.homeLocation` has `city`, `region`, `country`, `countryCode`.
- Mobile depends on `expo-location` and has no map library. Web has no map library.
- Integration tests live in `packages/api/tests/int/**/*.int.spec.ts` (vitest).
- Web listing detail (`web/src/app/listing/[id]/page.tsx`) and mobile listing detail (`mobile/app/listing/[id].tsx`) show a seller card, `PhoneReveal` and a message button; neither has a buy action.

## Design

### Assumptions where the umbrella leaves a choice

- **A1 — Order numbers** reset monthly: `BNS-{YYMM}-{6 digits}`, `YYMM` taken in `Africa/Douala` at placement. Gaps are allowed.
- **A2 — Acceptance deadline** runs 48 hours from placement, not from confirmation, so the buyer's wait is bounded whatever the confirmation path. For `mobile_money` orders (P5) it runs 48 hours from payment: the `placed → paid` transition sets `acceptBy = paidAt + 48 h`, and `confirmBy` does not apply.
- **A3 — Commission accrues at delivery** and is invoiced weekly, as the mockup shows. A withdrawal that ends in a refund produces a credit line on a later invoice, written by P6. The alternative — invoicing only completed orders — delays seller billing by 15 days.
- **A4 — Verified-purchase reviews** open at `delivered`. P0's "completed order" is read as "an order whose delivery is completed"; waiting for the 15-day auto-completion would lose most reviews.
- **A5 — Commission base** is the item subtotal, excluding the delivery fee. VAT 19.25% is added on the invoice.
- **A6 — Withdrawal return costs** are borne by the buyer unless the item is defective or not as described. To confirm with the lawyer (open question 2 of the umbrella).
- **A7 — Retention**: orders, items, events and invoices are kept 10 years (OHADA accounting-document retention), stripped of personal delivery data after account deletion.
- **A8 — Caps** in the tables below are launch values stored in `AppSettings.orders`, reviewed weekly against the D4 go/no-go metrics.

### Launch cities and districts

New file `lib/launchCities.ts`, the single source for cities, districts and P4 flat fees:

| Key | Label | Default delivery fee | Districts (keys `{city}.{slug}`) |
|---|---|---|---|
| `douala` | Douala | 2 000 XAF | Akwa, Bonanjo, Bonapriso, Bali, Deïdo, Bonabéri, Bépanda, Makepe, Bonamoussadi, Kotto, Logbessou, Logpom, Ndokoti, New Bell, Nyalla, PK8–PK14, Yassa, Village, Japoma, Bonadibong |
| `yaounde` | Yaoundé | 3 500 XAF | Bastos, Centre-ville, Mvog-Mbi, Essos, Mokolo, Biyem-Assi, Mendong, Nkolbisson, Ngousso, Omnisport, Emana, Etoudi, Nsimeyong, Odza, Mimboman, Ekounou, Melen, Nlongkak, Mvan, Efoulan |

Each city also accepts `{city}.other` with a free-text district. `AppSettings.orders.launchCities` lists the enabled keys (both by default) and can override the fee per city. P7 reuses the district keys for delivery zones.

### Data model

All amounts are integers in XAF. All collections below have `timestamps: true`.

#### `carts`

One active cart per user. The model lets a cart hold items from several shops so P10 can check out groups, one order per fulfilling shop; P4 refuses a second shop at add time.

| Field | Type | Rules |
|---|---|---|
| `user` | relationship users, required, indexed | unique together with `status = active` (partial unique index) |
| `status` | select `active`, `converted`, `abandoned` | service-written |
| `items` | array | up to 30 lines |
| `items.listing` | relationship listings, required | must be `published` with `product` set |
| `items.product` | relationship products, required | derived from the listing |
| `items.variant` | relationship product-variants, required | must belong to `items.product` |
| `items.shop` | relationship shops, required | the listing's (storefront) shop; the single-shop rule applies to this field, while orders are split by fulfilling shop (the same shop for own items, the supplier for P8 resale items) |
| `items.quantity` | number, integer 1–20 | capped at available stock when `trackInventory` |
| `items.priceAtAdd` | number, integer | shown as "price changed" when the current price differs |
| `items.addedAt` | date | |
| `convertedOrders` | relationship orders, hasMany | set on conversion |
| `lastActivityAt` | date | carts inactive for 30 days become `abandoned` (nightly job) |

Access: all REST operations closed. Read and write through `/api/cart` routes and `services/cart.ts`.

#### `orders`

| Field | Type | Rules |
|---|---|---|
| `orderNumber` | text, unique, indexed | `BNS-2609-000123` |
| `checkoutGroup` | text, indexed | `CHK-{ulid}`; one order per fulfilling shop in a group, so one order per group in P4 |
| `idempotencyKey` | text | unique together with `buyer`; client-generated UUID per checkout attempt |
| `buyer` | relationship users, indexed | null after account deletion |
| `buyerDeletedAt` | date | |
| `shop` | relationship shops, required, indexed | storefront shop whose listings were bought; seller of record for `own` items |
| `status` | select `placed`, `confirmed`, `paid`, `accepted`, `shipped`, `delivered`, `completed`, `cancelled`, `delivery_failed`, `returned`, `disputed` | written only by `services/orders/transitions.ts`; P4 never writes `paid`, `returned`, `disputed` |
| `paymentMethod` | select `cod`, `mobile_money` | P4 accepts `cod` only |
| `paymentStatus` | select `unpaid`, `awaiting_payment`, `paid`, `cod_pending`, `cod_collected`, `cod_refused`, `refunded`, `partially_refunded`, `failed` | P4 writes `cod_pending`, `cod_collected`, `cod_refused`, `unpaid`, and `failed` on payment expiry; P5 and P6 write the rest (see State machines) |
| `confirmation` | group | `method` (`verified_phone`, `sms_code`, `seller_call`), `codeHash`, `codeExpiresAt`, `attempts`, `sentAt`, `resendCount`, `confirmedAt`, `confirmedBy` (users); `codeHash` has `read: () => false` |
| `handover` | group | `codeHash`, `attempts`, `lockedAt`, `sentAt`, `regenerateCount`, `method` (`otp`, `buyer_confirmation`, `seller_declaration`), `verifiedAt`, `verifiedBy` (users), `contestBy` (date); `codeHash` has `read: () => false` |
| `delivery` | group | see below |
| `amounts` | group | `subtotal`, `deliveryFee`, `discount` (0 in P4), `buyerProtectionFee` (0 until P5), `total`, `currency` (`XAF`) |
| `commission` | group | `rateBps` (weighted, informational), `amount`, `line` (relationship commission-lines); field `read` limited to staff and shop `owner`/`manager` |
| `risk` | group | `phoneTier` (`new`, `regular`, `trusted`, `watch`), `refusalsAtPlacement`, `capsApplied` (json) |
| `deadlines` | group | `confirmBy` (placedAt + 24 h, COD only), `acceptBy` (placedAt + 48 h; paidAt + 48 h for `mobile_money`), `staleAt` (shippedAt + 14 d), `completeAt` (deliveredAt + 15 d), `withdrawalUntil` (deliveredAt + 15 d) |
| `timestamps` | group | `placedAt`, `confirmedAt`, `acceptedAt`, `shippedAt`, `deliveredAt`, `completedAt`, `cancelledAt`, `failedAt` |
| `cancellation` | group | `by` (`buyer`, `seller`, `staff`, `system`), `reason` (select, below), `note` |
| `deliveryFailure` | group | `reason` (`refused`, `unreachable`, `absent`, `address_not_found`, `timeout`, `other`), `attempts` (number, max 2 in P4), `note` |
| `completionHold` | select `none`, `return_case`, `dispute` | auto-completion skips any value but `none` |
| `returnCase` | relationship return-cases | the open withdrawal case, if any |
| `conversation` | relationship conversations | the order's conversation |
| `contract` | group | `termsVersion`, `locale` (`fr`, `en`), `acceptedAt`, `snapshot` (json, bilingual), `snapshotHash` (SHA-256), `receiptSentAt` |
| `source` | select `web`, `ios`, `android` | |

`delivery` group:

| Field | Type | Rules |
|---|---|---|
| `method` | select `seller_delivery`, `pickup` | P7 adds `courier` |
| `recipientName` | text, required | 2–60 characters |
| `phone` | text, required | E.164, Cameroon mobile `^\+2376\d{8}$` |
| `city` | select, from launch cities | must equal the shop's city (same-city only) |
| `district` | text | a district key, or `{city}.other` plus `districtOther` |
| `districtOther` | text | 2–60 characters, required with `.other` |
| `landmark` | text | required for `seller_delivery`, 5–200 characters ("Face pharmacie du Rond-point Deïdo") |
| `gps` | group | `lat`, `lng`, `accuracyMeters`, `capturedAt`; optional, prompted strongly |
| `instructions` | textarea | up to 300 characters |
| `pickupPoint` | json | snapshot of the shop's pickup point for `pickup` |
| `fee` | number | copy of `amounts.deliveryFee` |
| `etaText` | text | snapshot shown to the buyer |

Cancellation reasons: `buyer_changed_mind`, `buyer_ordered_by_mistake`, `seller_out_of_stock`, `seller_cannot_deliver`, `seller_buyer_unreachable`, `seller_other`, `confirmation_expired`, `seller_timeout`, `payment_expired` (P5 orders unpaid after 30 minutes), `staff_fraud`, `staff_policy`, `staff_other`.

Access: REST `read` for staff only; `create`, `update`, `delete` closed. Buyers and shop members read through custom routes that project the document per audience (`serializeOrderForBuyer`, `serializeOrderForShop`). Hash fields are never serialised.

Phone masking: shop members see `delivery.phone` in full while the order is non-terminal and for 30 days after it becomes terminal; afterwards the projection returns `+2376••••••12`. The stored value is kept (A7).

#### `order-items`

| Field | Type | Rules |
|---|---|---|
| `order` | relationship orders, required, indexed | |
| `lineNumber` | number | 1-based |
| `listing` | relationship listings | |
| `product` | relationship products, required | |
| `variant` | relationship product-variants, required, indexed | |
| `sourcing` | select `own`, `resale` | P4 writes `own` |
| `fulfillingShop` | relationship shops, required | shop holding the stock; equals `order.shop` for `own`; P8 sets the supplier. Every item of an order has the same `fulfillingShop` |
| `purchaseOrder` | relationship purchase-orders | reserved for P8; not created in P4 |
| `snapshot` | group | `title`, `variantLabel` ("Rouge / M"), `sku`, `imageUrl`, `categoryId`, `condition`, `returnPolicy` |
| `unitPrice` | number, integer | variant price at placement |
| `quantity` | number, integer 1–20 | |
| `lineSubtotal` | number | `unitPrice × quantity` |
| `commissionRateBps` | number | category `commissionRateBps` or `AppSettings.orders.defaultCommissionRateBps` (800) |
| `commissionAmount` | number | `round(lineSubtotal × rateBps / 10 000)`, half up |
| `fulfillmentStatus` | select `unfulfilled`, `shipped`, `delivered`, `failed`, `cancelled`, `return_requested`, `returned` | service-written |
| `stockTracked` | checkbox | copy of `variant.trackInventory` at placement |
| `returnedQuantity` | number | P6 writes |

Access identical to `orders`. `categories` gains `commissionRateBps` (number 0–2 000, optional, staff-only write).

#### `order-events`

Append-only. `create`, `update`, `delete` closed; only `services/orders` writes, inside the same transaction as the change it records (art. 26 burden of proof).

| Field | Type | Rules |
|---|---|---|
| `order` | relationship orders, required, indexed | |
| `type` | select | list below |
| `actorType` | select `buyer`, `seller`, `staff`, `system`, `courier` | `courier` used from P7 |
| `actor` | relationship users | null for `system` |
| `actorShopRole` | select `owner`, `manager`, `staff` | for sellers |
| `statusFrom` / `statusTo` | text | when the order status changed |
| `paymentStatusFrom` / `paymentStatusTo` | text | |
| `items` | array `{ orderItem, fulfillmentFrom, fulfillmentTo }` | |
| `reason` / `note` | text | |
| `metadata` | json | never contains codes or hashes |
| `visibility` | select `buyer`, `shop`, `both`, `staff` | drives timeline projection |
| `source` | select `web`, `ios`, `android`, `job`, `staff_console`, `webhook` | |
| `createdAt` | date | |

Event types: `order.placed`, `order.receipt_sent`, `order.confirmation_code_sent`, `order.confirmed`, `order.accepted`, `order.declined`, `order.accept_reminder_sent`, `order.shipped`, `order.handover_code_sent`, `order.handover_code_regenerated`, `order.handover_failed_attempt`, `order.handover_locked`, `order.delivery_attempt_failed`, `order.delivered`, `order.delivery_contested`, `order.delivery_failed`, `order.cancelled`, `order.withdrawal_requested`, `order.completed`, `order.commission_accrued`, `order.note_added`. Reserved for later phases, like their statuses: `order.paid` (P5), `order.disputed` and `order.returned` (P6).

#### `buyer-phone-scores`

One row per phone, keyed by a keyed hash so the score never stores the number itself.

| Field | Type | Rules |
|---|---|---|
| `phoneHash` | text, unique | HMAC-SHA256(`ORDER_PHONE_PEPPER`, E.164) |
| `ordersPlaced` | number | |
| `ordersDelivered` | number | |
| `refusals` | array `{ order, reason, at }` | reasons `refused`, `unreachable`, `absent`, and `refused_abuse` (written by P6 when a `cod_refused_abuse` dispute is resolved for the seller; it counts as two refusals in `r`); last 20 kept |
| `cancelledAfterAccept` | number | buyer cancellations after acceptance |
| `tier` | select `new`, `regular`, `trusted`, `watch`, `blocked` | recomputed on each change |
| `blockedOverride` | select `none`, `unblocked`, `blocked` | staff override |
| `updatedAt` | date | |

Access: staff read only; service writes only.

Tier computation (`services/orders/risk.ts`), counting only refusals from the last 180 days (`r`) and all deliveries (`d`):

| Tier | Rule |
|---|---|
| `blocked` | `r ≥ 3` and `r / (r + d) ≥ 0.5` |
| `watch` | `r ≥ 2` and `r / (r + d) ≥ 0.34` |
| `trusted` | `d ≥ 3` and `r = 0` |
| `regular` | `d ≥ 1` |
| `new` | otherwise |

At checkout both the buyer's verified account phone and the delivery phone are scored; the worse tier applies. `delivery_failed` with reason `timeout`, `address_not_found` or `other` does not count as a refusal.

#### `sequences`

| Field | Type | Rules |
|---|---|---|
| `key` | text, unique | monthly `BNS:2609`, `RET:2609`; yearly `invoice:C:2026` |
| `value` | number | |

Incremented with the Mongoose model's `findOneAndUpdate({ key }, { $inc: { value: 1 } }, { upsert: true, new: true })`. Access closed. `services/sequences.ts` is the single numbering helper of the initiative and exposes two series:

- **Monthly, gaps allowed:** `nextNumber(prefix, date, { width = 6 } = {})` returns `{prefix}-{YYMM}-{n}`, key `{prefix}:{YYMM}`, `YYMM` in `Africa/Douala`. It runs outside the caller's transaction to avoid write conflicts between concurrent checkouts (A1); beyond the width's maximum the number widens by one digit. Users: orders `BNS-2609-000123` (P4), return cases `RET-…` (P4/P6), disputes `DSP-…` (P6), shipments `SHP-…` (P7), purchase orders `PO-2609-0404` with `width: 4` and reseller payouts `RP-…` (P8).
- **Yearly invoice series, no gaps:** `nextInvoiceNumber(series, date)` returns `BNS-{series}-{YYYY}-{6 digits}`, key `invoice:{series}:{YYYY}`. It runs inside the transaction that creates the document, so an aborted invoice releases its number. Series: `C` commission invoices (P4, and P5 for protected orders), `F` buyer protection fee invoices and their credit notes (P5), `A` commission credit notes (P6).

#### `commission-lines`

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | |
| `order` | relationship orders, indexed | |
| `kind` | select `charge`, `credit`, `carry_over` | P4 writes `charge` and `carry_over`; P6 writes `credit`; P8 adds `resale_margin` and a `reason` field |
| `paymentMethod` | select `cod`, `mobile_money` | copy of the order's; the weekly invoice gathers `cod` lines only, P5 invoices `mobile_money` lines at completion |
| `baseAmount` | number | item subtotal of the order |
| `amount` | number, positive integer | sign given by `kind` (`credit` subtracts) |
| `status` | select `open`, `invoiced`, `waived` | |
| `invoice` | relationship commission-invoices | |
| `accruedAt` | date | |

Unique index on `(order, kind)` for `charge`, so a delivery replayed twice cannot charge twice. Access: shop `owner`/`manager` and staff read through routes; writes service-only.

#### `commission-invoices`

| Field | Type | Rules |
|---|---|---|
| `invoiceNumber` | text, unique | `BNS-C-2026-000045`, from `nextInvoiceNumber("C", issuedAt)` |
| `shop` | relationship shops, required, indexed | |
| `periodStart` / `periodEnd` | date | Monday 00:00 to Sunday 23:59:59 `Africa/Douala` |
| `lines` | relationship commission-lines, hasMany | |
| `ordersCount` | number | |
| `commissionTotal` | number | charges − credits + carry-over |
| `vatRateBps` | number | 1925 |
| `vatAmount` | number | `round(commissionTotal × 1925 / 10 000)` |
| `totalDue` | number | `commissionTotal + vatAmount` |
| `currency` | text | `XAF` |
| `status` | select `issued`, `paid`, `overdue`, `waived`, `void` | |
| `issuedAt` / `dueAt` / `paidAt` | date | `dueAt = issuedAt + 7 days` |
| `restrictedAt` | date | when this invoice caused a restriction |
| `paymentIntents` | relationship payment-intents, hasMany | every attempt |
| `sellerSnapshot` | json | shop name, handle, city, RCCM, NIU at issue |
| `issuerSnapshot` | json | BuyNSellem legal name, RCCM, NIU, address from `AppSettings.company` |
| `waivedBy` / `waivedNote` | relationship users / text | staff only |

Example, one week in Douala: a single delivered order of 2 × robe wax at 15 000 + 1 × sac at 15 000 → subtotal 45 000, delivery 2 000, buyer total 47 000. Commission 8% of 45 000 = 3 600; VAT 693; total due 4 293 XAF.

Invoicing rules:

- A shop's open lines whose `commissionTotal` is below `AppSettings.orders.minInvoiceAmount` (500 XAF) stay open and roll into the next week.
- A negative total (credits exceed charges, from P6) is not invoiced: a `carry_over` line of the absolute value is written as a credit for the next period and the lines are marked `invoiced` against a `void` invoice that records the netting.

Access: shop `owner`/`manager` and staff through routes; writes service-only.

#### `return-cases` (created in P4, owned by P6)

P4 creates the collection with the fields needed for the hand-off, using P6's names. P6 adds the remaining fields (deadlines, inspection, refund, evidence) and every transition after `requested`.

| Field | Type | Rules |
|---|---|---|
| `number` | text, unique | `RET-2609-000012`, from `nextNumber("RET", …)` |
| `basis` | select `withdrawal`, `non_conformity`, `late_delivery`, `unavailable` | P4 writes `withdrawal` |
| `order` | relationship orders, required, indexed | |
| `shop` | relationship shops, required | seller of record |
| `buyer` | relationship users | |
| `items` | array `{ orderItem, variant, quantity }` | |
| `reasonText` | textarea | optional for `withdrawal` (no justification required) |
| `returnMethod` | select `buyer_drop_off`, `courier`, `seller_pickup` | buyer preference; `courier` needs P7 |
| `status` | select, P6's state machine | P4 writes `requested` |
| `statusHistory` | array `{ status, actorType, actor, at, note }` | |

#### Changes to existing collections

- **`shops`** (P1):
  - `orderSettings` group, editable by `owner`/`manager`: `codEnabled` (default false), `sellerDeliveryEnabled` (default true), `deliveryFee` (optional integer 0–20 000 overriding the city default), `deliveryEtaText` (e.g. "Livré sous 24–48 h"), `pickupEnabled`, `pickupPoint` (`address`, `landmark`, `gps`, `hours` text), `salesTermsExtra` (textarea, 2 000 characters, shown after the platform template).
  - Service-owned, pinned in `beforeChange`: `ordersRestrictedAt`, `ordersRestrictedReason` (`commission_overdue`, `staff`), `rating`, `totalReviews`, `stats` (`ordersDelivered`, `ordersCancelledBySeller`, `ordersAutoCancelled`, `ordersDeliveryFailed`).
- **`listings`**: no new stored field. The indexer's `transformListing` gains `orderable` (filterable), true when orders are enabled, the shop is active, not restricted, `codEnabled`, its city is a launch city, the product has `delivery.codAllowed` and at least one available variant.
- **`stock-movements`** (P1): `order` (relationship orders, indexed) and `reservedAfter` (number) are added. `orderRef` carries the order number.
- **`reviews`** (P0):
  - `order` (relationship orders, optional), `shop` (relationship shops, optional), `verifiedPurchase` (checkbox, service-set, ignored from clients).
  - The P0 unique index `(reviewer, reviewedUser)` becomes `(reviewer, reviewedUser, shop)`. With `shop` null this is exactly P0's rule for user reviews; a buyer can additionally leave one review per shop.
- **`conversations`**: `order` (relationship orders, unique when set, indexed). P3's `shop` field is set for order conversations.
- **`messages`**:
  - `kind` (select `user`, `system`, default `user`), `systemEvent` (text, an order-event type), `systemParams` (json), `order` (relationship orders).
  - `sender` becomes required only when `kind = user`.
  - Only services can create `kind = system` (a `beforeChange` guard rejects it from requests without `req.context.orderService`).
- **`payment-intents`** (P0): `purpose` gains `commission`; `targetType` gains `commission-invoice`.
- **`ModerationLog`**: `targetType` gains `order` and `commission-invoice`; `MODERATION_ACTIONS` gains `order.cancel` and `commission.waive`.
- **`reports`**: `targetType` gains `order`; `reason` gains `delivery_contested`. Only the order service creates reports with this reason.
- **`AppSettings`**: new `orders` group (see Feature flag) and `company` group (`legalName`, `rccm`, `niu`, `address`, `supportEmail`, `supportPhone`).

### Access helpers

`access/orderAccess.ts`:

- `resolveOrderAudience(req, order)` returns `buyer`, `shop` (with the P3 role from `resolveShopRole`) or `staff`, else `null` → 404 `order.notFound` (never 403, to avoid confirming that an order exists).
- Seller action matrix. Once P3 ships, each row is checked through `requireShopPermission` with the P3 permission in brackets:

| Action | owner | manager | staff |
|---|---|---|---|
| View orders, accept, decline, confirm by call, ship, handover, report attempt, mark failed (`orders.view`, `orders.process`) | yes | yes | yes |
| Cancel after acceptance (`orders.cancel`) | yes | yes | no |
| View commission fields, invoices; pay invoices (`payments.view`) | yes | yes | no |
| Edit `orderSettings` (`settings.edit`) | yes | yes | no |

### Capabilities and caps

P2's `lib/shopCapabilities.ts` returns `codOrders` (true from effective level 1, false for any non-active shop) and `effectiveLevel`. As P2 prescribes, P4 adds `codCaps(effectiveLevel)` to the same file, returning `{ maxOrderTotal, maxDailyOrders, maxOpenOrders }` from these defaults, overridable per level in `AppSettings.orders.shopCaps`. P4 never compares `shop.level` directly:

| Effective level | `codOrders` | `maxOrderTotal` | `maxDailyOrders` | `maxOpenOrders` |
|---|---|---|---|---|
| 0 | false | — | — | — |
| 1 | true | 150 000 | 20 | 30 |
| 2 | true | 500 000 | 100 | 200 |
| 3 | true | 2 000 000 | 500 | 1 000 |

Open orders are `placed`, `confirmed`, `accepted`, `shipped`. Daily orders count placements since 00:00 `Africa/Douala`.

Buyer caps from `AppSettings.orders.buyerCaps`, applied per buyer account across all shops:

| Tier | Max open COD orders | Max order total | Confirmation |
|---|---|---|---|
| `new` | 1 | 75 000 | SMS code or seller call unless delivery phone is the verified account phone |
| `regular` | 3 | 200 000 | same |
| `trusted` | 5 | shop cap only | auto when delivery phone is verified account phone |
| `watch` | 1 | 75 000 | seller call required |
| `blocked` | 0 | — | COD refused: `order.codUnavailable` |

The effective limit is the stricter of the shop and buyer limits. A cap breach returns 409 `order.buyerCapReached` or `order.shopCapReached` at quote time, before the buyer confirms.

### Services and routes

Layout under `src/services`:

- `cart.ts`
- `checkout.ts` — quote and placement
- `deliveryQuote.ts` — P4 flat fees; P7 replaces the implementation behind the same signature
- `orders/transitions.ts` — tables and the single writer
- `orders/actions.ts` — buyer, seller, staff actions
- `orders/handover.ts`
- `orders/confirmation.ts`
- `orders/risk.ts`
- `orders/contract.ts` — pre-contract snapshot and receipt
- `orders/chat.ts`
- `orders/events.ts` — post-commit dispatch
- `commission.ts`
- `sequences.ts`

Every multi-document write runs in one Payload transaction with a shared `req`. A `TransientTransactionError` retries the whole operation up to 3 times.

#### Cart

- `GET /api/cart` — the active cart with each line revalidated: `available`, `maxQuantity`, `currentPrice`, `priceChanged`, `shopOrderable`.
- `POST /api/cart/items` — body `{ listingId, variantId, quantity }`.
  - The listing must be orderable (see `orderable` above), otherwise `cart.itemUnavailable`.
  - The caller must not be a member of the listing's shop: `checkout.selfPurchase`.
  - A line from another shop returns 409 `cart.singleShop` with `{ currentShop }`; the client offers "Vider le panier et ajouter". The same body with `replace: true` empties the cart first.
  - The same variant merges into the existing line. Quantity above available stock returns `cart.outOfStock` with `maxQuantity`.
- `PATCH /api/cart/items/{lineId}` `{ quantity }`, `DELETE /api/cart/items/{lineId}`, `DELETE /api/cart`.
- A signed-out web visitor adding to cart is sent to sign-in and the add is replayed after return (`?addToCart=listingId:variantId:qty`). No anonymous carts.

#### Delivery quote

```ts
quoteDelivery(input: {
  shop: Shop;
  items: QuoteItem[];          // variant, quantity, lineSubtotal, fulfillingShop
  subtotal: number;
  destination: { city: string; district?: string; gps?: LatLng };
  method?: "seller_delivery" | "pickup";
}): Promise<DeliveryOption[]>

type DeliveryOption = {
  optionId: string;            // "seller_delivery:douala" | "pickup:shop"
  method: "seller_delivery" | "pickup";
  fee: number;
  etaText: string;
  codAllowed: boolean;
  pickupPoint?: PickupPointSnapshot;
};
```

P4 implementation:

- `seller_delivery`: offered when `sellerDeliveryEnabled` and the destination city equals the shop's city. The fee is `orderSettings.deliveryFee`, else the city default.
- `pickup`: offered when `pickupEnabled` and a pickup point is set. The fee is 0.
- Any other city returns no option, and checkout returns `checkout.cityNotServed`.

#### Checkout quote: `POST /api/checkout/quote`

Body: `{ address: { recipientName, phone, city, district, districtOther, landmark, gps, instructions }, deliveryOptionId, paymentMethod: "cod", locale }`. P5 accepts `paymentMethod: "mobile_money"` behind its flag; until then it returns `checkout.methodUnavailable`.

Quote and place share a rate limit of 10 calls per user per hour and 30 per IP per hour (`generic.rateLimited`), through `lib/rateLimit.ts` (P9 contract).

1. Feature flag on, else 403 `checkout.disabled`.
2. Buyer authenticated, not suspended, `phoneVerified`, else `checkout.phoneNotVerified`.
3. Cart non-empty (`cart.empty`), single shop, every line available at the requested quantity.
4. Shop active, `codEnabled`, not restricted (`order.shopUnavailable`), `shopCapabilities(shop).codOrders`.
5. Address validation (`checkout.addressInvalid` with field paths).
6. Delivery option still offered (`checkout.methodUnavailable`).
7. Risk and caps (above).
8. Build the summary and the contract snapshot, and compute `quoteHash` = SHA-256 of `{ cart line ids, variant ids, quantities, unit prices, fee, method, city, paymentMethod, termsVersion }`.

Response:

- `summary`: the order summary — items with variant labels, unit prices, quantities, line totals; subtotal, delivery fee, total; payment method; delivery method, address and ETA.
- `preContract`: shop identity, sales terms, withdrawal information.
- `confirmationRequired`: `none`, `sms_code` or `seller_call`.
- `quoteHash`.

Quotes are not stored.

#### Place order: `POST /api/checkout/place`

Body: the quote body plus `quoteHash`, `termsAccepted: true`, `idempotencyKey`.

1. Replay: an existing order with `(buyer, idempotencyKey)` is returned with 200.
2. Re-run every quote check. If the recomputed hash differs → 409 `checkout.quoteChanged` with the fresh quote, so the buyer sees and confirms the new summary (art. 17). `termsAccepted` missing → `checkout.termsNotAccepted`.
3. `orderNumber = nextNumber("BNS", now)` (outside the transaction).
4. Transaction:
   1. Create the order with `status: placed`, `paymentStatus: cod_pending` (`unpaid` for `mobile_money`), deadlines, contract snapshot and hash, risk data.
   2. Create the order items with commission amounts computed but not accrued.
   3. For each tracked variant, `stock.reserve(req, { variantId, quantity, order, orderRef })`. A failed conditional update aborts the transaction with 409 `cart.outOfStock` and the offending line.
   4. Write `order.placed`.
   5. Mark the cart `converted`.
   6. Increment `buyer-phone-scores.ordersPlaced` for the delivery phone.
   7. Apply the confirmation path:
      - delivery phone equals the buyer's verified account phone and tier is `regular` or `trusted` → transition to `confirmed` with method `verified_phone`;
      - otherwise, if `sms_code`, generate the code (below);
      - if `seller_call`, leave `placed`.
5. After commit (`orders/events.ts`, queued as the `dispatchOrderEvent` job so failures retry):
   - send the receipt;
   - send the confirmation SMS when required;
   - create the order conversation and its first system message;
   - notify `order-placed`;
   - publish `listing.updated` for variants whose availability reached zero.

Response: `{ orderId, orderNumber, status, confirmationRequired }`.

#### Pre-contract information, summary and receipt

`orders/contract.ts` builds one bilingual snapshot (Law 2011/012 art. 6) rendered on the checkout review step and stored on the order:

- **Seller identity (art. 15, art. 30):** shop name, handle, city, business phone or the in-app contact, and RCCM and NIU when the shop has provided them. BuyNSellem is shown as the hosting platform, not the seller. The block is built from the seller of record, which P8 overrides for resale orders (supplier as seller, storefront as "Revendeur").
- **Items:** essential characteristics — title, variant label, condition, category attributes marked `showInSummary`, main photo.
- **Price:** unit price and line total in XAF, all taxes included, delivery fee separate, total.
- **Terms:**
  - payment by cash on delivery, paid only when handed the item;
  - delivery method, area and ETA;
  - the seller must accept within 48 hours or the order is cancelled automatically.
- **Withdrawal (art. 20):**
  - 15 days from receipt, without justification;
  - how to exercise it (the "Retourner un article" button on the order);
  - return costs per A6;
  - exceptions to the withdrawal right are listed in the platform terms template.
- **Sales terms:** platform template `legal/shop-sales-terms/{termsVersion}.{fr,en}.md` (version `2026-09`) plus `salesTermsExtra`. A notice states that clauses limiting the seller's legal liability are void (Law 2011/012 art. 5).
- **Complaints:** the order conversation, then BuyNSellem support (`AppSettings.company`).

The review step (art. 17) shows the full summary with "Modifier" links to cart, address and delivery method. It has a mandatory unticked checkbox, "J'ai lu les informations précontractuelles et les conditions de vente de {shop} / I have read the pre-contract information and {shop}'s terms of sale". The final button reads "Commander — paiement à la livraison / Place order — pay on delivery".

Acknowledgement of receipt (art. 19), sent right after commit:

- in-app and push via `order-placed`, and email when the buyer has one;
- an SMS to the delivery phone: "BuyNSellem: commande BNS-2609-000123 reçue chez {shop}, total 47 000 FCFA à payer à la livraison. Suivi: buynsellem.com/purchases/{id}";
- `contract.receiptSentAt` and `order.receipt_sent` are recorded.

`GET /api/orders/{id}/receipt?lang=fr|en` returns the printable HTML receipt: order number, dates, seller identity, items, amounts, payment method, delivery details, withdrawal information and the snapshot hash. It is available to the buyer, the shop and staff.

#### COD confirmation

- **SMS code:** 6 digits, hash `SHA-256(PAYLOAD_SECRET:order:{id}:{phone}:{code})`, TTL 24 h (`confirmBy`), 5 attempts, resend cooldown 60 s, at most 3 resends. SMS: "BuyNSellem: code de confirmation {code} pour la commande BNS-2609-000123. Ne le communiquez qu'à l'application."
- `POST /api/orders/{id}/confirm` `{ code }` (buyer) → `confirmed`, method `sms_code`. Errors: `order.confirmationCodeInvalid`, `order.confirmationCodeExpired`, `phone.tooManyAttempts` (reused).
- `POST /api/orders/{id}/confirmation-code/resend` (buyer) → `order.codeResendLimit` past 3.
- **Seller call:** `POST /api/orders/{id}/confirm-by-call` `{ accept: boolean, note }` (shop member) → `confirmed` with method `seller_call` and `confirmedBy`. With `accept: true` the service applies `placed → confirmed → accepted` in one transaction and writes two events. The seller UI shows the delivery phone with a call button and the buyer's tier badge.

#### Seller actions

All take `{ note? }` and return the serialised order.

- `POST /api/orders/{id}/accept` — from `confirmed` (or `paid` for `mobile_money` orders, P5), before `acceptBy`, else `order.acceptDeadlinePassed`.
- `POST /api/orders/{id}/decline` `{ reason }` — from `placed` or `confirmed` (or `paid`, P5); reason in `seller_out_of_stock`, `seller_cannot_deliver`, `seller_buyer_unreachable`, `seller_other` (note required for `other`). → `cancelled`.
- `POST /api/orders/{id}/ship` — from `accepted`. Generates and sends the handover code. For `pickup`, the buyer label becomes "Prête au retrait".
- `POST /api/orders/{id}/handover` `{ code }` — from `shipped` (below).
- `POST /api/orders/{id}/declare-delivered` `{ note, photo? }` — from `shipped`, when the buyer cannot give the code. Sets `handover.method: seller_declaration`, `contestBy = now + 48 h`; see contest below.
- `POST /api/orders/{id}/delivery-attempt-failed` `{ reason, note }` — from `shipped`; increments `deliveryFailure.attempts`. The second failed attempt, or reason `refused`, requires `mark-delivery-failed`.
- `POST /api/orders/{id}/mark-delivery-failed` `{ reason, note }` — from `shipped` → `delivery_failed`.
- `POST /api/orders/{id}/seller-cancel` `{ reason, note }` — from `accepted`, `owner`/`manager` only → `cancelled`; counts in `stats.ordersCancelledBySeller`.

#### Buyer actions

- `POST /api/orders/{id}/cancel` `{ reason }` — from `placed`, `confirmed`, `accepted` → `cancelled`. After acceptance it increments `buyer-phone-scores.cancelledAfterAccept`.
- `POST /api/orders/{id}/handover-code/regenerate` — from `shipped`, at most 3 times. Issues a new code, resets `attempts`, returns the code once in the response (shown in-app) and sends it by SMS.
- `POST /api/orders/{id}/confirm-receipt` — from `shipped` → `delivered` with `handover.method: buyer_confirmation`.
- `POST /api/orders/{id}/contest-delivery` `{ note }` — only for `seller_declaration`, before `contestBy`. Sets `completionHold: dispute`, writes `order.delivery_contested` and creates a `reports` row (`targetType: order`, reason `delivery_contested`) for staff until P6 turns it into a dispute.
- `POST /api/orders/{id}/withdrawal` — see Withdrawal.

#### Reads

- `GET /api/orders?role=buyer&status=&cursor=` — the caller's purchases.
- `GET /api/shops/{shopId}/orders?tab=to_accept|to_ship|shipped|delivered|cancelled|failed&q=&cursor=` — tabs map to statuses:

| Tab (FR / EN) | Statuses |
|---|---|
| À accepter / To accept | `placed`, `confirmed`, `paid` (P5) |
| À expédier / To ship | `accepted` |
| Expédiée / Shipped | `shipped` |
| Livrée / Delivered | `delivered`, `completed` |
| Annulée / Cancelled | `cancelled` |
| Refusée à la livraison / Refused on delivery | `delivery_failed` (reason shown as a chip) |

  Counts per tab are returned with the list. `q` matches the order number or the recipient name.
- `GET /api/orders/{id}` — audience-projected order, items and timeline (events filtered by `visibility`).

### State machines

`orders/transitions.ts` holds three tables. `applyTransition(req, order, { status?, paymentStatus?, items? }, event)` validates every requested change against its table, writes the order, the items and the event in the caller's transaction, and throws `order.invalidTransition` otherwise. No other code writes these fields.

#### `status`

| From | To | Actor / trigger | Guard | Side effects |
|---|---|---|---|---|
| — | `placed` | buyer, checkout | quote checks | reserve stock; receipt |
| `placed` | `confirmed` | buyer code, system (verified phone), seller call | code valid / tier / member | `confirmedAt` |
| `placed` | `paid` | P5 settlement | `paymentMethod = mobile_money` | reserved for P5; `acceptBy = paidAt + 48 h` |
| `placed` | `cancelled` | buyer; seller decline; job `confirmation_expired` (at `confirmBy`), `seller_timeout` (at `acceptBy`) or `payment_expired` (`mobile_money` unpaid after 30 minutes); staff | | release stock; `paymentStatus`: `cod_pending → unpaid`, or `unpaid`/`awaiting_payment → failed`; items `→ cancelled` |
| `confirmed` | `accepted` | seller | `now < acceptBy` | `acceptedAt` |
| `confirmed` | `cancelled` | buyer; seller decline; job `seller_timeout`; staff | | as above |
| `paid` | `accepted` / `cancelled` | P5 (seller accept or decline, job `seller_timeout`, buyer, staff) | | reserved for P5; the refund follows the cancellation |
| `accepted` | `shipped` | seller | | items `→ shipped`; handover code; `staleAt` |
| `accepted` | `cancelled` | buyer; seller `owner`/`manager`; staff; system `seller_timeout` on an expired P8 purchase order | | as above |
| `shipped` | `delivered` | seller with valid code; buyer confirm-receipt; seller declaration | | stock sale; `paymentStatus`: `cod_pending → cod_collected` (COD); items `→ delivered`; commission line; `completeAt`, `withdrawalUntil`; score `ordersDelivered + 1` |
| `shipped` | `delivery_failed` | seller mark-failed; job at `staleAt` (reason `timeout`) | reason set | release stock; `paymentStatus`: `cod_pending → cod_refused` for `refused`, `unreachable`, `absent`, else `cod_pending → unpaid`; items `→ failed`; refusal recorded for `refused`, `unreachable`, `absent` |
| `shipped` | `cancelled` | staff only | | release stock; `cod_pending → unpaid` |
| `shipped` | `disputed` | P6 (`not_received` on an undelivered order) | | reserved for P6 |
| `delivered` | `completed` | job at `completeAt` | `completionHold = none` | `completedAt` |
| `delivered` | `returned` / `disputed` | P6 | | reserved for P6 |
| `disputed` | `shipped` / `delivered` / `returned` / `cancelled` | P6 | | reserved for P6 |

Terminal: `completed`, `cancelled`, `delivery_failed`, `returned`.

#### `paymentStatus`

| From | To | Trigger | Writer |
|---|---|---|---|
| — | `cod_pending` | placement with `paymentMethod = cod` | P4 |
| `cod_pending` | `cod_collected` | order `delivered` | P4 |
| `cod_pending` | `cod_refused` | order `delivery_failed` with reason `refused`, `unreachable` or `absent` | P4 |
| `cod_pending` | `unpaid` | order `cancelled`, or `delivery_failed` with another reason | P4 |
| — | `unpaid` | placement with `paymentMethod = mobile_money` | P4 |
| `unpaid` | `awaiting_payment` | payment intent created | P5 |
| `awaiting_payment` | `paid` | intent succeeded | P5 |
| `awaiting_payment` | `failed` | last attempt failed or expired | P5 |
| `unpaid`, `awaiting_payment` | `failed` | order cancelled with `payment_expired` | P4 |
| `paid`, `partially_refunded` | `refunded` / `partially_refunded` | provider refund succeeded | P5/P6 |
| `cod_collected`, `partially_refunded` | `refunded` / `partially_refunded` | seller's off-platform cash refund confirmed | P6 |

A failed attempt with retries left keeps `awaiting_payment`. `cod_refused`, `failed` and `refunded` are terminal.

#### Item `fulfillmentStatus`

| From | To | Trigger | Writer |
|---|---|---|---|
| `unfulfilled` | `shipped` | order `shipped` | P4 (P7: shipment picked up) |
| `unfulfilled` | `cancelled` | order `cancelled` | P4 |
| `shipped` | `delivered` | order `delivered` | P4 |
| `shipped` | `failed` | order `delivery_failed` | P4 |
| `delivered` | `return_requested` | withdrawal request | P4 |
| `return_requested` | `returned` / `delivered` | return completed / rejected | P6 |

### Stock integration

`services/stock.ts` (P1) gains four functions. Each writes the movement and the variant cache in the caller's transaction with a conditional atomic update, and does nothing when the item is not `stockTracked`.

| Function | Movement | `quantity` | Condition | Cache update |
|---|---|---|---|---|
| `reserve` | `reservation` | `+q` | `stockOnHand − stockReserved ≥ q` | `stockReserved += q` |
| `release` | `release` | `−q` | `stockReserved ≥ q` | `stockReserved −= q` |
| `sell` | `sale` | `−q` | `stockReserved ≥ q` and `stockOnHand ≥ q` | `stockOnHand −= q`, `stockReserved −= q` |
| `recordReturn` | `return` | `+q` | none | `stockOnHand += q`; called by P6 and P8 when returned goods are back |

`sell` runs at delivery for every item, own or resale (on the supplier's variant); nothing is converted at shipping.

- `stockAfter` records `stockOnHand` and `reservedAfter` records `stockReserved` after the movement.
- Every order movement sets `order` and `orderRef`.
- Idempotency: before writing, the service checks for an existing movement with the same `(order, variant, type)`, so a retried transition cannot double-count.
- A `release` or `sell` whose condition fails logs an error and raises a staff alert. It never throws inside a delivery, because a delivered order must not be blocked by a cache drift; `reconcileStockCaches` (nightly) recomputes caches from the ledger and reports differences.
- Availability for listings and carts is `stockOnHand − stockReserved`. Crossing the low-stock threshold on reservation triggers the P1 `stock-low` notification.

### Handover code

- Generated on `ship` and on buyer regeneration: 4 digits from `randomInt(0, 10 000)`, zero-padded.
- Hash `SHA-256(PAYLOAD_SECRET:handover:{orderId}:{code})`.
- SMS to `delivery.phone`: "BuyNSellem: votre commande BNS-2609-000123 est en route. Donnez le code {code} au livreur uniquement à la remise du colis. Montant à payer: 47 000 FCFA."
- `POST /api/orders/{id}/handover` compares with `timingSafeEqual`.
  - A wrong code increments `attempts` and writes `order.handover_failed_attempt`.
  - At 5 wrong attempts the order sets `lockedAt`, writes `order.handover_locked` and returns `order.handoverLocked`. The seller then asks the buyer to regenerate (new code, attempts reset) or to confirm receipt in-app.
  - At most 3 regenerations, so at most 20 guesses on 10 000 codes per order.
- Rate limit: 10 handover calls per order per hour, and 60 per shop per hour (Redis), `generic.rateLimited`.
- Valid code → `shipped → delivered` in one transaction with its side effects.
- `seller_declaration` is weaker proof (art. 26). `stats` counts declarations per shop, and more than 20% of a shop's last 20 deliveries by declaration raises a staff flag (P9 formalises it).
- The check is exported as `verifyHandoverCode(req, order, code, { actor, shipmentId? })` from `orders/handover.ts`, returning `{ ok: true }` or throwing `order.handoverCodeInvalid` / `order.handoverLocked`. P7 calls it with a shipment id and a courier actor.

### Jobs

Registered in `jobs/index.ts`. Two new `autoRun` entries: `{ cron: "*/5 * * * *", queue: "orders", limit: 50 }` and `{ cron: "0 * * * *", queue: "hourly", limit: 20 }`.

| Task | Queue / schedule | Work |
|---|---|---|
| `dispatchOrderEvent` | `orders`, enqueued | post-commit side effects for one order event (SMS, notifications, chat message, search event); 5 retries with backoff |
| `expireOrders` | `orders`, every 5 min | `placed` with `confirmBy ≤ now` → `cancelled` (`confirmation_expired`); `placed`/`confirmed` with `acceptBy ≤ now` → `cancelled` (`seller_timeout`, `stats.ordersAutoCancelled + 1`); `paid` with `acceptBy ≤ now` → `cancelled` (`seller_timeout`, P5 row); `mobile_money` orders still `placed` 30 minutes after `placedAt` (`AppSettings.payments.checkoutExpiryMinutes`, P5) → `cancelled` (`payment_expired`); sends `order-accept-reminder` once at `acceptBy − 12 h`; batches of 100, each order in its own transaction |
| `failStaleOrders` | `hourly` | `shipped` with `shippedAt + 3 d ≤ now` → reminder to the shop once; `staleAt ≤ now` → `delivery_failed` (`timeout`) |
| `completeOrders` | `hourly` | `delivered`, `completeAt ≤ now`, `completionHold = none` → `completed` |
| `abandonCarts` | `nightly` | active carts idle 30 days → `abandoned` |
| `issueCommissionInvoices` | `commission`, `0 5 * * 1` (Monday 06:00 Douala) | per shop, gather `open` `cod` lines with `accruedAt < periodEnd`, apply minimum and netting rules, create the invoice, mark lines `invoiced`, notify `commission-invoice-issued` |
| `enforceCommissionOverdue` | `commission`, `0 6 * * *` | invoices `issued` past `dueAt` → `overdue` + `commission-invoice-overdue`; `dueAt − 2 d` reminder; overdue for 3 days → set `shops.ordersRestrictedAt` (reason `commission_overdue`), publish `shop.updated`; overdue for 30 days → create a staff report on the shop |
| `reconcileStockCaches` | `nightly` | compare caches with the ledger, log and alert on drift |

`issueCommissionInvoices` is idempotent per `(shop, periodStart)` through a unique index on `commission-invoices`.

### Withdrawal

`POST /api/orders/{id}/withdrawal`, buyer only. Body: `{ items: [{ orderItemId, quantity }], reason?, returnMethod }`.

1. Order `delivered` and `now ≤ withdrawalUntil` (15 days from `deliveredAt`, the receipt), else `order.withdrawalWindowClosed`.
2. No open return case on the order, else `order.withdrawalAlreadyRequested`.
3. Transaction:
   - create `return-cases` (`basis: withdrawal`, `status: requested`, `number = nextNumber("RET", now)`);
   - items `delivered → return_requested`;
   - order `completionHold: return_case`, `returnCase`;
   - event `order.withdrawal_requested`.
4. After commit: the `order-withdrawal-requested` notification to the shop and a confirmation to the buyer, plus a system message in the order conversation.

Hand-off contract to P6:

- P6 subscribes to `order.withdrawal_requested` through `registerOrderEventHandler` (below) and owns every later `return-cases` transition. Once P6 ships, this route delegates to P6's `services/returns.ts#openWithdrawal`, which runs the same checks and approves an eligible request at once.
- On closing a case P6 must:
  1. set items to `returned` or back to `delivered`;
  2. call `stock.recordReturn` for restocked quantities once the goods are back;
  3. set the order to `returned` when every item is returned;
  4. write a `commission-lines` `credit` for refunded amounts;
  5. set `completionHold` back to `none`.
- Until P6 ships, staff handle requested cases manually from the Payload admin, and `completeOrders` keeps skipping held orders.

### Order event handlers

`orders/events.ts` exposes `registerOrderEventHandler(type, handler)`. Handlers run in `dispatchOrderEvent` after commit with `{ payload, order, event }`, each isolated so one failure retries only that handler. P4 registers notifications, SMS, chat messages, search events and commission accrual. P6, P7 and P8 register theirs without editing the order service.

### Commission

- On `shipped → delivered`, within the same transaction, `commission.accrue(req, order)` writes one `charge` line: `amount = Σ commissionAmount`, `baseAmount = subtotal`. It also sets `order.commission` and writes `order.commission_accrued` with visibility `shop`.
- Cancelled and failed orders never accrue (D2).
- Paying: `POST /api/commission-invoices/{id}/pay` (`owner`/`manager`):
  1. Invoice `issued` or `overdue`, else `commission.alreadyPaid`.
  2. Through `services/payments.ts`, create a `payment-intents` row: `purpose: commission`, `targetType: commission-invoice`, `targetId`, `customer: caller`, `amount: totalDue`, `currency: XAF`, `provider: notchpay`, `idempotencyKey: commission:{invoiceId}:{attemptNo}`. A live `pending` intent for the invoice is reused.
  3. Return the NotchPay `checkoutUrl`. Mobile opens it in `expo-web-browser`. The commission is a platform service tied to physical-goods sales and stays outside IAP (umbrella, Apple and Google row).
- The settlement purpose handler for `commission`, run by P0's `processWebhookEvent` and reconciliation, works in one transaction:
  - invoice `paid`, `paidAt`;
  - if the shop has no other `overdue` invoice and `ordersRestrictedReason = commission_overdue`, clear the restriction and publish `shop.updated`;
  - notify `commission-invoice-paid`.
- A settled amount different from `totalDue` stays `pending` per P0.
- Restriction effect: `orderable` becomes false on the shop's listings. Listing pages show "Commandes temporairement indisponibles" with the message button still active. Existing orders continue normally.
- Staff can `waive` an invoice from the Payload admin through `commission.waiveInvoice(actor, invoiceId, note)`, which writes `ModerationLog` action `commission.waive` with `targetType: commission-invoice` and the invoice's order numbers in metadata.
- Documents: `GET /api/commission-invoices/{id}/document?lang=fr|en` renders the bilingual invoice (issuer and seller snapshots, lines with order numbers and base amounts, VAT, total, due date, payment status).

### Reviews

The P0 review `beforeChange` gains an order path. When the body contains `orderId`:

- the order's buyer is `req.user`, and the order is `delivered` or `completed` (A4), else `review.noInteraction`;
- the service sets `order`, `shop = order.shop`, `reviewedUser = shop.owner` and `verifiedPurchase: true`, ignoring client values;
- a second review for the same shop by the same buyer → 409 `review.duplicate`.

Aggregates:

- `updateUserRating` filters `shop: { exists: false }`, so shop reviews do not move the owner's personal rating.
- A new `updateShopRating` computes `shops.rating` and `shops.totalReviews` from reviews with `shop` set, using an aggregation pipeline instead of `limit: 1000`.
- The shop page shows the shop rating once `totalReviews ≥ 1`, otherwise the owner's rating as in P1.

Prompt: the buyer's order screen shows "Noter {shop}" from delivery. The `order-delivered` notification contains the link, and a reminder is sent once 3 days after delivery if no review exists.

### Order conversation

`orders/chat.ts`, run after placement commit:

- Create a conversation with `shop = order.shop` (P3), `buyer`, `order`, `listing` = the first item's listing, participants = `[buyer, shop.owner]`. Other members reach it through the P3 shop inbox, never through `participants`.
- System messages: `kind: system`, no sender, `systemEvent`, `systemParams` (order number, amounts, reason), `content` = French text for released app versions, which render `content` as a normal bubble.
- New clients render a centred timeline chip localised from `systemEvent`.
- System messages are posted for: `order.placed`, `order.confirmed`, `order.accepted`, `order.declined`, `order.shipped`, `order.delivered`, `order.cancelled`, `order.delivery_failed`, `order.withdrawal_requested`, `order.completed`.
- `Messages.afterChange` skips `new-message` notifications for `kind: system`; order notifications cover them.
- Delivery to sockets: the API publishes `{ conversationId, messageId }` on Redis channel `chat:system`. `chat-service` subscribes, loads the message with its service token and emits `message:new` (with `kind`, `systemEvent`, `systemParams`) to the room and each participant's `user:{id}` room.
- Blocking: a buyer who blocked a shop member can still see system messages; user messages keep the existing block rule.
- If P3 has not shipped when P4 starts, only the owner sees the conversation, and the `shop` and `buyer` fields are added when P3 lands.

### Moderation

- `services/moderation.ts` gains `cancelOrder(payload, actor, orderId, { reason, note })`:
  - moderator or admin;
  - reason in `staff_fraud`, `staff_policy`, `staff_other`, note required for `staff_other`;
  - the order is in `placed`, `confirmed`, `accepted` or `shipped`, else `moderation.invalidTransition`;
  - calls `applyTransition` with `actorType: staff` and writes `ModerationLog` (`order.cancel`, `targetType: order`, metadata `{ orderNumber, statusFrom }`) in the same transaction.
- Route `POST /api/moderation/orders/{id}` `{ action: "cancel", reason, note }` and `GET` for the order sheet: parties, amounts, timeline including staff-visibility events, risk tier, the buyer's phone score (counts only), shop stats. It follows `lib/moderationRoute.ts`.
- Mobile moderation gains `moderation/order/[id]`, built on `ModerationScreen` and `DecisionSheet`.
- `buyer-phone-scores.blockedOverride` is editable by admins only in the Payload admin.
- `suspendShop` (P1) cancels nothing automatically. Its open orders get a system message "Boutique suspendue: la commande peut être annulée par l'équipe BuyNSellem", and staff decide per order. `suspendUser` on a buyer leaves their open orders running.

### Account deletion

`deleteUserRelatedData`:

- Refuses with 409 `account.openOrders` while the user has non-terminal orders as a buyer or owns a shop with non-terminal orders, and with `account.unpaidCommission` while an owned shop has `issued` or `overdue` invoices.
- Otherwise:
  - sets `orders.buyer` to null and `buyerDeletedAt`;
  - redacts `delivery.recipientName`, `phone`, `landmark`, `gps` and `instructions` on terminal orders;
  - keeps the order conversation messages authored by the shop;
  - never deletes orders, items, events, commission lines, invoices or return cases (art. 32).

### Notifications

New Novu workflows in `syncNotificationWorkflows.ts`. Channels: in-app and push unless stated; email where the recipient has an email.

| Workflow | Recipient | Trigger | Payload |
|---|---|---|---|
| `order-placed` | buyer (receipt, + email) and shop `owner`/`manager`/`staff` | placement | `orderId`, `orderNumber`, `shopName`, `total`, `audience`, `confirmationRequired` |
| `order-confirmation-needed` | shop members | `seller_call` required | `orderId`, `orderNumber`, `tier` |
| `order-accept-reminder` | shop members | `acceptBy − 12 h` | `orderId`, `orderNumber`, `acceptBy` |
| `order-accepted` | buyer | accepted | `orderId`, `orderNumber`, `shopName`, `etaText` |
| `order-shipped` | buyer | shipped | `orderId`, `orderNumber`, `method`, `pickupPoint` |
| `order-delivered` | buyer and shop members | delivered | `orderId`, `orderNumber`, `withdrawalUntil`, `reviewUrl` |
| `order-cancelled` | buyer and shop members | cancelled | `orderId`, `orderNumber`, `by`, `reason` |
| `order-delivery-failed` | buyer and shop members | delivery failed | `orderId`, `orderNumber`, `reason` |
| `order-delivery-declared` | buyer | seller declaration | `orderId`, `orderNumber`, `contestBy` |
| `order-withdrawal-requested` | shop `owner`/`manager`, buyer | withdrawal | `orderId`, `caseNumber`, `itemsCount` |
| `order-review-reminder` | buyer | 3 days after delivery, no review | `orderId`, `shopName` |
| `commission-invoice-issued` | shop `owner`/`manager` (+ email) | invoice issued | `invoiceId`, `invoiceNumber`, `totalDue`, `dueAt` |
| `commission-invoice-overdue` | shop `owner`/`manager` (+ email) | due reminder, overdue, restriction | `invoiceId`, `invoiceNumber`, `stage` (`due_soon`, `overdue`, `restricted`) |
| `commission-invoice-paid` | shop `owner`/`manager` | settled | `invoiceId`, `invoiceNumber` |

SMS is sent directly through `sendSms` (Novu SMS channels stay disabled), in the order's `contract.locale`, with at most 160 GSM-7 characters where possible:

| SMS | To | When |
|---|---|---|
| Receipt | delivery phone | placement |
| Confirmation code | delivery phone | placement with `sms_code`, resend |
| Handover code | delivery phone | ship, regenerate |
| Seller new order | shop business phone, else owner's phone | placement, only when no member has a push token registered |

SMS failures are retried by `dispatchOrderEvent`. After the final failure the order shows "SMS non délivré" to the seller, who can then use `confirm-by-call` or ask the buyer to open the app.

### Feature flag and launch cities

`AppSettings.orders`:

| Setting | Default |
|---|---|
| `enabled` | `false` |
| `launchCities` | `[{ key: "douala", deliveryFee: 2000 }, { key: "yaounde", deliveryFee: 3500 }]` |
| `defaultCommissionRateBps` | `800` |
| `vatRateBps` | `1925` |
| `minInvoiceAmount` | `500` |
| `invoiceDueDays` / `restrictAfterOverdueDays` | `7` / `3` |
| `confirmHours` / `acceptHours` | `24` / `48` |
| `withdrawalDays` | `15` |
| `staleShippedDays` | `14` |
| `shopCaps` / `buyerCaps` | tables above |
| `termsVersion` | `2026-09` |
| `pilotShopIds` | `[]`; when non-empty, only these shops can enable COD |

`GET /api/public/config` exposes `ordersEnabled`, `launchCities` (key, label, fee) and `withdrawalDays`. With the flag off, cart and checkout routes return 403 `checkout.disabled`, `orderable` is false everywhere and clients hide every entry point. Existing orders stay readable and actionable, so turning the flag off never strands an order.

### Error codes

Added to `lib/errors.ts` with English fallbacks and translations in both clients:

- `cart.empty`, `cart.itemUnavailable`, `cart.outOfStock`, `cart.quantityInvalid`, `cart.singleShop`
- `checkout.disabled`, `checkout.phoneNotVerified`, `checkout.addressInvalid`, `checkout.cityNotServed`, `checkout.methodUnavailable`, `checkout.quoteChanged`, `checkout.termsNotAccepted`, `checkout.selfPurchase`
- `order.notFound`, `order.invalidTransition`, `order.shopUnavailable`, `order.codUnavailable`, `order.buyerCapReached`, `order.shopCapReached`, `order.acceptDeadlinePassed`, `order.reasonRequired`, `order.confirmationCodeInvalid`, `order.confirmationCodeExpired`, `order.codeResendLimit`, `order.handoverCodeInvalid`, `order.handoverLocked`, `order.contestWindowClosed`, `order.withdrawalWindowClosed`, `order.withdrawalAlreadyRequested`
- `commission.invoiceNotFound`, `commission.alreadyPaid`
- `account.openOrders`, `account.unpaidCommission`

Reused: `generic.rateLimited`, `phone.tooManyAttempts`, `payment.providerUnavailable`, `review.duplicate`, `review.noInteraction`, `shop.notMember`, `moderation.invalidTransition`.

### Web

New routes (next-intl, server components with client islands):

- **`/cart`** — lines grouped under the shop header, quantity steppers, "price changed" and "unavailable" states, subtotal, "Passer la commande".
- **`/checkout`** — three steps on one page:
  1. **Address:** saved addresses, recipient, phone (prefilled with the verified phone), city (launch cities only; the shop's city preselected and others disabled with "Livraison dans la même ville uniquement"), district select with "Autre", landmark, "Utiliser ma position" (`navigator.geolocation`, showing accuracy and an "Ouvrir dans Google Maps" link), instructions.
  2. **Delivery:** option cards with fee and ETA, pickup point card.
  3. **Review:** full summary, pre-contract panel (seller identity, terms, withdrawal) with expandable sections in the page locale and a "Version English/Français" toggle, mandatory checkbox, final button.
  - `quoteChanged` re-renders the summary with the differences highlighted.
- **`/checkout/confirmation/[id]`** — receipt view, confirmation-code entry when required, "Voir ma commande".
- **`/purchases`** — list with status chips and tabs (En cours, Livrées, Annulées).
- **`/purchases/[id]`** — timeline, items, amounts, delivery details. Actions by state:
  - confirmation code entry;
  - cancel;
  - show or regenerate the handover code ("Code de remise: donnez-le au livreur uniquement quand vous avez le colis");
  - confirm receipt, contest delivery;
  - "Retourner un article" until `withdrawalUntil`, with a countdown;
  - review, receipt download, conversation link.
- **`/purchases/[id]/receipt`** — printable receipt.
- **`/seller/orders`** — the sidebar "Orders" entry from P1, with the six tabs, counts, search, and columns number, date, customer, items, total, acceptance countdown, tier badge.
- **`/seller/orders/[id]`** — buyer delivery block with call and Maps links, items, amounts including commission (owner/manager), timeline, and the action bar per state: confirm by call, accept, decline, ship, "Saisir le code de remise", report failed attempt, mark failed, declare delivered, cancel.
- **`/seller/billing`** — invoices list with status, due date, "Payer" (NotchPay), current-period accrual preview.
- **`/seller/billing/[id]`** — invoice detail and document.
- **`/seller/settings/orders`** — `orderSettings` form, launch-city notice, level caps from `codCaps(capabilities.effectiveLevel)` as returned in the shop's `capabilities`.

Changes to existing screens:

- **Listing detail** (`listing/[id]/page.tsx`), when `orderable`:
  - variant picker, quantity, "Ajouter au panier" and "Commander maintenant" (add and go to `/checkout`);
  - a delivery line ("Livraison à Douala: 2 000 FCFA · Retrait gratuit");
  - "Paiement à la livraison" and "Retour possible sous 15 jours" badges.
  - When not orderable, the page stays as today.
- **Header:** cart icon with count, when `ordersEnabled`.
- **`profile/me`:** "Mes achats" entry.
- **`/s/[handle]`:** shop rating from verified purchases.
- **Messages:** system message chips and an order header card linking to the order.

### Mobile

New routes (expo-router, registered in `app/_layout.tsx` with `headerShown: false`):

- `app/cart.tsx`
- `app/checkout/address.tsx` — `expo-location` for the position, same fields as web
- `app/checkout/delivery.tsx`
- `app/checkout/review.tsx`
- `app/checkout/confirmation/[id].tsx`
- `app/purchases/index.tsx`
- `app/purchases/[id].tsx` — same actions as web; handover code in a large-digit card
- `app/purchases/[id]/withdrawal.tsx`
- `app/seller/orders/index.tsx` — segmented tabs with counts
- `app/seller/orders/[id].tsx`
- `app/seller/orders/[id]/handover.tsx` — 4-digit keypad entry, attempts left, fallbacks (buyer confirms in app, declare delivered with optional photo)
- `app/seller/billing/index.tsx`, `app/seller/billing/[id].tsx` — pay through `expo-web-browser`
- `app/seller/order-settings.tsx`
- `app/moderation/order/[id].tsx`

Changes:

- Listing detail gains the variant picker, delivery line and buy buttons.
- Account tab gains "Mes achats".
- The Shop hub (`app/seller/index.tsx`) gains Orders (with a to-accept badge) and Billing tiles.
- Message thread renders system chips.
- Deep links `buynsellem://purchases/{id}` and `buynsellem://seller/orders/{id}` are used by push payloads.

No map library is added in P4. GPS capture is a single position with accuracy; P7 adds the draggable pin.

### Internationalisation

- Every new UI string ships in French and English on web (next-intl) and mobile (i18next) in the same change.
- Order documents (pre-contract snapshot, receipt, sales terms template, commission invoice) are generated in both languages (Law 2011/012 art. 6, 13). The buyer's locale selects the default view and the other language is one tap away.
- SMS use `contract.locale`.
- Status labels:

| Status | Buyer (FR / EN) | Seller (FR / EN) |
|---|---|---|
| `placed` | En attente de confirmation / Awaiting confirmation | À accepter / To accept |
| `confirmed` | En attente du vendeur / Awaiting seller | À accepter / To accept |
| `accepted` | En préparation / Being prepared | À expédier / To ship |
| `shipped` | En cours de livraison (Prête au retrait) / Out for delivery (Ready for pickup) | Expédiée / Shipped |
| `delivered` | Livrée / Delivered | Livrée / Delivered |
| `completed` | Terminée / Completed | Livrée / Delivered |
| `cancelled` | Annulée / Cancelled | Annulée / Cancelled |
| `delivery_failed` | Échec de livraison / Delivery failed | Refusée à la livraison / Refused on delivery |

Amounts render as `47 000 FCFA` in French and `XAF 47,000` in English.

## Testing

**Unit tests** (`tests/int`, in-memory Payload fake where the moderation tests use it):

- Transition tables: every allowed transition, and every forbidden transition throws `order.invalidTransition`, for `status`, `paymentStatus` and item `fulfillmentStatus`. P5 and P6 rows are rejected when called from P4 actors.
- Order numbers: format, zero padding, monthly rollover at 00:00 `Africa/Douala`, 7-digit widening, concurrent `nextNumber` calls return distinct values.
- Quote hash: stable for identical input; changes with price, quantity, fee, method, city or terms version.
- Commission: per-line half-up rounding, 8% of 45 000 = 3 600, VAT 693, total 4 293; category rate override; no accrual on cancelled or failed orders; unique charge per order.
- Invoicing: weekly boundaries in `Africa/Douala`; below-minimum lines roll over; credit netting and carry-over; idempotent per `(shop, periodStart)`.
- Risk: tier rules at each boundary; 180-day window; worse of two phones; non-refusal failure reasons ignored; staff override.
- Caps: shop level caps, buyer tier caps, stricter wins, open and daily counts.
- Codes: confirmation and handover hashing, `timingSafeEqual`, attempts, lock at 5, regeneration limit and attempt reset, resend cooldown.
- Withdrawal window: `deliveredAt + 15 d` inclusive boundary, duplicate request, hold blocks auto-completion.
- Reviews: order path requires delivered order by the caller; `verifiedPurchase` and `shop` ignored from clients; one review per shop; user rating excludes shop reviews.

**Transaction and concurrency tests** (MongoDB replica-set service container):

- Placement commits order, items, reservation movements, event and cart conversion together, or nothing when a reservation fails mid-way.
- Two buyers checking out the last unit concurrently: exactly one order, the other gets `cart.outOfStock`, `stockReserved` equals 1.
- Replayed `idempotencyKey` returns the same order and reserves once.
- Cancel after placement releases exactly the reserved quantity; delivery converts reservation to sale; a retried delivery transition writes no second `sale` movement or commission line.
- Seller accept racing with `expireOrders` at `acceptBy`: one wins, the other gets `order.invalidTransition` or skips.

**Route tests:**

- Cart add with another shop (`cart.singleShop`), `replace: true`, self-purchase, unavailable listing.
- Quote and place: flag off, unverified phone, city not served, blocked tier, cap reached, `quoteChanged`, terms not accepted.
- Audience projection: buyer never sees commission; staff shop role cannot see commission or cancel after acceptance; a non-party gets 404; hashes never serialised; phone masked 30 days after terminal.
- Every seller and buyer action from valid and invalid states.
- Commission pay creates a `commission` intent; the settlement handler marks paid and lifts the restriction only when no other invoice is overdue; amount mismatch leaves it pending.
- Moderation cancel by a moderator writes the log in the same transaction; invalid state returns `moderation.invalidTransition`.
- Account deletion blocked with open orders and unpaid invoices; anonymisation after terminal.

**Jobs:** `expireOrders`, `failStaleOrders`, `completeOrders`, `issueCommissionInvoices`, `enforceCommissionOverdue` with a fixed clock, including the restriction publishing `shop.updated`.

**Chat:** system message created with no sender; `new-message` not triggered; `chat:system` publish consumed by `chat-service` (`messageHandler.test.ts` extension); old-client `content` fallback present.

**Clients:**

- Typecheck and biome on web and mobile.
- Manual pass on both, in Douala with a level-1 staging shop:
  - order with verified phone (auto-confirm) and with another phone (SMS code);
  - seller call confirmation;
  - accept, ship, handover with a wrong code then the right code;
  - buyer confirm-receipt path; seller declaration and buyer contest;
  - refusal at the door and the refusal score effect on the next checkout;
  - auto-cancel at 48 h (clock-shifted staging);
  - withdrawal request;
  - verified review;
  - invoice issue, NotchPay sandbox payment, overdue restriction and lift;
  - receipt and invoice in both languages.

## Verification targets

- `bun run generate:types` in `packages/api`
- `bun run check-types` in `packages/api`, `packages/web`, `packages/mobile`, `packages/search-indexer`, `packages/chat-service`
- `bunx vitest run --config ./vitest.config.mts` in `packages/api`
- `bun test` in `packages/mobile`, `packages/search-indexer`, `packages/chat-service`
- `bunx biome check` on touched files
- `bun run sync:notification-workflows -- --dry-run` in `packages/api` lists the new workflows
- Staging with `orders.enabled = true` and `pilotShopIds` set: the manual pass above; production with the flag on for pilot shops in Douala, then Yaoundé, then all eligible shops after the first weekly go/no-go review (D4)
