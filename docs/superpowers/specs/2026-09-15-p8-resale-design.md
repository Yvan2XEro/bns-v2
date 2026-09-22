# P8 Resale Design

Date: 2026-09-15
Parent: `2026-09-15-business-layer-design.md`
Depends on: `2026-09-15-p1-shops-design.md`, `2026-09-15-p2-verification-design.md` (level 3, `shopCapabilities`), `2026-09-15-p3-team-design.md` (permissions), `2026-09-15-p4-cod-orders-design.md`, P6 Disputes and returns. Commission payouts use `2026-09-15-p5-protected-payment-design.md` payout accounts; prepaid resale also depends on P5's gates and on NotchPay's written confirmation of the affiliate flow.

## Goal

Let a verified business (level 3) offer its stock to other shops, and let those shops resell it under their own name without holding stock. This is the affiliate model of decision D3: the supplier stays the seller of record, ships and collects; the reseller brings the buyer and earns a commission that BuyNSellem pays from its own revenue once the sale can no longer be reversed.

Worked example used throughout, identical to the mockups: supplier "Mboppi Accessoires" (level 3, 72 resellers), reseller "Akwa Tech Store" (level 2). Supplier price 4 000, minimum retail price 6 500, suggested retail price 7 500. Akwa Tech Store sells at 7 000: margin 3 000, platform commission 8% of the sale price = 560, reseller gain 2 440 XAF per delivered unit.

## Scope

1. Resale settings on supplier products and variants, and resale terms with versioned acceptance.
2. `resale-links` between a supplier and a reseller, with optional supplier approval.
3. The "Resell" action: a listing in the reseller's shop pointing to the supplier's product, at the reseller's price.
4. Live availability from the supplier's variants, and search deduplication when many shops resell one product.
5. Supplier price changes: notice, re-validation, automatic holds, notifications.
6. `purchase-orders` routed to the supplier, with packing slip, tracking and handover, driving the P4 order.
7. Stock reservation on the supplier's variants.
8. COD money flow (supplier invoice, reseller commission ledger, commission payouts) and the prepaid flow behind its gate.
9. Liability split on refusals, returns and defects.
10. Supplier and reseller dashboards on web and mobile.
11. Anti-collusion rules, commission holds and payout caps, with signals handed to P9.
12. Moderation actions, notifications, error codes, feature flag.

## Out of scope

- International supplier connectors (AliExpress, CJ): excluded by D3.
- Carts mixing fulfilment shops. An order has exactly one fulfilling shop (P4), so a resale order and its purchase order always concern one supplier. P4 creates one order per checkout; P8 keeps that and requires every cart line to share one fulfilment shop. Splitting a checkout into several orders of one checkout group, one per fulfilling shop, arrives with multi-shop checkout (P10).
- Pickup for resale orders: the supplier delivers; pickup at the supplier's premises would bypass the reseller.
- Reseller-edited product content: title, description, photos and attributes always come from the supplier.
- Bulk import of resale prices (same "Bientôt" entry point as P1 bulk import).
- The risk flag queue and scoring (P9). P8 emits signals and enforces its own holds.
- Tiered or negotiated supplier prices per reseller.

## Current state (verified 2026-09-15)

Code:

- No P1–P7 code exists: `packages/api/src/collections` contains `BlockedUsers`, `BoostPayments`, `Categories`, `Conversations`, `Favorites`, `Listings`, `Media`, `Messages`, `ModerationLog`, `Reports`, `Reviews`, `SavedSearches`, `Tags`, `Users`.
- `collections/Listings.ts`: a single `price` number, `location` text (required), `seller` set from `req.user` on create, `status` `draft | pending | published | rejected | sold | expired | deleted`, `views`. Non-staff status changes are limited to `draft`, `pending`, `sold`; moderation writes carry `req.context.moderationAction`. `afterChange` publishes `listing.created` / `listing.updated` on Redis.
- `search-indexer/src/handlers/listingCreated.ts` fetches `/listings/{id}?depth=2`, indexes only `published` listings, and `transformListing` builds the document with no shop, product or grouping fields. `meilisearch.ts` sets filterable `status, categoryId, condition, price, location, boostedUntil, sellerId, tags, _geo` plus category attributes, sortable `price, createdAt, views, boostedUntil, _geo`, and no `distinctAttribute`.
- `api/public/search/route.ts`: default sort `createdAt:desc`; every published listing is a separate hit.
- `docker-compose.yml` runs `getmeili/meilisearch:latest` (unpinned) and `redis:7-alpine`.
- `services/moderation.ts` writes through `overrideAccess` and `MODERATION_CONTEXT`, then `writeLog`; `access/roles.ts` `canActOn` requires a strictly higher rank.
- `chat-service/src/messageHandler.ts` rate-limits with `INCR` then `EXPIRE` on the first hit.
- Jobs are Payload tasks with `schedule` and `queue` (`jobs/expireListings.ts`).
- `lib/errors.ts` holds the shared codes and English fallbacks.
- Mobile has no print dependency (`expo-print` absent).

Specs this design builds on (written, not implemented):

- P2: `lib/shopCapabilities.ts` returns `effectiveLevel`, `supplier` (level 3) and other flags, and "P8 adds its own values". `services/shops.ts` exposes `onShopLevelChanged(listener)`. Approved level-2 requests carry `kyc.documentNumberHash`. `shops.legal` holds `legalName`, `rccmNumber`, `niu`.
- P3: `requireShopPermission(req, shopId, permission)` with `resale.manage` (owner, manager), `orders.process` (all roles), `orders.cancel`, `payments.view`, `costs.view` (owner, manager), `payments.manage` (owner).
- P4:
  - `order-items` is a collection with `sourcing own | resale`, `fulfillingShop` ("P8 sets the supplier") and `purchaseOrder` ("reserved for P8"), and `fulfillmentStatus unfulfilled | shipped | delivered | failed | cancelled | return_requested | returned`.
  - Stock is reserved at placement, released on cancellation or failed delivery, and sold at delivery.
  - Commission is `round(lineSubtotal × commissionRateBps / 10 000)` (default 800). It is accrued as a `commission-lines` `charge` at delivery on `order.shop`, invoiced weekly with VAT 19.25% added on top, and paid through `payment-intents` purpose `commission`. After 3 days overdue, the shop is restricted and its listings are not `orderable`.
  - `services/sequences.ts` provides `nextNumber`; `registerOrderEventHandler` runs post-commit handlers; `checkout.selfPurchase` and `cart.singleShop` exist.
  - `moderation.cancelOrder` exists. Queues: `orders` (every 5 minutes), `hourly`, `nightly`, `commission`.
- P5: `payout-accounts` (name-matched, one active per shop, 72-hour hold on change), `payout-holds`, `holdPayouts`, a ledger mirror, and `payouts` tied to a seller's connected account. Protected amounts: `applicationFee = commission + commissionVat + buyerProtectionFee`, `destinationAmount = orderTotal − commission − commissionVat`. P5 leaves "affiliate resale payment splits and reseller commission payouts" to P8.

## Design

### Principles

- **No copy of stock or content.** A resale listing stores only what the reseller decides: its prices per variant and whether it wants the listing published. Everything else is derived from the supplier's product.
- **Seller of record is the supplier** (D3, Law 2011/012 art. 20). Storefront, packing slip and conversation are the reseller's; pre-contract information, order confirmation and receipt name the supplier as seller of record with its `shops.legal` data, and the reseller as "Revendeur".
- **BuyNSellem never holds third-party funds.** The courier collects for the supplier; the supplier pays BuyNSellem an invoice for a platform service; BuyNSellem pays the reseller commission from its own revenue.
- **Holds, not deletions.** Anything that makes a resale listing unsellable adds a hold reason; removing the last hold restores it automatically.
- **P4 stays the single writer of orders.** Purchase orders drive order transitions only through P4's `applyTransition` and action functions.

### Data model

#### `products` (P1) gains the group `resale`

| Field | Type | Rules |
|---|---|---|
| `resale.enabled` | checkbox | default false; requires `shopCapabilities(shop).supplier` and accepted current supplier terms |
| `resale.approvalRequired` | checkbox | default false; when true, a reseller needs an `approved` resale link before Resell |
| `resale.handlingHours` | number, integer | 4–120, default `delivery.handlingHours` or 24; from purchase-order acceptance to shipment |
| `resale.codAccepted` | checkbox | must be true while `resale.prepaidEnabled` is false (`resale.codRequired`) |
| `resale.resellerNotes` | textarea | up to 1 000 characters, shown only to resellers |
| `resale.enabledAt` | date | service-written |
| `resale.resellerCount` | number | cache of published resale listings of the product; service-written |
| `resale.pendingChange` | group | `effectiveAt`, `variants[] { variant, supplierPrice, minRetailPrice, suggestedRetailPrice }`; service-written |

#### `product-variants` (P1) gains the group `resale`

| Field | Type | Rules |
|---|---|---|
| `resale.enabled` | checkbox | default true when the product enables resale |
| `resale.supplierPrice` | number, integer | XAF, ≥ 100; field read: supplier members with `resale.manage`, members of approved reseller shops, members of eligible reseller shops for products without approval, staff |
| `resale.minRetailPrice` | number, integer | reseller gain at this price ≥ 100: `min − supplierPrice − round(min × rateBps / 10 000) ≥ 100` |
| `resale.suggestedRetailPrice` | number, integer | ≥ `minRetailPrice` |

Pricing rules, checked by `services/resale.ts` on every write (`resale.invalidPricing` with the offending variant):

- `rateBps` is the category's `commissionRateBps`, else `AppSettings.orders.defaultCommissionRateBps` (800), rounding half up as in P4.
- The supplier's own `price` on the variant must be ≥ `minRetailPrice` (`resale.supplierUndercut`).
- Example: gain at 6 500 = 6 500 − 4 000 − 520 = 1 980.

`supplierPrice` never enters a search document, a public listing response, or a buyer-facing order projection.

#### `resale-links`

One row per supplier shop and reseller shop; unique compound index `(supplierShop, resellerShop)`.

| Field | Type | Rules |
|---|---|---|
| `supplierShop` | relationship shops, required, indexed | supplier capability at creation |
| `resellerShop` | relationship shops, required, indexed | `resell` capability |
| `status` | select `requested`, `approved`, `suspended`, `revoked` | service-written |
| `requestedBy` | relationship users | |
| `message` | textarea | up to 500 characters, from the reseller |
| `resellerTermsVersion`, `resellerTermsAcceptedAt` | text, date | snapshot of the acceptance in force when the link was created or last re-accepted |
| `decidedBy`, `decidedAt` | relationship users, date | last decision |
| `suspendedBy` | select `supplier`, `moderator`, `system` | |
| `suspendedReason` | select `quality`, `pricing`, `fraud_review`, `terms`, `other` | |
| `note` | textarea | visible to the side that wrote it and staff |
| `revokedAt` | date | |
| `riskHold` | checkbox | set by anti-collusion matching; approval then requires a moderator |
| `stats` | group | `publishedListings`, `deliveredOrders30d`, `cancelledPurchaseOrders30d`, `refusedDeliveries30d`; refreshed nightly |

A shop cannot link to itself or to a shop with the same owner (`resale.ownProduct`).

Access: read by active members of either shop and staff; writes service-only.

Transitions (`services/resale.ts`):

| From | To | Actor | Effect |
|---|---|---|---|
| — | `approved` | system | first Resell on a supplier product without approval, no risk match |
| — | `requested` | reseller (`resale.manage`) | request, or first Resell on a product with approval, or a risk match |
| `requested` | `approved` | supplier (`resale.manage`); moderator when `riskHold` | notify reseller |
| `requested` | `revoked` | supplier | declined |
| `approved` | `suspended` | supplier, moderator, system | hold `link_inactive` on the reseller's listings of this supplier |
| `suspended` | `approved` | the side that suspended, or a moderator | release the hold |
| `approved`, `suspended` | `revoked` | supplier, moderator | listings stay held; the reseller can only delete them |
| `revoked` | `requested` | reseller | 30 days after `revokedAt`, never after a moderator revocation |

Suspension and revocation never touch purchase orders already sent.

#### `listings` (P1) gains the group `resale`

A resale listing has `shop` = reseller shop, `product` = supplier product, and `resale.supplierShop` set.

| Field | Type | Rules |
|---|---|---|
| `resale.supplierShop` | relationship shops, indexed | service-written; marks the listing as resale |
| `resale.link` | relationship resale-links | service-written |
| `resale.prices` | array `{ variant, price }` | one row per resale-enabled variant; `price` ≥ `minRetailPrice` and ≤ 2 × `suggestedRetailPrice` |
| `resale.desiredStatus` | select `published`, `draft` | what the reseller wants |
| `resale.holds` | select hasMany | `price_below_minimum`, `link_inactive`, `product_unavailable`, `supplier_unavailable`, `reseller_ineligible`, `terms_not_accepted`, `moderation` |

Derived and pinned, like every product-backed listing in P1:

- `status` = `published` when `desiredStatus = published`, `holds` is empty and the supplier's own listing for the product is `published`; otherwise `draft`. Rejection or takedown of the supplier's listing adds `moderation` to every resale listing of the product.
- `price` = the lowest `resale.prices[].price`.
- `title`, `description`, `images`, `category`, `attributes`, `condition` come from the supplier product.
- `location` = the supplier shop's city ("Expédié depuis Douala").
- `seller` = the reseller member who clicked Resell (P1 rule).

Unique partial index `(shop, product)` on listings with a product (`resale.alreadyReselling`).

#### `resale-terms`

| Field | Type | Rules |
|---|---|---|
| `role` | select `supplier`, `reseller` | |
| `version` | text | `YYYY-MM-DD`, unique per role |
| `bodyFr`, `bodyEn` | richText | both required (Law 2011/012 art. 6) |
| `summaryFr`, `summaryEn` | textarea | what changed |
| `publishedAt` | date | |
| `requiresReacceptance` | checkbox | |
| `enforceAt` | date | ≥ `publishedAt` + 30 days when `requiresReacceptance` |

Access: public read of published versions; admin writes in the Payload admin.

The first versions state at minimum:

- the supplier is seller of record and bears defects, non-conformity and misleading content;
- the delivery cost of a refused COD order is on the reseller;
- the reseller commission is paid only after the order completes (end of the withdrawal window without an open case) and after the supplier's invoice line is paid;
- the supplier must not solicit the reseller's buyers;
- BuyNSellem may hold commissions under fraud review.

#### `resale-terms-acceptances`

Append-only evidence (Law 2010/021 art. 26); written by the service, read by staff and the shop's members with `resale.manage`.

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | |
| `role` | select `supplier`, `reseller` | |
| `terms` | relationship resale-terms, required | |
| `version` | text | snapshot |
| `acceptedBy` | relationship users, required | member with `resale.manage` |
| `acceptedAt` | date | |
| `locale` | select `fr`, `en` | |
| `client` | select `web`, `ios`, `android` | |

#### `order-items` (P4) additions

| Field | Type | Rules |
|---|---|---|
| `fulfillingShop` | (P4) | the supplier shop for `sourcing: resale` |
| `purchaseOrder` | (P4) | set when the purchase order is created |
| `resaleLink` | relationship resale-links | set at placement |
| `supplierUnitPrice` | number, integer | snapshot at placement; field read staff only, exposed to shops through the purchase order |

`commissionRateBps` and `commissionAmount` are computed exactly as P4 on `lineSubtotal` at the reseller's price.

#### `purchase-orders`

One purchase order per resale order: every item of a resale order has the same `fulfillingShop`.

| Field | Type | Rules |
|---|---|---|
| `number` | text, unique | `nextNumber("PO", placedAt, { width: 4 })` (P4 monthly series): `PO-2609-0404` |
| `order` | relationship orders, required, unique | |
| `supplierShop`, `resellerShop` | relationship shops, required, indexed | |
| `link` | relationship resale-links, required | |
| `status` | select `sent`, `accepted`, `shipped`, `delivered`, `cancelled`, `returned` | service-written |
| `paymentMethod` | select `cod`, `mobile_money` | copy of the order |
| `items` | array | `{ orderItem, variant, title, variantLabel, sku, quantity, supplierUnitPrice, resellerUnitPrice }` |
| `supplierAmount` | number, integer | Σ `supplierUnitPrice × quantity`: "Votre part" |
| `deliveryFee` | number, integer | the order's `amounts.deliveryFee` |
| `collectAmount` | number, integer | COD: Σ `resellerUnitPrice × quantity` + `deliveryFee`, which equals the order total: "À encaisser". Protected: 0 |
| `platformCommission` | number, integer | Σ order-item `commissionAmount` |
| `resellerCommission` | number, integer | Σ `(resellerUnitPrice − supplierUnitPrice) × quantity` − `platformCommission` |
| `branding` | group | reseller shop name, handle, logo, public contact phone; printed on the slip |
| `acceptBy` | date | `sentAt` + `resale.poAcceptHours` (24) |
| `shipBy` | date | `acceptedAt` + the longest `handlingHours` of the items |
| `tracking` | group | `carrier` (`own_courier`, `yango`, `other`), `trackingNumber`, `trackingUrl`, `shipment` (P7) |
| `cancellation` | group | `by` (`supplier`, `reseller`, `buyer`, `system`, `staff`), `reason` (P4 reason key), `note`, `at` |
| `return` | group | `reason` (P4 delivery-failure reason or P6 return-case `basis`), `liability` (`supplier`, `reseller`, `buyer`), `failedDeliveryCost`, `receivedAt`, `condition` (`resellable`, `damaged`) |
| `statusHistory` | array | `{ status, actor, source, at }` |

The recipient is not copied. `GET /api/purchase-orders/{id}` projects the order's `delivery` group (name, phone, city, district, landmark, GPS, instructions) through P4's masking rule: in full while non-terminal and for 30 days after, masked afterwards.

Access: read by active members of the supplier or reseller shop and staff. Amount fields other than `collectAmount` need `payments.view` in the reading shop. Writes service-only.

Transitions (`services/purchaseOrders.ts`). Every transition writes its order effect through P4 in the same transaction, plus an `order-events` row of the new types `order.purchase_order_sent`, `order.purchase_order_accepted`, `order.purchase_order_cancelled` (visibility `shop`).

| From | To | Actor | Guard | Order effect (P4) |
|---|---|---|---|---|
| — | `sent` | `order.accepted` handler | unique `order` makes it idempotent | none; `purchase-order-received` to supplier |
| `sent` | `accepted` | supplier, `orders.process` | `now < acceptBy` | none |
| `sent` | `cancelled` | supplier (`seller_out_of_stock`, `seller_cannot_deliver`, `seller_other`), system at `acceptBy` (`seller_timeout`), reseller (`orders.cancel`), buyer cancellation, staff | | `accepted → cancelled`; stock released by P4 |
| `accepted` | `shipped` | supplier, `orders.process` | `tracking.carrier` set; `trackingNumber` unless `own_courier` | `accepted → shipped` with `actorType: seller`, actor the supplier member; P4 sends the handover code |
| `accepted` | `cancelled` | supplier (`orders.cancel`), reseller (`orders.cancel`), buyer, staff | | `accepted → cancelled` |
| `shipped` | `delivered` | P4 `delivered` by handover code entered by the supplier, buyer confirm-receipt, or supplier declaration | | P4 sells stock on the supplier's variant and accrues commission (see Money) |
| `shipped` | `returned` | P4 `delivery_failed` (supplier marks it, or P4's stale job) | | release by P4 |
| `delivered` | `returned` | P6 closes a return with every item returned | | P6 as in P4's hand-off |

P4's `accepted → cancelled` row lists `system` with reason `seller_timeout` for resale orders only, used when a purchase order expires.

`cancelled` and `returned` are terminal. A buyer cancellation (`order.cancelled`) cancels the purchase order through a registered handler.

Seller actions on a resale order in P4 routes (`ship`, `handover`, `declare-delivered`, `delivery-attempt-failed`, `mark-delivery-failed`) called by a reseller member return 409 `resale.fulfilledBySupplier`. The reseller keeps `confirm-by-call`, `accept`, `decline` and `seller-cancel`.

#### `reseller-commissions`

One row per purchase order: BuyNSellem's own payable to the reseller, never a balance of third-party funds.

| Field | Type | Rules |
|---|---|---|
| `resellerShop`, `supplierShop` | relationship shops, required, indexed | |
| `purchaseOrder` | relationship purchase-orders, required, unique | |
| `order` | relationship orders, required | |
| `saleAmount`, `supplierAmount`, `platformCommission` | number, integer | snapshots, delivery excluded |
| `amount` | number, integer | reseller commission: 2 440 in the example |
| `paymentMethod` | select `cod`, `mobile_money` | |
| `status` | select `accrued`, `payable`, `held`, `paid`, `cancelled`, `clawed_back` | service-written |
| `holdReasons` | select hasMany | `invoice_unpaid`, `dispute_open`, `collusion_review`, `moderation` |
| `marginLine` | relationship commission-lines | COD: the `resale_margin` line |
| `payout` | relationship reseller-payouts | |
| `paidAt` | date | |
| `cancelReason` | select `returned`, `refunded`, `fraud`, `moderation` | |

Transitions:

- `accrued → payable`: order `completed` (P4: withdrawal window elapsed with `completionHold = none`), and the `resale_margin` line's invoice is `paid` or `waived` (COD) or the charge intent succeeded (protected), with no hold.
- `accrued | payable ↔ held`: a hold reason appears or its last reason clears.
- `accrued | payable | held → cancelled`: the order ends `returned` or refunded, or moderation.
- `payable → paid`: payout complete.
- `paid → clawed_back`: a P6 decision after payout, recovered as a reseller charge.

Access: read by members of the reseller shop with `payments.view` and staff; writes service-only.

`services/purchaseOrders.ts#adjustResellerCommission(req, purchaseOrder, delta, { source })`, with `delta < 0` and `source` `dispute | cod_refusal`, is the entry point P6 calls. It reduces the purchase order's commission while it is `accrued`, `payable` or `held` (cancelling it at zero); any remainder, or any amount on an already `paid` commission, becomes a `reseller-charges` row (`clawback`, or `cod_refusal_delivery_cost` for `cod_refusal`) in favour of the supplier. It is idempotent per `(purchaseOrder, source, sourceId)`.

#### `reseller-charges`

| Field | Type | Rules |
|---|---|---|
| `resellerShop` | relationship shops, required, indexed | |
| `supplierShop` | relationship shops | compensated party |
| `purchaseOrder` | relationship purchase-orders | |
| `type` | select `cod_refusal_delivery_cost`, `clawback` | |
| `amount` | number, integer, > 0 | |
| `status` | select `open`, `offset`, `overdue`, `paid`, `waived` | |
| `offsetBy` | relationship reseller-payouts | |
| `paymentIntents` | relationship payment-intents, hasMany | purpose `reseller_charge`, `targetType: reseller-charge` |
| `waivedBy`, `waivedNote` | relationship users, text | staff only |

A charge is offset against the reseller's next commission payout. Unrecovered after 60 days it becomes `overdue`: the reseller shop loses the `resell` capability (hold `reseller_ineligible`) until it pays through `POST /api/reseller-charges/{id}/pay`, which creates a `payment-intents` row with purpose `reseller_charge` (new purpose, settled like P4's `commission`).

#### `reseller-payouts`

P5 `payouts` represent seller funds leaving a connected account; reseller commissions are BuyNSellem's own money, so they have their own record.

| Field | Type | Rules |
|---|---|---|
| `reference` | text, unique | `nextNumber("RP", now)`: `RP-2609-000031` |
| `resellerShop` | relationship shops, required, indexed | |
| `payoutAccount` | relationship payout-accounts (P5), required | the active account at submission |
| `commissions` | relationship reseller-commissions, hasMany | |
| `charges` | relationship reseller-charges, hasMany | offset in this payout |
| `grossAmount`, `offsetAmount`, `amount`, `fee` | number, integer | `amount = grossAmount − offsetAmount`; `fee` is the transfer fee borne by BuyNSellem |
| `status` | select `scheduled`, `awaiting_approval`, `pending`, `sent`, `processing`, `complete`, `failed`, `reversed`, `cancelled` | P5's payout transition table plus `scheduled → awaiting_approval → pending` |
| `approvedBy`, `approvedAt` | relationship users, date | admin, for payouts above 500 000 XAF |
| `providerTransferId` | text, unique when set | |
| `statusHistory` | array | |
| `failureReason` | text | |

Access: read by reseller members with `payments.view` and staff; writes service-only.

### Capabilities and eligibility

`lib/shopCapabilities.ts` (P2) gains `resell: effectiveLevel >= 2`. Level 2 is required because commissions are paid to a name-matched payout account and collusion checks match verified identities.

- **Supplier:** `supplier` capability, current supplier terms accepted.
- **Reseller:** `resell` capability, current reseller terms accepted, no `overdue` reseller charge.

P8 registers an `onShopLevelChanged` listener (P2):

- A supplier dropping below level 3 adds `supplier_unavailable` to every resale listing of its products.
- A reseller dropping below level 2 adds `reseller_ineligible` to its resale listings.
- Regaining the level removes the hold.

Supplier suspension or closure (P1) adds `supplier_unavailable`. Reseller suspension is already covered by P1's cascade.

`orderable` (P4 indexer field) for a resale listing is computed from the supplier shop: orders enabled, supplier active and not `ordersRestrictedAt`, `orderSettings.codEnabled`, launch city, product `delivery.codAllowed` and `resale.codAccepted`, an available resale-enabled variant. The reseller shop must also be active and not restricted.

### Services and routes

`services/resale.ts` owns resale settings, links, resale listings, holds and terms. `services/purchaseOrders.ts` owns purchase orders, commissions, charges and payouts. Each operation runs in one Payload transaction and publishes search events after commit. Permissions go through `requireShopPermission`.

#### Supplier settings

- `PATCH /api/products/{id}/resale` (`resale.manage`). Body: `enabled`, `approvalRequired`, `handlingHours`, `codAccepted`, `resellerNotes`, `variants[] { id, enabled, supplierPrice, minRetailPrice, suggestedRetailPrice }`. Disabling resale adds `product_unavailable` to every resale listing of the product.
- `GET /api/shops/{id}/resale/offered` (`resale.manage`): resale-enabled products with prices, reseller count, units delivered over 30 days, pending price change.

#### Terms

- `GET /api/public/resale-terms/current?role=supplier|reseller`.
- `POST /api/shops/{id}/resale-terms/accept` (`resale.manage`). Body: `role`, `version`. Writes an acceptance and removes `terms_not_accepted` holds of that shop.
- Job `enforceResaleTerms` (`nightly`): at `enforceAt`, adds `terms_not_accepted` to resale listings of reseller shops without acceptance and to resale listings of products of supplier shops without acceptance.

#### Reseller catalogue and links

- `GET /api/resale/catalogue?shop=&q=&category=&supplier=` (`resale.manage` in a shop with `resell`). Returns resale-enabled products of active supplier shops with supplier name and level, `suggestedRetailPrice`, `minRetailPrice`, the link status, and `supplierPrice` only when approval is not required or the link is `approved`.
- `POST /api/shops/{id}/resale-links` (`resale.manage`). Body: `supplierShop`, `message`, `acceptTermsVersion`.
- `POST /api/resale-links/{id}/decision` (`resale.manage` in the supplier shop). Body: `action` (`approve`, `decline`, `suspend`, `reinstate`, `revoke`), `reason`, `note`.
- `GET /api/shops/{id}/resale-links?side=supplier|reseller&status=`.

#### Resell

`POST /api/shops/{id}/resale-listings` (`resale.manage`). Body: `product`, `prices[] { variant, price }`, `publish` (default true), `acceptTermsVersion` when needed.

1. **Feature and eligibility:** `resale.enabled`; shop has `resell`; terms accepted, else `resale.termsNotAccepted`.
2. **Product:** `resale.enabled` and `status = active` (`resale.notEnabled`); not the caller's shop nor a shop with the same owner (`resale.ownProduct`); supplier active with `supplier`.
3. **Link:** find or create per the table. `requested` → 409 `resale.linkRequired`; `suspended` or `revoked` → 409 `resale.linkInactive`.
4. **Prices:** one per resale-enabled variant, within bounds (`resale.priceBelowMinimum`, `resale.priceAboveMaximum`).
5. **Write:** create the listing with derived fields, increment `resellerCount`, publish `listing.created` and `product.listingsChanged`.
6. **After commit:** collusion checks on the link (see Anti-collusion).

`GET /api/resale/pricing-preview?variant=&price=` returns `margin`, `platformCommission` and `gain` for the live calculator: "Marge 3 000 · Commission 8% 560 · Gain 2 440 FCFA".

Other operations:

- `PATCH /api/resale-listings/{listingId}` (`resale.manage`): `prices`, `desiredStatus`; repricing removes `price_below_minimum` once every price is valid.
- `DELETE /api/resale-listings/{listingId}`: sets `deleted`, decrements `resellerCount`; open orders are unaffected.
- REST writes to `resale.*` and derived fields are ignored in `beforeChange` unless `req.context.resaleService === true`.

#### Availability

No availability is stored on a resale listing.

- Listing detail, cart and checkout read the supplier's variants: `available = stockOnHand − stockReserved` when `trackInventory`, per P4.
- The search document carries `inStock` and P4's `orderable`. The product service publishes `product.listingsChanged` when a variant crosses between available and unavailable, not on every movement.
- An out-of-stock resale listing stays published, shows "Rupture de stock", and cannot be added to the cart.

#### Price changes by the supplier

`PATCH /api/products/{id}/resale` classifies each variant change:

- **Decrease** of `supplierPrice` or `minRetailPrice`, or any `suggestedRetailPrice` change: applied immediately; resellers get it in the daily `resale-price-digest`.
- **Increase** of `supplierPrice` or `minRetailPrice`: stored in `resale.pendingChange` with `effectiveAt = now + 48 hours`. `resale-price-change-scheduled` goes at once to every reseller shop with a listing of the product, with the new minimum and the gain at their current price. A second increase before `effectiveAt` replaces the values and keeps the earlier `effectiveAt`.

Job `applyResalePriceChanges` (`hourly`):

1. Apply due pending changes in one transaction and clear them.
2. Re-validate `resale.prices` of every resale listing of the product. A price below the new minimum adds `price_below_minimum`. The reseller receives `resale-listing-held` with a one-tap "Mettre au prix minimum".
3. Publish `product.listingsChanged`.

Order items keep their snapshot prices. Carts are revalidated by P4 (`priceChanged`); a held listing cannot be checked out (`cart.itemUnavailable`).

### Orders

#### Cart and checkout (extends P4)

- Cart `items.shop` stays the listing's shop (the storefront). A new line whose fulfilment shop (own: the listing's shop; resale: `resale.supplierShop`) differs from the existing lines returns 409 `cart.singleFulfilment`, with the same "Vider le panier et ajouter" flow as `cart.singleShop`.
- `quoteDelivery` receives `fulfillingShop` = supplier. Delivery is `seller_delivery` by the supplier, same city as the supplier, fee from the supplier's `orderSettings.deliveryFee` or the city default (Douala 2 000). Pickup is not offered.
- `checkout.selfPurchase` extends to resale: the buyer is an active member of the storefront or the supplier shop, or the buyer's verified phone or the delivery phone equals a verified phone of any member of either shop.
- `orders/contract.ts`: for a resale order, the seller identity block names the supplier (name, city, `legal.rccmNumber`, `legal.niu`) as seller, the reseller shop as "Revendeur", and uses the supplier's `salesTermsExtra`. The receipt and SMS show the storefront name with "vendu par {supplier}".
- The order conversation (P4) has the buyer and the reseller shop's members; the supplier is not a participant. The supplier's courier calls the delivery phone shown on the purchase order.
- While `resale.prepaidEnabled` is false, resale orders are COD only (`resale.prepaidUnavailable`).

#### Lifecycle

1. **Placed.** P4 reserves stock on the item's variant, which is the supplier's variant. Order items get `sourcing: resale`, `fulfillingShop`, `resaleLink`, `supplierUnitPrice`.
2. **Confirmed and accepted by the reseller** within P4's deadlines (`confirm-by-call`, `accept`), using `orders.process`.
3. **Purchase order sent** by the `order.accepted` handler, which sets `order-items.purchaseOrder`.
4. **Accepted by the supplier** before `acceptBy`. `purchase-order-reminder` goes 4 hours before. At `acceptBy`, `expirePurchaseOrders` cancels with `seller_timeout`.
5. **Shipped** by the supplier after printing the packing slip. When P7 zones are on, P7 creates the order's shipment at purchase-order acceptance (`createShipmentForPurchaseOrder`), and the purchase order moves to `shipped` and `delivered` with that shipment instead of its own `ship` and `handover` routes. If `shipBy` passes, `purchase-order-late` goes to both shops; after `shipBy` + 72 hours the reseller can cancel with `seller_cannot_deliver`, attributed to the supplier. P4's stale job still applies after shipment.
6. **Delivered** when a supplier member enters the buyer's handover code on the purchase order (`POST /api/purchase-orders/{id}/handover`, which calls P4's `orders/handover.ts` verification with the supplier member as actor), or through P4's buyer confirmation or seller declaration.
7. **Completed** by P4 at the end of the withdrawal window; the commission becomes payable per its rules.

Mapping to `order-items.fulfillmentStatus` is P4's: `sent` and `accepted` leave `unfulfilled`; `shipped` → `shipped`; `delivered` → `delivered`; `cancelled` → `cancelled`; `returned` after a failed delivery → `failed`; `returned` after delivery → `returned`.

A supplier's `return-received` with condition `damaged` writes a `loss` movement on its variant; P6 records returned stock through `stock.recordReturn`.

#### Purchase-order routes

- `GET /api/shops/{id}/purchase-orders?side=supplier|reseller&status=&from=&q=` (`orders.view`), paginated. Supplier columns: number, date, reseller, items, "Votre part" (`payments.view`), "À encaisser", status, `acceptBy` or `shipBy` countdown.
- `GET /api/purchase-orders/{id}`.
- Supplier (`orders.process`):
  - `POST /api/purchase-orders/{id}/accept`;
  - `/ship`, body `carrier`, `trackingNumber`, `trackingUrl`;
  - `/handover`, body `code`;
  - `/declare-delivered`, body `note`, `photo`;
  - `/delivery-failed`, body `reason` (P4 reasons), `note`, `failedDeliveryCost`;
  - `/return-received`, body `condition`.
- `POST /api/purchase-orders/{id}/cancel`, body `reason`, `note`: supplier with `orders.cancel` or, while `sent`, `orders.process`; reseller with `orders.cancel`.
- `GET /api/purchase-orders/{id}/packing-slip?lang=fr|en` returns a printable HTML page with an A6 label and an A5 slip:
  - the reseller shop name, logo and contact phone as sender brand;
  - "Expédié depuis {city}";
  - recipient name, phone, district, landmark and a QR code of the GPS pin;
  - items with SKU and quantity;
  - the amount to collect;
  - the purchase-order number as a Code 128 barcode.

  It never shows `supplierPrice`. Web prints it; mobile renders it through `expo-print` (new dependency) to print or share as PDF.

### Money

#### COD flow

Per delivered purchase order in the example (quantity 1, Douala delivery fee 2 000 XAF):

| Step | XAF |
|---|---|
| Supplier's courier collects from the buyer ("À encaisser") | 9 000 = 7 000 + 2 000 |
| Supplier keeps its part ("Votre part") and the delivery fee | 6 000 = 4 000 + 2 000 |
| Resale fee on the supplier's weekly invoice | 3 000 = 7 000 − 4 000 |
| of which `charge` line: platform commission 8% × 7 000 | 560 |
| of which `resale_margin` line: reseller commission | 2 440 |
| VAT 19.25%, added on top (P4 A5) | 578 |
| Supplier pays BuyNSellem | 3 578 |
| BuyNSellem pays the reseller after completion | 2 440 |

1. The courier collects the full order total for the supplier; the money never transits through BuyNSellem.
2. On `delivered`, P4's `commission.accrue` is extended for `sourcing: resale`, in the same transaction:
   - the `charge` line goes to the supplier shop instead of `order.shop`, with `amount` = Σ `commissionAmount` (560);
   - a second line of the new kind `resale_margin` (amount = `resellerCommission`, 2 440) goes to the supplier shop. The unique index `(order, kind)` covers both.
   - The `reseller-commissions` row is created `accrued`.
3. `issueCommissionInvoices` includes `resale_margin` lines in `commissionTotal`, so VAT applies to the full resale fee, and shows them as "Frais de revente — PO-2609-0404" with the split.
4. The supplier pays by mobile money through P4's commission invoice flow. P4's overdue rules restrict the supplier after 3 days overdue, which makes its resale listings non-`orderable` everywhere.
5. `releaseResellerCommissions` (`nightly`) moves commissions to `payable` per their transition rules.
6. P6 credits: a return or refund writes P4 `credit` lines for both the `charge` and the `resale_margin` amounts on the supplier's next invoice, and cancels the commission when not yet paid.

#### Prepaid flow (gated)

Behind `resale.prepaidEnabled`, which can be turned on only when P5's `protectedPayment.enabled` is on and a `resale.gates` row records NotchPay's written confirmation of the affiliate flow (see Feature flag).

- The destination is the supplier shop's connected account; P5's eligibility, exposure caps and holds apply to the supplier.
- P5's amounts use `commission = platformCommission + resellerCommission` for resale orders. Example: order total 9 000, commission 3 000, commission VAT 578, buyer protection fee 3% = 270. Then `applicationFee` = 3 848, `destinationAmount` = 5 422, `buyerTotal` = 9 270.
- The purchase order shows "À encaisser: 0 · Payé en ligne".
- The commission is `accrued` when the intent succeeds and becomes `payable` at order `completed`.
- A refund cancels the commission when unpaid, or creates a `clawback` charge when already paid.
- P5 ledger: P8 adds `reseller_commission_payable` (liability) and `reseller_payout_in_transit` (liability).
  - At `completed`, `commission_earned` credits the reseller part to `reseller_commission_payable` instead of revenue.
  - Payouts post `reseller_payout_submitted` and `reseller_payout_complete`.
  - COD resale fees stay outside the mirror, like P4 commission invoices.

#### Refused COD and the reseller charge

When the order goes `shipped → delivery_failed` with P4 reason `refused`, `unreachable`, `absent` or `address_not_found`:

1. The supplier declares `failedDeliveryCost` on the purchase order, capped at `deliveryFee`.
2. A `reseller-charges` row `cod_refusal_delivery_cost` is created. The supplier receives a P4 `credit` line on its next invoice with `reason: resale_refusal_compensation`. P8 adds `reason` to `commission-lines`, and the invoice builder excludes such lines from the VAT base.
3. The charge is offset against the reseller's next payout, else follows the `overdue` path.
4. Reasons `timeout` and `other` create no charge: they are the supplier's delivery failure.

P4's phone score records the refusal as usual.

#### Commission payouts

Job `payResellerCommissions`, on the `commission` queue, Monday 05:00 UTC, after P4's invoicing:

1. Per reseller shop with an `active` P5 `payout-accounts` row and no active P5 `payout-holds` on the shop, sum `payable` commissions and subtract `open` charges.
2. Skip below `resale.minPayout` (2 000 XAF); the amounts roll over.
3. New-reseller cap: a reseller shop with fewer than 10 completed resale orders or a first completed resale order less than 30 days old is paid at most `resale.newResellerWeeklyCap` (25 000 XAF) per week. The oldest commissions go first; the rest stays `payable`.
4. Create `reseller-payouts`. Above 500 000 XAF it waits in `awaiting_approval` for an admin.
5. Submit through `createTransfer({ reference, amount, currency, channel, phone, name, idempotencyKey })`, a method P8 adds to the NotchPay adapter. It transfers from BuyNSellem's own balance using P5's `NOTCHPAY_PRIVATE_KEY` (`X-Grant`). The 1% transfer fee is borne by BuyNSellem.
6. `transfer.*` webhooks whose reference starts with `RP-` are dispatched by P5's `processWebhookEvent` to `services/resellerPayouts.ts`. On `complete`, commissions become `paid` and charges `offset`. On `failed`, they return to `payable` and charges to `open`, and the reseller is asked to check its payout account.

A reseller without an active payout account accrues commissions and sees "Ajoutez un compte de paiement". Commission payouts do not depend on NotchPay Sync, but they do require P5's payout accounts and its data-protection gate G6.

### Liability split (D3 terms)

Applied by `services/purchaseOrders.ts` on delivery failure and by P6 decisions on returns.

| Case | Refund and item | Delivery or return cost | Reseller commission | Counts against |
|---|---|---|---|---|
| Defect, not as described, wrong item (P6) | supplier | supplier | cancelled | supplier defect rate |
| Damaged or lost in transit | supplier (its courier; recourse through P7) | supplier | cancelled | supplier |
| Withdrawal within 15 days (Law 2010/021 art. 20) | supplier refunds the item | buyer (P4 A6) | cancelled | nobody |
| Refused, unreachable, absent, address not found at delivery | nothing due | reseller: `failedDeliveryCost` charge | none accrued | reseller refusal rate; buyer phone score |
| Delivery `timeout` or `other` | nothing due | supplier | none | supplier |
| Supplier cancels (out of stock, cannot deliver, timeout) | nothing moved | nobody | none | supplier cancellation rate |
| Reseller or buyer cancels before shipment | nothing moved | nobody | none | reseller or buyer |
| P6 rules for the seller after delivery | nothing | nothing | payable once the case closes | nobody |

Product liability toward the buyer stays with the supplier whatever the contract says (Law 2011/012 art. 20); the table only allocates costs between shops and BuyNSellem.

### Search

**Listing documents** (`transformListing`) gain:

- `productGroupId`: supplier product id for resale listings, product id for own product listings, listing id for classified ads. Filterable, excluded from `displayedAttributes`.
- `isResale`, filterable.
- `inStock`, filterable.
- `isGroupRepresentative`, filterable; always true for classified ads and for products with a single published listing.

P4's `orderable` is computed from the supplier for resale listings.

**One card per product in global search.**

- `GET /api/public/search` without `shop` adds `isGroupRepresentative = true`. With `shop={id}` it shows every listing of that shop.
- `api/public/similar` applies the same filter and excludes the current listing's group.
- `checkSearchAlerts` matches representatives only, so one saved search does not fire 72 times.
- A resale listing page never links to competing resellers or to the supplier's listing: resellers bring their own traffic through shared links, and it must convert on their page.

**Representative selection** (`handlers/productGroup.ts` in the indexer), for one `productGroupId`:

1. Candidates: published listings of the group in active shops with `inStock` and `orderable`, the supplier's own listing included.
2. Tier A: shop effective level ≥ 2 and, when P9 `shop-daily-stats` exist, a 30-day delivered-to-accepted ratio ≥ 0.8 over at least 5 accepted orders. Tier B: the rest.
3. In the best non-empty tier, the lowest `sha256(shopId + UTC date)` wins, so equal shops share exposure day by day and undercutting wins nothing.
4. With no in-stock candidate, the same rule runs over all published listings of the group so the product stays findable.
5. Old and new representatives are updated with one partial `updateDocuments` call.

Recomputed on `product.listingsChanged`, on `listing.created | updated | deleted` of a listing with a product, on `shop.updated` when level, status or restriction changed, and for every group at 00:05 UTC.

**Events:** `publishSearchEvent` accepts `product.listingsChanged` with `productId`; the indexer re-indexes the product's listings in pages of 100, then recomputes the group.

**Index settings:** filterable gains `productGroupId`, `isResale`, `inStock`, `isGroupRepresentative`. The Meilisearch image is pinned to the version running in production in the same change.

### Anti-collusion

Jumia lost about 1% of GMV to JForce agent fraud. In resale, the attack is a supplier, a reseller and a "buyer" controlled by the same people. They generate delivered orders to extract commissions that BuyNSellem pays from its revenue, or refuse orders to shift costs.

Identity keys compared, all hashed:

- the approved level-2 `kyc.documentNumberHash` of every member (P2);
- member verified phones and order delivery phones, as P4's `phoneHash` (HMAC with `ORDER_PHONE_PEPPER`);
- the `accountNumber` of active P5 payout accounts, compared by HMAC.

**Enforced by P8:**

- `checkout.selfPurchase` as extended above.
- A link between shops sharing an owner or a member is refused (`resale.ownProduct`).
- A link whose shops share an identity key is created `requested` with `riskHold = true`; only a moderator can approve it.
- A handover confirmed within 200 m of the supplier's pickup point GPS (P4 `orderSettings.pickupPoint.gps`, or the P7 `shop-locations` dispatch origins once P7 ships), or within 15 minutes of `shipped`, puts the commission on hold `collusion_review`.
- More than 3 completed resale orders from one reseller to one delivery phone hash within 7 days put the following commissions on hold `collusion_review`.

**Signals handed to P9** through P6's `services/riskSignals.ts#recordRiskSignal({ subjectType, subjectId, signal, evidence })`, which writes P6's `risk-signal-outbox` in the causing transaction (P8 adds its signals below to the outbox's `signal` select and `purchase-order`, `resale-link` to its `sourceType`); P9 consumes the outbox:

| Signal | Trigger |
|---|---|
| `resale.self_dealing` | a `checkout.selfPurchase` refusal on a resale order, or an identity key match found after placement |
| `resale.shared_identity` | `riskHold` set on a link |
| `resale.handover_at_supplier` | the distance or delay rule |
| `resale.buyer_concentration` | the delivery phone concentration rule |
| `resale.cancellation_pattern` | reseller cancellations after `sent` above 30% of its last 20 purchase orders, or supplier cancellations above 20% of its last 20 |
| `resale.refusal_pattern` | reseller refusal charges on more than 35% of its last 20 shipped purchase orders |

Until P9 ships, the outbox rows simply wait. P8's holds do not depend on P9.

### Moderation

`ModerationLog`:

- `targetType` gains `resale-link`, `purchase-order`, `reseller-commission`.
- `MODERATION_ACTIONS` gains `resale_link.suspend`, `resale_link.unsuspend`, `purchase_order.cancel`, `reseller_commission.release`.

`services/moderation.ts`:

- `suspendResaleLink(payload, actor, linkId, { reason, note })`: sets `suspended` (`suspendedBy: moderator`), adds `link_inactive` holds, and puts the link's `accrued` and `payable` commissions on hold `moderation`. Listing and commission ids go in the metadata.
- `unsuspendResaleLink(payload, actor, linkId, { note, releaseCommissions })`: restores from the last `resale_link.suspend` entry.
- `cancelPurchaseOrder(payload, actor, poId, { reason, note })`: from `sent` or `accepted`. It calls P4's `cancelOrder` (reason `staff_fraud`, `staff_policy` or `staff_other`) in the same transaction, cancels the purchase order and, for `staff_fraud`, cancels the commission with `fraud`. It writes `purchase_order.cancel` next to P4's `order.cancel`.
- `releaseResellerCommission(payload, actor, commissionId, { note })`: removes `collusion_review` or `moderation`.
- Rank: `canActOn` against the owner of the supplier shop for link actions and of the reseller shop for commission actions. A moderator who is a member of either shop gets `moderation.forbidden`.
- `suspendShop` on a supplier cancels nothing, consistent with P4: `sent` purchase orders expire at `acceptBy`; accepted and shipped ones get P4's system message, and staff decide.

Routes following `lib/moderationRoute.ts`:

- `GET` and `POST /api/moderation/resale-links/{id}` (`action: suspend | unsuspend`).
- `GET` and `POST /api/moderation/purchase-orders/{id}` (`action: cancel`).
- `POST /api/moderation/reseller-commissions/{id}` (`action: release`).

The sheets show both shops and levels, link history, purchase-order timeline, commission status and P9 flags on either shop.

Reports: `targetType` gains `purchase-order`, so either shop can report the other from a purchase order.

### Jobs

| Job | Queue and schedule | Work |
|---|---|---|
| `expirePurchaseOrders` | `orders`, every 5 minutes | cancel `sent` past `acceptBy`; reminders at `acceptBy` − 4 h; `purchase-order-late` past `shipBy` |
| `applyResalePriceChanges` | `hourly` | apply due increases, re-validate, hold, notify |
| `releaseResellerCommissions` | `nightly` | commission transitions from order completion, invoice status and disputes |
| `payResellerCommissions` | `commission`, `0 5 * * 1` | weekly payouts with offsets and caps |
| `markOverdueResellerCharges` | `nightly` | `open` charges older than 60 days → `overdue`, capability hold |
| `refreshResaleLinkStats` | `nightly` | link stats; `resellerCount` repair |
| `enforceResaleTerms` | `nightly` | terms holds at `enforceAt` |

All are idempotent and process pages of 200.

### Notifications

New Novu workflows in `syncNotificationWorkflows.ts`. Recipients are members of the named shop with `resale.manage`, except for purchase orders, which go to `orders.process`:

| Workflow | Recipient | Trigger |
|---|---|---|
| `resale-link-requested` | supplier | a reseller asks for access |
| `resale-link-decided` | reseller | approved or declined |
| `resale-link-suspended` | reseller | suspended or revoked, with reason |
| `resale-price-change-scheduled` | reseller | supplier increase, 48 hours ahead |
| `resale-price-digest` | reseller | daily digest of decreases and suggested price changes |
| `resale-listing-held` | reseller | a hold unpublished a listing, with the fix |
| `purchase-order-received` | supplier | purchase order sent |
| `purchase-order-reminder` | supplier | 4 hours before `acceptBy` |
| `purchase-order-cancelled` | the other shop | cancellation by either side, system or staff |
| `purchase-order-shipped` | reseller | tracking recorded (the buyer gets P4's `order-shipped`) |
| `purchase-order-late` | reseller and supplier | `shipBy` passed |
| `reseller-commission-paid` | reseller (`payments.view`) | payout complete |
| `reseller-charge-created` | reseller (`payments.view`) | refusal delivery cost |
| `resale-terms-updated` | suppliers and resellers | new version requiring re-acceptance, and 7 days before `enforceAt` |

### Feature flag

`AppSettings` gains the group `resale`:

| Setting | Default |
|---|---|
| `enabled` | `false` |
| `prepaidEnabled` | `false`; refused unless P5's `protectedPayment.enabled` is on and `gates` has a `notchpay_affiliate` row |
| `gates` | array `{ gate: notchpay_affiliate, clearedAt, clearedBy, evidence (P2 private storage), note }` |
| `poAcceptHours` | `24` |
| `newResellerWeeklyCap` | `25000` |
| `minPayout` | `2000` |
| `payoutApprovalAbove` | `500000` |

`GET /api/public/config` exposes `resaleEnabled` and `resalePrepaidEnabled`.

When `enabled` is false:

- enabling resale, links and Resell return 403 `resale.disabled`;
- resale listings are not `orderable`, and search adds `isResale = false`;
- open purchase orders, commissions, charges and payouts continue to completion;
- clients hide every resale entry point except existing purchase orders, commissions and charges.

### Error codes

Added to `lib/errors.ts`, with fallbacks and translations in both clients:

- `resale.disabled`
- `resale.supplierNotEligible`, `resale.resellerNotEligible`
- `resale.termsNotAccepted`
- `resale.notEnabled`
- `resale.invalidPricing`, `resale.supplierUndercut`, `resale.codRequired`
- `resale.priceBelowMinimum`, `resale.priceAboveMaximum`
- `resale.ownProduct`, `resale.alreadyReselling`
- `resale.linkRequired`, `resale.linkInactive`
- `resale.prepaidUnavailable`
- `resale.fulfilledBySupplier`
- `resale.chargeOverdue`
- `cart.singleFulfilment`
- `purchaseOrder.notFound`, `purchaseOrder.invalidTransition`, `purchaseOrder.acceptExpired`, `purchaseOrder.trackingRequired`

Reused: `checkout.selfPurchase`, `cart.itemUnavailable`, `order.handoverCodeInvalid`, `order.handoverLocked`, `shop.notMember`, `generic.rateLimited`, `moderation.*`.

### Web

The P1 sidebar entry "Revente" opens `/seller/resale`, with tabs by capability and permission.

**Supplier:**

- `/seller/resale/resellers`: the resellers table (72 for Mboppi Accessoires). Columns: shop, level, link status, products resold, delivered orders and cancelled purchase orders over 30 days, refusal rate. Actions: suspend, reinstate, revoke. A "Demandes" filter with count and approve or decline.
- `/seller/resale/offered`: supplier price, minimum, suggested, reseller count, units delivered over 30 days, pending increase banner, link to the product editor.
- `/seller/resale/purchase-orders`: the purchase-order table with "Votre part" and "À encaisser", status chips, countdowns, filters by status and reseller.
- `/seller/resale/purchase-orders/[id]`: items, recipient with Maps link, timeline, and actions (accept, print packing slip, ship with tracking, enter handover code, declare delivered, delivery failed with cost, return received, cancel).
- Product editor (`/seller/catalogue/[id]`) gains a "Revente" card:
  - enable, approval, handling hours, COD, reseller notes;
  - variants table: supplier price, minimum, suggested, own price, gain at minimum, with inline validation.
- `/seller/billing` (P4) shows resale fee lines with purchase-order numbers.
- Terms acceptance modal on first enable and on re-acceptance.

**Reseller:**

- `/seller/resale/catalogue`: search and filters, product cards with supplier, suggested price and gain at the suggested price, "Revendre" or "Demander l'accès".
- Resell drawer: per-variant price with the live calculator, minimum and suggested hints, publish toggle, terms checkbox when needed.
- `/seller/resale/products`, "Mes produits revendus": listing, supplier, my price, gain per unit, availability, holds with their fix, units delivered over 30 days, share link.
- `/seller/resale/suppliers`, "Mes fournisseurs": link status, products resold, terms version, request history.
- `/seller/resale/commissions` (`payments.view`):
  - totals (accrued, payable, held, paid this month), next payout date and applicable cap;
  - commissions and charges with purchase-order references;
  - "Payer" on an overdue charge.
- `/seller/orders/[id]` (P4) on a resale order shows the supplier, the purchase-order status and tracking, and hides fulfilment actions.

**Buyer-facing:** listing detail for a resale listing shows the reseller shop card, "Expédié depuis {city}", "Vendu par {supplier}" in the legal information block, live availability, and P4's buy buttons when `orderable`. Checkout review and receipt name the supplier as seller of record and the reseller as "Revendeur".

### Mobile

New routes under P1's seller area, registered in `app/_layout.tsx` with `headerShown: false`:

- `app/seller/resale/index.tsx`: hub with tiles by capability and counters (pending requests, purchase orders to accept, payable commissions).
- `app/seller/resale/catalogue.tsx` and `app/seller/resale/resell/[productId].tsx`: catalogue and the Resell sheet with the calculator.
- `app/seller/resale/products.tsx`, `app/seller/resale/suppliers.tsx`, `app/seller/resale/resellers.tsx` (with requests).
- `app/seller/resale/purchase-orders/index.tsx` and `[id].tsx`: accept, packing slip through `expo-print`, ship with tracking, and delivery failure with cost. The handover code entry reuses P4's keypad component from `seller/orders/[id]/handover.tsx`.
- `app/seller/resale/commissions.tsx`.
- `app/seller/product/[id].tsx` gains the resale section.
- `app/moderation/resale-link/[id].tsx`, `app/moderation/purchase-order/[id].tsx`, built on `ModerationScreen` and `DecisionSheet`.

Existing screens: listing detail and checkout review get the buyer-facing changes; `app/seller/orders/[id].tsx` shows the purchase-order block on resale orders.

### Internationalisation

Every new string in English and French on web (next-intl) and mobile (i18next) in the same change. Resale terms, packing slips and the resale additions to order documents are bilingual (Law 2011/012 art. 6). The slip renders in the supplier's chosen language with legal lines in both. Product content stays in the supplier's language.

## Testing

**Unit tests:**

- Pricing: gain at minimum ≥ 100, suggested ≥ minimum, supplier undercut, half-up rounding on odd prices, the example (7 000 → 3 000, 560, 2 440; VAT 578; prepaid 3 848 and 5 422).
- Resale-link transitions: every allowed and forbidden one, `riskHold` requiring a moderator, the 30-day re-request rule.
- Resell refusals: own product, same owner, approval pending, suspended link, duplicate, price bounds, terms.
- Holds: each reason independently; status derivation with the supplier listing rejected; level-change listener; REST writes to derived fields ignored.
- Price changes: decrease immediate; increase at 48 hours; second increase keeps `effectiveAt`; hold on apply and release on reprice.
- Purchase-order transitions and their P4 effects, including the resale-only `accepted → cancelled` by system, `resale.fulfilledBySupplier`, and idempotent creation from a replayed `order.accepted`.
- Stock: reservation on the supplier's variant; two resellers' buyers racing for the last unit (one order, one `cart.outOfStock`); release on each cancellation path; sale at delivery; `loss` on damaged return.
- Money:
  - `charge` and `resale_margin` lines on the supplier shop, no duplicate on a replayed delivery;
  - VAT base including the margin and excluding refusal compensation;
  - commission `payable` only after completion and invoice paid;
  - refusal charge offset, then overdue;
  - weekly cap, rollover, minimum and approval threshold;
  - clawback after payout.
- Liability table: each row gives the expected commission status, charge and credit.
- Anti-collusion: self-purchase by membership and by phone hash; identity key match on link creation; handover distance and delay; delivery phone concentration; signal shapes.
- Moderation with the in-memory Payload fake: link suspend and unsuspend with commission holds; purchase-order cancel writing both log entries; commission release; rank and membership rules.
- Indexer: resale `transformListing`, `orderable` from the supplier, representative tiers, daily rotation, out-of-stock fallback, `product.listingsChanged` paging.

**Route tests:**

- Supplier settings without `resale.manage` (403); P3 staff member (403).
- Catalogue hides `supplierPrice` without approval.
- Resell happy path and each refusal.
- Purchase-order actions from the wrong shop (403), and `cart.singleFulfilment`.
- Packing slip without supplier price.
- Search returns one hit for a group of 72 fixture listings without `shop` and all of them with it.
- Prepaid refused while gated.
- `RP-` transfer webhooks routed to reseller payouts.

**Clients:** typecheck and biome on web and mobile. Manual staging pass with two shops:

- enable resale on a product, request and approve access;
- Resell at 7 000 and see gain 2 440;
- place a COD order as a third account; confirm and accept as reseller;
- accept, print, ship and hand over as supplier;
- check the invoice lines;
- shift the clock past completion, pay the invoice, and check the commission becoming payable and paid in the sandbox;
- refuse a second order and check the charge and the supplier credit;
- raise the supplier price and check the hold after 48 hours.

## Verification targets

- `bun run generate:types` in `packages/api`
- `bun run check-types` in `packages/api`, `packages/web`, `packages/mobile`, `packages/search-indexer`
- `bunx vitest run --config ./vitest.config.mts` in `packages/api`
- `bun test` in `packages/mobile` and `packages/search-indexer`
- `bunx biome check` on touched files
- `bun run sync:notification-workflows -- --dry-run` in `packages/api` lists the new workflows
- Staging with `resale.enabled = true` and P4's clock-shifted jobs: the manual pass above. Production with the flag off, then on for Douala suppliers first. `prepaidEnabled` stays off until the `notchpay_affiliate` gate is recorded.

## Cross-phase interfaces assumed

- **P2:** `shopCapabilities` accepts P8's `resell` flag; `onShopLevelChanged`; `kyc.documentNumberHash` on the approved level-2 request of each member who went through KYC (owners only in P2, so non-owner members match by phone only).
- **P3:** permissions `resale.manage`, `orders.view`, `orders.process`, `orders.cancel`, `payments.view` as in the matrix.
- **P4:**
  - `order-items.fulfillingShop` and `purchaseOrder`;
  - `nextNumber(prefix, date, { width })`;
  - `registerOrderEventHandler` for `order.accepted`, `order.cancelled`, `order.delivered`, `order.delivery_failed`, `order.completed`;
  - `commission.accrue` extensible per sourcing; `commission-lines` accepting kind `resale_margin` and field `reason`; the invoice builder's VAT base rule;
  - handover verification callable with a supplier actor; `quoteDelivery` using `fulfillingShop`; `orders/contract.ts` seller block override; the added status row.
- **P5:** `payout-accounts` and `payout-holds` readable for reseller shops; `processWebhookEvent` dispatch on reference prefix; `NOTCHPAY_PRIVATE_KEY`; the ledger accepting P8 categories; `commission` in protected amounts overridable per order.
- **P6:** dispute-open check per order (`orders.activeDispute`); return decisions with basis and `liableParty`; `credit` lines for both resale lines; calls to `adjustResellerCommission` (defined above) for losses and clawbacks after payout; `recordRiskSignal` and its outbox.
- **P7:** shipments linkable from a purchase order; courier events that deliver through P4.
- **P9:** consumption of the P6 outbox into `risk-flags`; `shop-daily-stats` as optional input to representative tiers.
