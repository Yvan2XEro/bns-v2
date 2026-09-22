# P7 Integrated Delivery Design

Date: 2026-09-15
Parent: `2026-09-15-business-layer-design.md`
Depends on: `2026-09-15-p4-cod-orders-design.md`, `2026-09-15-p1-shops-design.md`, `2026-09-15-p0-foundations-design.md`, P2 verification (private file storage), P3 team (shop roles)

## Goal

Turn P4's "seller delivers, buyer gives a code" into delivery that is tracked on the platform. Shops define where they deliver and at what price. Buyers see an honest fee and ETA before ordering. Each parcel becomes a shipment with a status, a rider, failed attempts and proof of handover. Couriers — the shop itself, a moto-taxi rider with a link, a partner courier company, later Yango and Campost — plug in through one `CourierProvider` interface. BuyNSellem still owns no logistics and moves no money (umbrella positioning, Regulation 04/18).

## Scope

1. `delivery-zones` per shop: cities and districts, fee, free-above threshold, minimum order, ETA, method, COD.
2. `shop-locations`: pickup points and dispatch origins.
3. A zone-based `quoteDelivery` that replaces P4's flat fees behind the same signature, with a data migration.
4. `shipments` and `shipment-events`: carrier, rider, tracking, status machine, attempts, proof (OTP, photo, GPS), COD collection record.
5. `couriers` and `courier-members`: a staff-managed registry of courier companies with dispatchers and riders.
6. `CourierProvider` interface mirroring `PaymentProvider`, a `manual` adapter and a `yango` placeholder adapter.
7. Rider handover flow using the P4 handover code: shop member, partner rider in the app, or external rider through a one-time link.
8. Failed delivery attempts, buyer rescheduling, re-delivery, return to the shop, pickup holds.
9. Cross-city delivery modelled and gated off: intercity zones and carriers, Campost as a later adapter.
10. Interplay with P8: an order has one fulfilling shop (P4), so one live shipment per order; suppliers ship in the reseller's name.
11. Notifications, error codes, web and mobile screens (zones, pickup points, shipment tracking for buyer and seller, rider page), feature flags.

## Out of scope

- Live rider GPS tracking and route optimisation. P7 records GPS at pickup, attempts and handover only.
- Courier billing. Couriers invoice shops directly; BuyNSellem neither collects nor pays delivery fees.
- COD cash remittance through the platform. P7 records who collected and whether remittance was declared, nothing more.
- A working Yango integration. It needs negotiated API access, and the adapter stays disabled until then.
- The Campost adapter implementation and opening intercity delivery (D4 keeps same-city at launch).
- Lost or damaged parcel compensation (P6 disputes).
- Shipping labels, barcodes and scanning.
- Courier self-signup and invites. Staff create couriers and members in P7.
- Polygon zones drawn on a map. Zones are lists of district keys.

## Current state (verified 2026-09-15)

Code in the repository:

- No delivery, shipment or courier collection exists. `payload.config.ts` registers 14 collections and the `AppSettings` global.
- `lib/payments/types.ts` defines `PaymentProvider` with `readonly id`, `createPayment(params)` and `verifyWebhook(rawBody, headers)`. `lib/payments/index.ts` builds providers from environment variables in `getProvider(name)` and throws a configuration error when keys are missing. P0 adds `verifyPayment`, the normalised webhook shape, `webhook-events` and the verify → store → 200 → job route pattern.
- `collections/Media.ts` has `read: () => true`. Proof photos cannot go there; P2 introduces the private bucket.
- `listings.coordinates` (`lat`, `lng`) exists; `users.homeLocation` has no coordinates.
- Mobile depends on `expo-location`, `expo-image-picker` and `expo-web-browser`, and has no map library. Web has no map library.
- `services/smsProvider.ts` `sendSms` is the only SMS path.

Designed in P4 (not yet implemented), which P7 builds on:

- `lib/launchCities.ts` with district keys (`douala.akwa`, `yaounde.bastos`, `{city}.other`) and flat city fees.
- `services/deliveryQuote.ts` `quoteDelivery(input): Promise<DeliveryOption[]>`, used by `POST /api/checkout/quote` and covered by `quoteHash`.
- `shops.orderSettings`: `sellerDeliveryEnabled`, `deliveryFee`, `deliveryEtaText`, `pickupEnabled`, `pickupPoint`.
- `orders.delivery` (method `seller_delivery | pickup`, address, `gps`), `orders.deliveryFailure` (`reason`, `attempts`), deadlines `staleAt`, contest window `handover.contestBy`.
- `order-items.fulfillingShop`, `sourcing`, `purchaseOrder`.
- `orders/handover.ts`: 4-digit code per order, 5 attempts, 3 regenerations.
- Seller routes `ship`, `handover`, `delivery-attempt-failed`, `mark-delivery-failed`, `declare-delivered`.
- `registerOrderEventHandler`, the `sequences` service and the `failStaleOrders` job.

## Design

### Assumptions where the umbrella leaves a choice

- **B1 — Fees:** the buyer pays the fee of the shop's zone. What the courier charges the shop is a private cost between them, optionally recorded as `courierCost`. The commission base stays the item subtotal (P4 A5).
- **B2 — COD cash:** a courier collects COD cash on the shop's behalf and remits it to the shop outside the platform. BuyNSellem records declarations only.
- **B3 — Status list:** the umbrella's shipment statuses gain `cancelled` for shipments stopped before pickup. "Ready for pickup" is `pending` with `readyForPickupAt` set, not a separate status.
- **B4 — Handover code:** one code per order (P4), valid for the order's live shipment.
- **B5 — Attempts:** at most 2 delivery attempts per shipment (P4's value), then return to the shop.
- **B6 — Maps:** `react-native-maps` on mobile (Apple Maps on iOS, Google Maps on Android with `GOOGLE_MAPS_ANDROID_API_KEY`); Leaflet with a tile URL from `NEXT_PUBLIC_MAP_TILE_URL` on web.
- **B7 — Intercity COD:** disabled even once intercity opens, until prepaid checkout (P5) exists. A refused intercity parcel costs more than the order margin.

### Data model

All amounts are integers in XAF. All collections have `timestamps: true`.

#### `delivery-zones`

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | set at creation, pinned |
| `name` | text, required | 2–40 characters ("Douala centre", "Bonabéri") |
| `scope` | select `same_city`, `intercity` | `intercity` requires `delivery.intercityEnabled` |
| `city` | select, launch city key | for `same_city`: must equal the city of one of the shop's active dispatch origins, else the shop's city |
| `districts` | array of district keys | empty means the whole city; keys must belong to `city` |
| `destinationCities` | array of city keys | `intercity` only |
| `method` | select `seller_delivery`, `courier` | |
| `courier` | relationship couriers | required for `courier`; the courier must serve `city` (or every `destinationCities`) |
| `fee` | number, integer 0–50 000 | |
| `freeAboveSubtotal` | number, integer | optional; fee becomes 0 when subtotal ≥ value |
| `minOrderSubtotal` | number, integer | optional; the option is unavailable below it |
| `etaMinHours` / `etaMaxHours` | number 1–720 | `min ≤ max` |
| `cutoffTime` | text `HH:mm` | optional; orders accepted after it count from the next delivery day at 08:00 |
| `deliveryDays` | select hasMany `mon`…`sun` | default `mon`–`sat` |
| `codAllowed` | checkbox | default true; forced false for `intercity` (B7) |
| `active` | checkbox | default true |
| `sortOrder` | number | |

Rules, enforced in `services/delivery/zones.ts`:

- At most 30 zones per shop.
- **Overlap:** two active zones of the same shop, `scope` and `method` cannot both list the same district, and a shop cannot have two whole-city zones for the same city and method. Violations return `delivery.zoneOverlap`.
- **Resolution for a destination `(city, district)`:**
  1. a zone listing the district wins over a whole-city zone;
  2. a `{city}.other` district matches only whole-city zones.

Access: REST closed. Public reads go through the quote routes; management goes through `/api/shops/{id}/delivery-zones`, for `owner` and `manager` only.

#### `shop-locations`

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | |
| `name` | text, required | 2–60 characters |
| `city` | select, city key | launch cities for pickup; any key in `lib/launchCities.ts` for dispatch origins |
| `district` | text, district key | required |
| `address` | text | up to 200 characters |
| `landmark` | text, required | 5–200 characters |
| `gps` | group `lat`, `lng`, required | set with the map pin |
| `phone` | text | optional public E.164 number for the point |
| `openingHours` | array `{ day, opens, closes }` | `HH:mm`; required when `pickupEnabled` |
| `openingHoursNote` | text | free text, e.g. copied from P4 `pickupPoint.hours` |
| `pickupEnabled` | checkbox | shown to buyers as a pickup option |
| `pickupFee` | number, integer 0–5 000 | default 0 |
| `holdDays` | number 1–14 | default 7; how long a ready parcel waits |
| `preparationHours` | number 0–72 | default 2; added to the pickup ETA |
| `isDispatchOrigin` | checkbox | parcels leave from here |
| `isDefaultOrigin` | checkbox | exactly one per shop when any origin exists |
| `active` | checkbox | |

At most 10 locations per shop. Access:

- anyone reads active locations with `pickupEnabled`, without `phone` when it is empty;
- shop members read all;
- writes go through `/api/shops/{id}/locations`, `owner`/`manager` only.

#### `couriers`

Staff-managed registry of courier companies and carriers.

| Field | Type | Rules |
|---|---|---|
| `key` | text, unique | `^[a-z0-9-]{3,30}$`, e.g. `moto-express-dla`, `yango`, `campost` |
| `name` | text, required | |
| `logo` | upload media | |
| `provider` | select `manual`, `yango`, `campost` | adapter used |
| `scopes` | select hasMany `same_city`, `intercity` | |
| `cities` | select hasMany, city keys | cities served (origin cities for `intercity`) |
| `destinationCities` | select hasMany | `intercity` only |
| `supportsCod` | checkbox | |
| `tariffs` | array `{ city, district, amount, etaMinHours, etaMaxHours }` | used by the `manual` adapter's `quote`; `district` empty means the whole city |
| `trackingUrlTemplate` | text | `https://…/{trackingCode}`, optional |
| `contact` | group `phone`, `email` | shown to shops |
| `status` | select `active`, `paused`, `disabled` | `paused` hides it from new shipments |
| `billingMode` | select `shop_account`, `platform_account` | only `shop_account` is allowed in P7 |

Access: anyone reads `active` couriers (name, logo, cities, scopes, `supportsCod`, tariffs); staff write in the Payload admin.

#### `courier-members`

| Field | Type | Rules |
|---|---|---|
| `courier` | relationship couriers, required, indexed | |
| `user` | relationship users, required | must have a verified phone |
| `role` | select `dispatcher`, `rider` | |
| `vehicle` | select `moto`, `car`, `bicycle`, `foot` | riders |
| `status` | select `active`, `revoked` | |
| `phoneSharingConsentAt` | date | required before a rider can be assigned; the buyer sees the rider's phone during delivery |

Unique `(courier, user)`. Access: self, dispatchers of the same courier, and staff read; staff write. Helper `access/courierRoles.ts` `resolveCourierRole(payload, userId, courierId)` is cached in `req.context` like `resolveShopRole`.

#### `shipments`

| Field | Type | Rules |
|---|---|---|
| `shipmentNumber` | text, unique | `SHP-2609-000123` via P4 `sequences` |
| `order` | relationship orders, required, indexed | |
| `storefrontShop` | relationship shops, required, indexed | `order.shop`; the name the buyer and rider see |
| `fulfillingShop` | relationship shops, required, indexed | the shop holding the stock (`order-items.fulfillingShop`) |
| `purchaseOrder` | relationship purchase-orders | P8 |
| `items` | array `{ orderItem, quantity }` | all items of the order |
| `method` | select `seller_delivery`, `courier`, `pickup` | from the chosen option; `seller_delivery` can switch to `courier` before pickup |
| `carrier` | select `self`, `courier` | `self` covers shop members and external riders |
| `courier` | relationship couriers | required when `carrier = courier` |
| `provider` | select `manual`, `yango`, `campost` | null for `self` |
| `providerShipmentId` | text, indexed | |
| `trackingCode` / `trackingUrl` | text | |
| `zone` | relationship delivery-zones | |
| `pickupLocation` | relationship shop-locations | for `pickup` |
| `origin` | json | snapshot: location id, address, district, city, landmark, gps |
| `destination` | json | snapshot of `orders.delivery`, updated by reschedule |
| `fee` | number | buyer-paid fee for this shipment |
| `courierCost` | number | optional, declared by the shop; read `owner`/`manager` only |
| `rider` | group | `user` (relationship users, null for external riders), `name`, `phone`, `vehicle`, `assignedAt`, `assignedBy` |
| `riderLink` | group | `tokenHash`, `createdAt`, `expiresAt`, `revokedAt`, `lastUsedAt`; `tokenHash` has `read: () => false` |
| `status` | select `pending`, `picked_up`, `in_transit`, `delivered`, `failed`, `returned`, `cancelled` | written only by `services/delivery/shipmentTransitions.ts` |
| `attempts` | array | see below |
| `finalFailure` | group | `reason`, `at`, `returnInitiatedAt` |
| `redelivery` | group | `scheduledFor` (date), `window` (`morning`, `afternoon`, `evening`), `requestedBy` (`buyer`, `seller`), `rescheduleBy` (date), `note` |
| `proof` | group | see below |
| `codCollection` | group | see below |
| `failureCostBearer` | select `shop`, `reseller`, `supplier`, `buyer`, `none` | set at final failure; P8 settles |
| `readyForPickupAt` / `pickupDeadline` | date | pickup only |
| `pickedUpAt`, `inTransitAt`, `deliveredAt`, `failedAt`, `returnedAt`, `cancelledAt` | date | |
| `promisedBy` | date | from the quote at placement |
| `flags` | select hasMany `gps_far`, `delivered_without_code`, `late`, `return_overdue`, `cod_remittance_disputed` | |
| `lastProviderSyncAt` | date | |

`attempts[]`:

| Field | Type | Rules |
|---|---|---|
| `number` | number | 1-based |
| `outcome` | select `delivered`, `failed` | |
| `reason` | select `refused`, `absent`, `unreachable`, `address_not_found`, `rescheduled_by_buyer`, `not_collected`, `damaged`, `other` | failed only |
| `note` | text | up to 300 characters |
| `gps` | group `lat`, `lng`, `accuracyMeters` | captured automatically in the apps |
| `photo` | relationship delivery-proofs | optional |
| `actorType` | select `seller`, `rider`, `rider_link`, `dispatcher`, `courier_webhook`, `courier_poll`, `staff` | |
| `actor` | relationship users | |
| `at` | date | |

`proof`:

| Field | Type | Rules |
|---|---|---|
| `handoverMethod` | select `otp`, `buyer_confirmation`, `seller_declaration`, `carrier_pod` | |
| `otpVerifiedAt` | date | |
| `photo` | relationship delivery-proofs | required for `seller_declaration` |
| `gps` | group `lat`, `lng`, `accuracyMeters` | |
| `distanceFromDestinationMeters` | number | haversine to `destination.gps`, null without a pin |
| `recipientName` | text | who took the parcel, optional |
| `providerPodUrl` | text | carrier's proof of delivery |
| `capturedBy` / `capturedAt` | relationship users / date | |

`codCollection`:

| Field | Type | Rules |
|---|---|---|
| `expectedAmount` | number | items of the shipment plus its fee |
| `collectedBy` | select `seller`, `rider`, `courier` | |
| `collectedAmount` | number | must equal `expectedAmount`; partial COD collection is refused in P7 |
| `remittanceStatus` | select `not_applicable`, `pending`, `declared_remitted`, `confirmed`, `disputed` | `not_applicable` for `self` with a shop member |
| `declaredRemittedAt` / `confirmedAt` | date | |
| `note` | text | |

Access: REST `read` staff only; writes closed. Reads go through routes projected per audience:

- **buyer:** status, stepper dates, promised date, attempts (reason and date only), redelivery, pickup location, tracking URL, proof photo through a 10-minute signed URL. Rider first name and phone only while status is `picked_up`, `in_transit`, or `failed` with a scheduled redelivery.
- **storefront or fulfilling shop members:** everything except `riderLink.tokenHash`.
- **courier dispatchers and the assigned rider:** destination, recipient phone while non-terminal, expected COD amount, items titles and quantities, attempts and proof. No prices per item, no buyer history.
- **rider link holder:** the rider subset, only while the link is valid.

Unique partial index `(order)` where `status ≠ cancelled`: at most one live shipment per order. Several rows exist for an order only when a carrier change cancelled one and created its replacement.

#### `delivery-proofs`

Private upload collection for attempt and handover photos. It reuses P2's private storage: a second prefix `delivery-proofs` on the P2 private bucket or container, the same startup checks, and `lib/privateFiles.ts` `createSignedDocumentUrl` for reads.

| Field | Type | Rules |
|---|---|---|
| `shipment` | relationship shipments, required, indexed | |
| `kind` | select `attempt`, `handover`, `declaration` | |
| `uploadedBy` | relationship users | null for rider-link uploads |
| `uploadedVia` | select `seller_app`, `rider_app`, `rider_link`, `courier_webhook` | |
| upload | JPEG or PNG, 5 MB | EXIF GPS stripped on upload; the captured GPS is stored on the attempt or proof instead |

Access:

- REST closed.
- Signed URLs (10 minutes) are issued by the shipment routes to the buyer (handover and declaration photos only), members of the storefront and fulfilling shops, the assigned courier's members, and staff.
- Retention: purged 180 days after the shipment is terminal, unless the order has an open return case or dispute (P6).

#### `shipment-events`

Append-only; only `services/delivery` writes, in the same transaction as the change.

| Field | Type | Rules |
|---|---|---|
| `shipment` | relationship shipments, required, indexed | |
| `order` | relationship orders, indexed | |
| `type` | select | `shipment.created`, `shipment.carrier_set`, `shipment.rider_assigned`, `shipment.rider_link_created`, `shipment.rider_link_revoked`, `shipment.ready_for_pickup`, `shipment.picked_up`, `shipment.in_transit`, `shipment.attempt_failed`, `shipment.rescheduled`, `shipment.redelivery_started`, `shipment.delivered`, `shipment.failed_final`, `shipment.returned`, `shipment.cancelled`, `shipment.provider_status`, `shipment.cod_remittance_declared`, `shipment.cod_remittance_confirmed`, `shipment.cod_remittance_disputed` |
| `statusFrom` / `statusTo` | text | |
| `actorType` | select, as `attempts.actorType` plus `buyer`, `system` | |
| `actor` | relationship users | |
| `providerEventId` | text | |
| `webhookEvent` | relationship webhook-events | |
| `gps` | group | |
| `note` / `metadata` | text / json | never contains codes, tokens or hashes |
| `visibility` | select `buyer`, `shop`, `courier`, `both`, `staff` | |
| `occurredAt` | date | provider time when known, else server time |

The buyer and seller timelines merge `order-events` and `shipment-events` by time.

#### Changes to existing collections

- **`orders`** (P4):
  - `delivery.method` gains `courier`.
  - `delivery` gains `optionId`, `zone`, `pickupLocation`, `etaMinHours`, `etaMaxHours`, `promisedBy`.
  - New `shipments` (relationship shipments, hasMany, service-written).
  - `deliveryFailure.attempts` becomes a copy of the highest `attempts.length` among the order's shipments, maintained by the shipment service.
- **`order-events`** types gain `order.address_updated`.
- **`shops.orderSettings`** (P4): `deliveryFee`, `deliveryEtaText` and `pickupPoint` become read-only after the migration and are removed one release later. `sellerDeliveryEnabled` and `pickupEnabled` stay as master switches. New service-owned `recentExternalRiders` (array `{ name, phone, lastUsedAt }`, 10 entries, read by `owner`/`manager`).
- **`webhook-events`** (P0): `provider` gains `yango` and `campost`.
- **`reports`**: `targetType` gains `shipment`; `reason` gains `cod_remittance`, `return_overdue`.
- **`AppSettings`**: new `delivery` group (see Feature flags).

### Delivery quote

`services/deliveryQuote.ts` keeps P4's function name and input, and delegates to `services/delivery/quote.ts` when `delivery.zonesEnabled` is on. The return widens from `DeliveryOption[]` to `{ options, unavailable }`, and P4's checkout quote is updated in the same change (the flat implementation returns `unavailable: []`). The P4 flat implementation moves to `services/delivery/flatQuote.ts` and is deleted one release after the flag is on everywhere.

```ts
type DeliveryOption = {
  optionId: string;                 // "zone:{zoneId}" | "pickup:{locationId}"
  method: "seller_delivery" | "courier" | "pickup";
  fee: number;
  originalFee: number;              // before free-above
  freeApplied: boolean;
  etaMinHours: number;
  etaMaxHours: number;
  promisedBy: string;               // ISO date, end of the ETA window
  etaText: string;                  // localised
  codAllowed: boolean;
  zoneId?: string;
  courier?: { id: string; name: string; logoUrl?: string };
  pickupPoint?: PickupPointSnapshot & { distanceMeters?: number };
};

type UnavailableOption = { method: DeliveryOption["method"]; reason: "below_minimum" | "cod_not_allowed" | "not_served"; minOrderSubtotal?: number };
```

`quoteDelivery` returns `{ options: DeliveryOption[]; unavailable: UnavailableOption[] }`. P4's checkout reads `options`, and the client renders `unavailable` as hints ("Livraison offerte dès 10 000 FCFA", "Livraison à partir de 5 000 FCFA").

Algorithm:

1. Every item shares one `fulfillingShop` (P4: one order per fulfilling shop). Zones and locations are that shop's.
2. For that shop:
   - **Home delivery:** resolve the active same-city zones of the fulfilling shop for the destination `(city, district)`, one candidate per method, skipping zones whose `deliveryDays` and `cutoffTime` give no delivery day within 7 days.
   - **Pickup:** every active `pickupEnabled` location of that shop in the destination city, sorted by distance from `destination.gps` when present.
   - **COD:** with `paymentMethod = cod`, drop options with `codAllowed = false`, and for `courier` zones those whose courier lacks `supportsCod`, into `unavailable` with `cod_not_allowed`.
3. **Fee:** `fee = zone.fee`, or `0` when `subtotal ≥ freeAboveSubtotal`. Below `minOrderSubtotal` the option moves to `unavailable`.
4. **ETA:**
   - start = now, or the next delivery day at 08:00 when past `cutoffTime` or on a non-delivery day;
   - add the fulfilling shop's default origin `preparationHours`;
   - `promisedBy = start + etaMaxHours`, skipping non-delivery days;
   - pickup ETA = `preparationHours` within opening hours.
5. The quote hash (P4) includes `optionId`, `fee`, and the zone or location `updatedAt`, so a fee edit between quote and placement returns `checkout.quoteChanged`.

Placement (P4 `checkout/place`) stores `delivery.optionId`, `zone`, `pickupLocation`, ETA and `promisedBy` on the order. P7 adds no new checkout route.

Listing page hint: `GET /api/public/listings/{id}/delivery-options?city=&district=` returns the cheapest fee and ETA per method for the listing's product. City and district default to the viewer's `homeLocation` city or the shop's city; responses are cached 5 minutes in Redis per `(shop, city, district)`.

### Migration from P4 settings

Payload migration `src/migrations/p7_delivery_zones`, idempotent through `metadata.migratedFrom = "p4"` on created documents:

1. **Seller delivery zone:** each shop with `orderSettings.codEnabled` and `sellerDeliveryEnabled` gets one zone — name "Toute la ville", `scope: same_city`, `city` = shop city, `districts: []`, `method: seller_delivery`, `fee = orderSettings.deliveryFee ?? city default`, `etaMinHours: 24`, `etaMaxHours: 48`, `codAllowed: true`.
2. **Pickup location:** each shop with `pickupEnabled` and `pickupPoint` gets one location — `pickupEnabled: true`, `isDispatchOrigin: true`, `isDefaultOrigin: true`. `address`, `landmark` and `gps` are copied, `pickupPoint.hours` goes to `openingHoursNote`, and `district` is `{city}.other`. The owner gets `delivery-settings-incomplete` asking for structured hours and the district.
3. **Shipments for shipped orders:** each `shipped` order without shipments gets one shipment — `carrier: self`, `status: in_transit` (or `pending` with `readyForPickupAt = shippedAt` for pickup), with `attempts` rebuilt from `order-events` of type `order.delivery_attempt_failed`.
4. **Orders in `placed`, `confirmed` or `accepted`** get their shipment through the normal flow.

A shop with `codEnabled` and no active zone or pickup location after the migration has `orderable` false. The owner gets `delivery-settings-incomplete`, and enabling COD without one returns `delivery.noActiveOption`.

### Shipment state machine

`services/delivery/shipmentTransitions.ts` is the only writer of `shipments.status`. `applyShipmentTransition(req, shipment, to, event)` validates against the table, writes the shipment and the event in the caller's transaction, then calls the P4 order service for the order effects below.

| From | To | Actor / trigger | Guard | Side effects |
|---|---|---|---|---|
| — | `pending` | system on order `accepted` (on purchase-order acceptance for P8 resale orders) | one live shipment per order | `promisedBy` copied; courier `create` called when the zone method is `courier` |
| `pending` | `picked_up` | rider, rider link, dispatcher, provider event | `carrier = courier`, or `self` with an external rider | `pickedUpAt`, GPS |
| `pending` | `in_transit` | seller "Je pars livrer" | `carrier = self` | `inTransitAt` |
| `pending` | `delivered` | seller enters the code at the counter; buyer confirms receipt | `method = pickup`, `readyForPickupAt` set | proof |
| `pending` | `failed` | job at `pickupDeadline` | `method = pickup` | reason `not_collected`, final |
| `pending` | `cancelled` | order cancelled; seller changes carrier | | provider `cancel` when created |
| `picked_up` | `in_transit` | rider, provider event | | `inTransitAt` |
| `picked_up`, `in_transit` | `delivered` | valid handover code (rider, link, seller); buyer confirmation; seller declaration (`self` only, photo required); provider event with proof of delivery | | proof, `codCollection`, GPS distance, flags |
| `picked_up`, `in_transit` | `failed` | attempt reported by rider, link, seller, dispatcher, provider | reason set | attempt appended |
| `failed` | `in_transit` | seller, rider, dispatcher start re-delivery | not final, `attempts < maxAttempts` | `redelivery` consumed |
| `failed` | `returned` | seller confirms parcel back; dispatcher declares returned and seller confirms | final | `returnedAt`, `failureCostBearer` |
| `picked_up`, `in_transit` | `cancelled` | staff only | | order cancelled by staff (P4 `order.cancel`) |

Terminal: `delivered`, `returned`, `cancelled`.

A failure becomes final (`finalFailure` set) when:

- the reason is `refused`, `damaged` or `not_collected`;
- or `attempts.length` reaches `delivery.maxAttempts` (2);
- or no reschedule happened before `redelivery.rescheduleBy`.

For `carrier: self`, "final failure" and "returned" happen in one seller action ("Colis refusé, revenu en boutique"), unless the seller chooses "Colis pas encore revenu".

Order effects, applied through P4 `applyTransition` in the same transaction:

| Shipment change | Order effect |
|---|---|
| Shipment leaves `pending`, or pickup becomes ready | `accepted → shipped`; P4 sends the handover code; items `fulfillmentStatus → shipped` |
| Shipment `delivered` | `shipped → delivered` (stock sale, `cod_collected`, commission, withdrawal clock) |
| Shipment attempt `failed` | `order.delivery_attempt_failed` event; `deliveryFailure.attempts` updated |
| Shipment `returned` | `shipped → delivery_failed`, reason = first buyer-caused reason among attempts (`refused`, `absent`, `unreachable`; `not_collected` maps to `absent`), else the last reason; P4 releases stock and records the refusal |
| Shipment `cancelled` because the carrier changed | none; a replacement shipment is created in the same transaction |

P4 routes stay for released clients and become wrappers over the order's live shipment.

| P4 route | P7 behaviour |
|---|---|
| `ship` | `carrier: self` → `in_transit`; for pickup, mark ready |
| `handover` | shipment handover |
| `delivery-attempt-failed` | attempt `failed` |
| `mark-delivery-failed` | final failure plus `returned` for `self` |
| `declare-delivered` | shipment declaration |

P4's `failStaleOrders` reads `shipments.inTransitAt`, and for provider shipments calls `getStatus` before failing anything.

### CourierProvider interface

`lib/delivery/types.ts`, mirroring `lib/payments/types.ts` after P0:

```ts
export type CourierProviderId = "manual" | "yango" | "campost";

export type ShipmentStatus =
  | "pending" | "picked_up" | "in_transit" | "delivered" | "failed" | "returned" | "cancelled";

export type FailureReason =
  | "refused" | "absent" | "unreachable" | "address_not_found"
  | "rescheduled_by_buyer" | "not_collected" | "damaged" | "other";

export interface CourierAddress {
  contactName: string;
  phone: string;                         // E.164
  city: string;                          // city key
  district?: string;                     // district key
  addressLine?: string;
  landmark?: string;
  gps?: { lat: number; lng: number };
}

export interface CourierQuoteParams {
  courierKey: string;
  scope: "same_city" | "intercity";
  origin: CourierAddress;
  destination: CourierAddress;
  parcel: { itemsCount: number; weightGrams: number; declaredValue: number };
  cod?: { amount: number; currency: "XAF" };
  readyAt: Date;
}

export interface CourierQuote {
  providerQuoteId?: string;
  amount: number;
  currency: "XAF";
  etaMinHours: number;
  etaMaxHours: number;
  expiresAt?: Date;
}

export interface CreateCourierShipmentParams extends CourierQuoteParams {
  reference: string;                     // "SHP-2609-000123"
  providerQuoteId?: string;
  callbackUrl: string;                   // /api/public/delivery/webhook/{provider}
  note?: string;
  storefrontName: string;                // name the rider announces (P8 white label)
}

export interface CreateCourierShipmentResult {
  providerShipmentId: string;
  status: ShipmentStatus;
  trackingCode?: string;
  trackingUrl?: string;
}

export interface CourierStatusSnapshot {
  reference: string;
  providerShipmentId: string;
  providerStatus: string;                // raw vocabulary, stored in the event
  status: ShipmentStatus | null;         // null when the raw status has no mapping
  occurredAt: Date;
  rider?: { name: string; phone?: string; vehicle?: string };
  attempt?: { reason: FailureReason; note?: string };
  proof?: { podUrl?: string; recipientName?: string; gps?: { lat: number; lng: number } };
  codCollectedAmount?: number;
}

export interface CourierWebhookEvent extends CourierStatusSnapshot {
  providerEventId: string;
  type: string;
}

export interface CourierProvider {
  readonly id: CourierProviderId;
  readonly capabilities: {
    quote: boolean; webhooks: boolean; cancel: boolean; cod: boolean; intercity: boolean;
  };
  quote(params: CourierQuoteParams): Promise<CourierQuote>;
  create(params: CreateCourierShipmentParams): Promise<CreateCourierShipmentResult>;
  cancel(params: { providerShipmentId: string; reason: string }): Promise<{ cancelled: boolean; cancellationFee?: number }>;
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<CourierWebhookEvent>;
  getStatus(providerShipmentId: string): Promise<CourierStatusSnapshot>;
}
```

`lib/delivery/index.ts`:

- `getCourierProvider(id)` builds adapters from the environment, like `getProvider`.
- A missing configuration throws `CourierNotConfiguredError`. Calling an unsupported capability throws `CourierCapabilityError`.
- `listAvailableCouriers({ city, scope, cod })` returns `active` couriers whose provider is configured.

Errors from adapters never reach clients as text. Routes map them to `courier.notConfigured`, `courier.providerError` or `courier.cancelRefused` and log the original.

#### `manual` adapter

For courier companies without an API, operated by their dispatchers and riders in BuyNSellem.

- `capabilities`: `{ quote: true, webhooks: false, cancel: true, cod: courier.supportsCod, intercity: courier.scopes includes intercity }`.
- `quote`: the most specific matching `couriers.tariffs` row (district, then whole city), else `courier.unavailable`.
- `create`: returns `providerShipmentId = shipment id`, `status: pending`, and `trackingUrl` from `trackingUrlTemplate` when set. It notifies the courier's dispatchers (`courier-shipment-assigned`).
- `cancel`: `{ cancelled: true }` while `pending`; afterwards `{ cancelled: false }` and staff handle it.
- `verifyWebhook`: throws `CourierCapabilityError`. No webhook route is registered for `manual`.
- `getStatus`: reads the shipment itself, because the dispatcher and rider apps write status directly.

#### `yango` placeholder adapter

No public merchant API for Yango Delivery in Cameroon was found (umbrella market facts). P7 ships the adapter shape so negotiated access becomes a mapping exercise, not a redesign.

- `YangoCourierProvider` reads `YANGO_DELIVERY_BASE_URL`, `YANGO_DELIVERY_API_KEY` and `YANGO_DELIVERY_WEBHOOK_SECRET`. Without them, every method throws `CourierNotConfiguredError` and the courier record stays `disabled`.
- Declared capabilities are all `false` until the negotiated documentation confirms each one. `listAvailableCouriers` never returns a courier whose capability required by the request is `false`.
- `STATUS_MAP: Record<string, ShipmentStatus>` translates Yango's vocabulary. Unknown statuses produce `status: null`, recorded as `shipment.provider_status` without a transition.
- `verifyWebhook` uses `timingSafeEqual` over an HMAC of the raw body when a signature scheme is provided. Otherwise webhooks stay disabled and `pollCourierShipments` drives status.
- Checklist for the negotiation, recorded in the adapter's header comment:
  - price-estimate and create endpoints;
  - cancellation rules and fees;
  - webhook signing or polling limits;
  - status vocabulary, and whether a failed attempt is reported with a reason;
  - COD support and remittance to the shop;
  - proof-of-delivery format;
  - rider phone exposure;
  - sandbox;
  - account model — each shop's own business account (`billingMode: shop_account`, credentials per shop, out of P7) or a platform account re-billed to shops (`platform_account`, refused in P7 because it would put delivery money through BuyNSellem).

#### Campost and intercity carriers (gated)

- Intercity carriers — Campost, and bus-agency parcel services operated through the `manual` adapter — are `couriers` with `scopes: [intercity]`, `cities` and `destinationCities`.
- An intercity zone uses such a courier. The destination is either the buyer's address (when the courier delivers) or the courier's agency. For the agency case, the buyer collects with the order's handover code, given to a `courier-members` rider or dispatcher at the agency.
- `CampostCourierProvider` is a later adapter on the same interface. P7 ships no file for it.
- Everything intercity is hidden while `delivery.intercityEnabled` is false. Checkout still enforces same-city (P4) until it is turned on, and B7 keeps COD off for intercity.

### Services and routes

Layout under `src/services/delivery`: `zones.ts`, `locations.ts`, `quote.ts`, `flatQuote.ts`, `shipments.ts`, `shipmentTransitions.ts`, `handover.ts`, `riderLinks.ts`, `couriers.ts`, `webhooks.ts`. Multi-document writes use one Payload transaction with a shared `req`, retried up to 3 times on `TransientTransactionError`.

#### Zones and locations (shop `owner`/`manager`)

- `GET|POST /api/shops/{id}/delivery-zones`; `PATCH|DELETE /api/delivery-zones/{zoneId}`. Deleting a zone referenced by an order or shipment sets `active: false` instead.
- `POST /api/shops/{id}/delivery-zones/test` `{ city, district, subtotal }` returns the options a buyer would see. Used by the "Tester une adresse" tool.
- `GET|POST /api/shops/{id}/locations`; `PATCH|DELETE /api/locations/{locationId}`.
- `GET /api/public/shops/{handle}/pickup-points` for the shop page and checkout.
- Zone and location writes publish `shop.updated` so the indexer recomputes `orderable` and a new `deliveryCities` listing field (filterable city keys).

#### Shipments (shop members of the storefront or fulfilling shop)

- `GET /api/orders/{orderId}/shipments` and `GET /api/shipments/{id}` — audience-projected.
- `POST /api/shipments/{id}/carrier` `{ carrier: "self" | "courier", courierId?, courierCost? }` — while `pending`. Switching to a courier calls `quote` (for display) and `create`. Switching away cancels the provider shipment and creates a replacement.
- `POST /api/shipments/{id}/rider` `{ userId }` for a shop member (P3 role any), or `{ name, phone }` for an external rider. External riders are saved to `recentExternalRiders`.
- `POST /api/shipments/{id}/rider-link` — creates or rotates the link and sends it by SMS to the rider's phone; returns the URL once so the seller can also share it on WhatsApp. `DELETE` revokes it.
- `POST /api/shipments/{id}/ready-for-pickup` — pickup only; sets `readyForPickupAt` and `pickupDeadline = + holdDays`.
- `POST /api/shipments/{id}/start` — `self`: `pending → in_transit`, or `failed → in_transit` for re-delivery.
- `POST /api/shipments/{id}/picked-up` `{ gps }` — rider paths.
- `POST /api/shipments/{id}/attempts` `{ reason, note, gps, photoId? }`.
- `POST /api/shipments/{id}/handover` `{ code, gps, photoId?, recipientName? }` (below).
- `POST /api/shipments/{id}/declare-delivered` `{ note, gps, photoId }` — `carrier: self` only, photo required (`shipment.photoRequired`). Sets P4 `contestBy`.
- `POST /api/shipments/{id}/returned` — confirms the parcel is back.
- `POST /api/shipments/{id}/cod-remittance` `{ action: "confirm" | "dispute", note }` — owner/manager. `dispute` sets the flag and creates a `reports` row (`targetType: shipment`, reason `cod_remittance`).

#### Buyer

- `POST /api/shipments/{id}/reschedule` `{ date, window, landmark?, gps?, note? }` (below).
- P4's `confirm-receipt` and `contest-delivery` apply to the order's live shipment. A contest is available for `seller_declaration` and `carrier_pod`.

#### Courier members

- `GET /api/courier/shipments?status=&cursor=` — the dispatcher's courier shipments, or the rider's assigned ones.
- `POST /api/courier/shipments/{id}/assign` `{ riderUserId }` — dispatcher; the rider must be an active member with `phoneSharingConsentAt`.
- `POST /api/courier/shipments/{id}/cod-remitted` `{ note }` — dispatcher.
- Riders use the shipment routes above (`picked-up`, `attempts`, `handover`, `returned`), authorised through `resolveCourierRole` for the assigned courier (`shipment.notAssigned` otherwise).

#### Rider link (no account)

- `GET /api/public/rider/{token}` — returns the rider projection:
  - shop name, shipment number;
  - origin landmark, destination recipient first name, phone, district, landmark, GPS and Maps link;
  - expected COD amount, items and quantities, attempts so far, allowed actions.
- `POST /api/public/rider/{token}/picked-up`, `/attempts`, `/handover`, `/photo` (creates a `delivery-proofs` row, 5 MB, JPEG or PNG).
- Token: 32 random bytes in base64url. Only its SHA-256 is stored. It expires when the shipment is terminal, when revoked, or 72 hours after creation (rotatable by the seller).
- An invalid token returns 404 `shipment.riderLinkInvalid` with no detail.
- Rate limits in Redis: 30 calls per token per hour, 60 per IP per hour.
- A link holder cannot declare delivery without the code, cannot reschedule and cannot see amounts other than the COD total.

#### Webhooks

`POST /api/public/delivery/webhook/[provider]` follows P0 exactly:

1. `verifyWebhook` — failure → 400, logging only that verification failed.
2. Insert `webhook-events` — a duplicate `(provider, providerEventId)` → 200 without work; an insert failure → 500.
3. Return 200 and enqueue `processCourierWebhookEvent`.

The job resolves the shipment by `reference` or `providerShipmentId` and applies the mapped transition with `actorType: courier_webhook`. Events that are out of order (`occurredAt` earlier than the last applied provider event) or not allowed by the table are stored as `shipment.provider_status` without changing status. A provider `delivered` without a verified code sets `handoverMethod: carrier_pod`, flag `delivered_without_code`, and opens P4's 48-hour contest window.

### Rider handover flow

1. **Carrier choice.** The seller opens the order at "À expédier" and picks one:
   - "Je livre moi-même", assigned to themselves or another member;
   - "Un livreur" — name and phone, then the rider link by SMS;
   - "Coursier partenaire" — the list from `listAvailableCouriers` for the city, with tariff and ETA; the dispatcher assigns a rider.
2. **Pickup.**
   - The rider taps "Colis récupéré", capturing GPS; for `self` the seller taps "Je pars livrer".
   - The shipment leaves `pending` and the order becomes `shipped`.
   - P4 sends the handover code SMS, whose text gains the rider's first name: "Votre livreur Paul arrive…".
   - The buyer's order page shows the rider card with a call button.
3. **At the door.** The rider hands the parcel over, collects the cash and asks for the code.
   - The code is entered in the rider app, the rider link or the seller app, and `services/delivery/handover.ts` calls P4 `verifyHandoverCode(order, code, { shipmentId, actor })`. Attempts and locking stay on the order.
   - GPS is captured automatically.
   - A photo is optional with a valid code.
4. **Verification succeeds**, in one transaction:
   - shipment `delivered` with `handoverMethod: otp`;
   - `codCollection` — `collectedBy`: `seller` for a member, `rider` for an external rider, `courier` for a partner;
   - `remittanceStatus`: `not_applicable`, `pending` or `pending` respectively;
   - `distanceFromDestinationMeters`, with flag `gps_far` above 300 m (informational, never blocking);
   - order effects.
5. **Code locked** (P4). The rider app shows "Demandez au client de générer un nouveau code dans son application" and a button to call the buyer. The buyer's regeneration shows the new code in their app and SMS.
6. **Buyer cannot produce a code.** For `self` carriers the seller may declare delivery with a mandatory photo; partner and link riders cannot. The buyer can confirm receipt in the app at any time.
7. **Remittance.** For external riders the seller confirms "Espèces reçues du livreur" (`confirm`) or disputes. For partner couriers the dispatcher declares remittance and the seller confirms or disputes. Disputes open a staff report; P9 turns repeated disputes into risk flags on the courier or rider.

### Failed attempts and re-delivery

- **Recording an attempt.** `POST /api/shipments/{id}/attempts` appends the attempt and moves the shipment to `failed`.
  - Reasons `refused` and `damaged` make it final immediately.
  - Otherwise, when attempts remain, `redelivery.rescheduleBy = now + 48 h` and the buyer gets `shipment-attempt-failed` by push and SMS: "Livraison BNS-2609-000123 manquée. Choisissez un nouveau créneau: buynsellem.com/purchases/{id}".
- **Buyer reschedule.** `POST /api/shipments/{id}/reschedule`:
  - allowed while `failed`, not final and before `rescheduleBy`, else `shipment.rescheduleWindowClosed`;
  - `date` is within the next 7 days on one of the zone's `deliveryDays`, else `shipment.rescheduleDateInvalid`;
  - `window` is `morning` (08–12), `afternoon` (12–16) or `evening` (16–20);
  - a new `landmark` or `gps` updates `shipments.destination` and `orders.delivery`, with `order.address_updated`;
  - the delivery phone cannot change;
  - notifies the shop members, and the courier's dispatchers and assigned rider (`shipment-redelivery-scheduled`), and sends a confirmation SMS to the buyer.
- **Seller reschedule** after a call uses the same route with `requestedBy: seller`.
- **Re-delivery** starts with `start` (self) or `picked-up`/`in_transit` from the rider: `failed → in_transit`. No re-delivery fee is charged through the platform in P7.
- **Final failure** (`finalFailure` set) from a final reason, `maxAttempts` reached, or `finalizeFailedShipments` after `rescheduleBy`:
  - `returnInitiatedAt = now`;
  - `failureCostBearer`: `reseller` for resale items refused on COD (umbrella resale terms), `shop` otherwise;
  - the shop is notified (`shipment-return-initiated`).
- **Return.**
  - `self`: returned when the seller confirms, which is the default in the same action.
  - courier: the dispatcher marks the parcel returned and the seller confirms with `returned`.
  - After 72 hours without return the seller and dispatcher are reminded; after 7 days `return_overdue` is flagged and a staff report is created.
  - At `returned`, P4 moves the order to `delivery_failed` and releases stock. Stock is released only once the parcel is physically back, so a unit on its way back is not resold.
- **Pickup not collected.** Reminder `shipment-pickup-reminder` at `pickupDeadline − 48 h`. At the deadline the shipment goes `pending → failed` (`not_collected`, final) and immediately `returned`, because the parcel is at the shop.

### Jobs

Registered in `jobs/index.ts`. New `autoRun` entry: `{ cron: "*/15 * * * *", queue: "delivery", limit: 50 }`. Hourly and nightly tasks reuse P4's `hourly` and the existing `nightly` queues.

| Task | Queue / schedule | Work |
|---|---|---|
| `processCourierWebhookEvent` | `delivery`, enqueued | apply one stored courier event; 5 retries with backoff, `attempts` and `lastError` on the `webhook-events` row |
| `pollCourierShipments` | `delivery`, every 15 min | non-terminal provider shipments where the provider has no webhooks, or `lastProviderSyncAt` is older than 30 min: `getStatus` and apply |
| `finalizeFailedShipments` | `hourly` | `failed`, not final, `rescheduleBy ≤ now` and no redelivery scheduled → final failure |
| `expirePickupHolds` | `hourly` | reminders at `pickupDeadline − 48 h`; at the deadline → `not_collected` and `returned` |
| `flagLateShipments` | `hourly` | non-terminal past `promisedBy + 24 h` → flag `late`, one `shipment-late` notice to the shop |
| `remindReturns` | `nightly` | return reminders and the 7-day `return_overdue` report |
| `expireRiderLinks` | `nightly` | set `riderLink.revokedAt` on terminal shipments and past `expiresAt` |

### P8 interplay

- `services/delivery/shipments.ts` exposes `createShipmentForOrder(req, order)` and `createShipmentForPurchaseOrder(req, purchaseOrder)`.
  - For `own` orders, P7 calls the first on `order.accepted`.
  - For resale orders, P8 calls the second when the supplier accepts its purchase order, and the shipment carries `purchaseOrder`. The purchase order then follows its shipment (P8).
- **Quote.** A resale order is quoted with the supplier's zones and pickup locations, because the stock and the dispatch origin are the supplier's.
- **Actors.** Supplier members act on the shipment as members of the `fulfillingShop`; they see destination, items and COD amount for their shipment, not the storefront order's other lines or totals. Buyer, rider link, SMS and rider app show `storefrontShop` ("Livraison pour {reseller}"), and `CreateCourierShipmentParams.storefrontName` carries the same name to courier APIs.
- **Handover code.** The order's P4 code is verified by the supplier's rider (B4).
- **Failure cost.** `failureCostBearer` and `courierCost` are the inputs P8 needs to charge a refused COD delivery to the reseller.
- **COD collection.** For resale shipments `codCollection.expectedAmount` is the order total, collected for the supplier as seller of record (D3); P8 settles the reseller's margin through the supplier's commission invoice.

### Notifications

New Novu workflows in `syncNotificationWorkflows.ts` (in-app and push; SMS through `sendSms` where stated):

| Workflow | Recipient | Trigger | Payload |
|---|---|---|---|
| `shipment-out-for-delivery` | buyer | `in_transit` (first time and re-delivery) | `orderId`, `orderNumber`, `riderName`, `promisedBy` |
| `shipment-attempt-failed` | buyer (+ SMS), shop members | attempt `failed` | `orderId`, `reason`, `attemptsLeft`, `rescheduleBy` |
| `shipment-redelivery-scheduled` | shop members, courier dispatchers, assigned rider; buyer SMS | reschedule | `shipmentId`, `date`, `window` |
| `shipment-ready-for-pickup` | buyer (+ SMS) | ready | `orderId`, `locationName`, `landmark`, `hours`, `pickupDeadline` |
| `shipment-pickup-reminder` | buyer (+ SMS) | `pickupDeadline − 48 h` | `orderId`, `pickupDeadline` |
| `shipment-return-initiated` | shop `owner`/`manager`, fulfilling shop members | final failure | `shipmentId`, `orderNumber`, `reason` |
| `shipment-returned` | shop `owner`/`manager` | `returned` | `shipmentId`, `orderNumber` |
| `shipment-late` | shop members | `promisedBy + 24 h` | `shipmentId`, `orderNumber` |
| `courier-shipment-assigned` | courier dispatchers; rider on assignment | `create`, `assign` | `shipmentId`, `district`, `codAmount` |
| `delivery-settings-incomplete` | shop owner | migration or COD enabled without options | `shopId` |

P4's `order-shipped` payload gains `carrier`, `riderName` and `trackingUrl`; P7 sends no separate "picked up" notification. SMS to external riders — "BuyNSellem: livraison SHP-2609-000123 pour {shop}, {district}. Détails et code client: buynsellem.com/r/{token}" — goes through `sendSms` and is recorded as `shipment.rider_link_created`.

### Moderation

- The P4 order sheet (`GET /api/moderation/orders/{id}`) gains shipments with attempts, proof photos (signed URLs), GPS, remittance status and flags.
- Staff cancelling an order (`order.cancel`) cancels its non-terminal shipments. For provider shipments it calls `cancel`, and a refused provider cancellation leaves the shipment for manual follow-up with flag `late`.
- Reports with `targetType: shipment` appear in the existing reports queue. Resolution actions are notes only in P7.
- Staff manage `couriers` and `courier-members` in the Payload admin. Pausing a courier hides it from new shipments without touching live ones.

### Feature flags

`AppSettings.delivery`:

| Setting | Default |
|---|---|
| `zonesEnabled` | `false`; switches `quoteDelivery` to zones and shows zone and location settings |
| `couriersEnabled` | `false`; shows partner couriers and the courier space |
| `riderLinksEnabled` | `true` once `zonesEnabled` |
| `intercityEnabled` | `false` |
| `maxAttempts` | `2` |
| `rescheduleHours` | `48` |
| `pickupHoldDaysDefault` | `7` |
| `gpsFarThresholdMeters` | `300` |
| `providers.yango.enabled` | `false` |

`GET /api/public/config` exposes `deliveryZonesEnabled`, `couriersEnabled` and `intercityEnabled`.

Rollout:

1. Run the migration with `zonesEnabled` off, so P4 flat quotes still serve checkout.
2. Shops review the zones created for them.
3. Turn `zonesEnabled` on.
4. Onboard the first partner courier in Douala and turn `couriersEnabled` on.

### Error codes

Added to `lib/errors.ts` with English fallbacks and translations in both clients:

- `delivery.zoneInvalid`, `delivery.zoneOverlap`, `delivery.zoneLimitReached`, `delivery.cityNotLaunched`, `delivery.locationInvalid`, `delivery.locationLimitReached`, `delivery.noActiveOption`
- `shipment.notFound`, `shipment.invalidTransition`, `shipment.maxAttemptsReached`, `shipment.photoRequired`, `shipment.rescheduleWindowClosed`, `shipment.rescheduleDateInvalid`, `shipment.riderLinkInvalid`, `shipment.notAssigned`, `shipment.riderConsentMissing`
- `courier.unavailable`, `courier.notConfigured`, `courier.cityNotServed`, `courier.providerError`, `courier.cancelRefused`

Reused: `checkout.cityNotServed`, `checkout.methodUnavailable`, `checkout.quoteChanged`, `order.handoverCodeInvalid`, `order.handoverLocked`, `order.contestWindowClosed`, `generic.rateLimited`, `shop.notMember`.

### Web

New routes:

- **`/seller/delivery`** — the sidebar "Delivery" entry from P1.
  - Zones grouped by city, with columns name, districts, method, fee, free above, minimum, ETA, COD, active.
  - A zone drawer with a district multi-select from `lib/launchCities.ts`, method and courier select (partner couriers when enabled, with their tariff shown as a cost hint), fee fields and delivery days.
  - "Tester une adresse", showing exactly what a buyer in a chosen district would see.
- **`/seller/delivery/locations`** — pickup points and dispatch origins: a Leaflet map with a draggable pin, landmark, weekly hours grid, hold days, pickup fee, default origin.
- **`/seller/delivery/couriers`** — partner couriers in the shop's city (logo, tariffs, COD, contact) and recent external riders. Shown when `couriersEnabled`.
- **`/r/[token]`** — the rider page: mobile-first, no header or sign-in, large buttons.
  - "Colis récupéré", "Échec" (reason sheet), "Saisir le code" (4-digit input), "Ajouter une photo" (camera capture via `<input capture>`), tap-to-call and "Ouvrir dans Maps".
  - Bilingual toggle; French by default.
- **`/courier`** and **`/courier/shipments/[id]`** — dispatcher space: shipments by status, assign rider, mark returned, declare remittance. Visible to courier members only.

Changes:

- **`/checkout`** (P4):
  - the address step gains the draggable map pin prefilled from `navigator.geolocation`;
  - the delivery step lists zone options with struck-through fees when free-above applies, `unavailable` hints, and pickup points sorted by distance with hours and a map;
  - `promisedBy` is shown as "Livré au plus tard jeudi 18 septembre".
- **`/purchases/[id]`** (P4) gains the tracking block:
  - a stepper — Préparée, Récupérée (courier), En route, Livrée — with dates and the promised date;
  - the rider card while en route;
  - attempts with reasons and the "Choisir un nouveau créneau" dialog (date, window, landmark, pin);
  - the pickup card with map, hours and deadline countdown;
  - the proof card (time, photo thumbnail, "Code vérifié");
  - the tracking link for provider shipments.
- **`/seller/orders/[id]`** (P4) gains the shipment panel:
  - carrier choice dialog;
  - rider assignment and link (copy, resend SMS, revoke);
  - status actions per the table, and the handover dialog with photo upload;
  - attempts timeline with GPS map links and photos;
  - remittance confirm or dispute, and "Colis revenu".
- **Listing detail** delivery line uses `/api/public/listings/{id}/delivery-options`: "Livraison Akwa: 1 500 FCFA · 24–48 h · Retrait gratuit à Bonapriso".
- **`/s/[handle]`** shows pickup points and "Livre à Douala".

### Mobile

New routes (expo-router, `headerShown: false`):

- `app/seller/delivery/index.tsx` — zones list and the entry to locations and couriers
- `app/seller/delivery/zone/[id].tsx` — `new` for creation
- `app/seller/delivery/locations.tsx`
- `app/seller/delivery/location/[id].tsx` — `react-native-maps` pin, hours editor
- `app/seller/shipment/[id].tsx`:
  - carrier choice;
  - rider link sharing through React Native `Share` (WhatsApp, SMS);
  - start, pickup-ready and returned actions;
  - attempt sheet with automatic GPS (`expo-location`) and an optional photo (`expo-image-picker` camera);
  - the P4 4-digit handover keypad extended with GPS and photo.
- `app/purchases/[id]/reschedule.tsx` — date and window, landmark, map pin
- `app/rider/index.tsx` — assigned shipments for courier riders, grouped Aujourd'hui / À reprendre / Terminées
- `app/rider/shipment/[id].tsx` — the same actions as the rider page, plus call and navigation intents
- `app/courier/index.tsx` — dispatcher list and rider assignment

Changes:

- `app/checkout/address.tsx` gains the map pin.
- `app/checkout/delivery.tsx` shows zone options, hints and pickup points.
- `app/purchases/[id].tsx` gains the tracking block.
- `app/seller/orders/[id].tsx` links to the shipment screen.
- The Shop hub gains a Delivery tile.
- The Account tab shows "Espace livreur" to active courier members.
- Deep links `buynsellem://purchases/{id}` (reschedule opens from the SMS link on web, from push in the app) and `buynsellem://rider/shipment/{id}`.

Dependencies:

- `react-native-maps` with its Expo config plugin and `GOOGLE_MAPS_ANDROID_API_KEY`; a new development build is required.
- `leaflet` and `react-leaflet` on web, loaded client-side only.

### Internationalisation

- Every string ships in French and English on web (next-intl) and mobile (i18next) in the same change.
- District labels come from `lib/launchCities.ts` and keep their local names in both languages.
- Shipment statuses:

| Status | Buyer (FR / EN) | Seller (FR / EN) |
|---|---|---|
| `pending` | En préparation (Prête au retrait) / Being prepared (Ready for pickup) | À expédier (Prête au retrait) / To ship (Ready for pickup) |
| `picked_up` | Récupérée par le livreur / Picked up by the rider | Récupérée / Picked up |
| `in_transit` | En route / On the way | En route / On the way |
| `delivered` | Livrée / Delivered | Livrée / Delivered |
| `failed` | Livraison manquée / Delivery missed | Échec de livraison / Delivery failed |
| `returned` | Retournée au vendeur / Returned to seller | Revenue en boutique / Back at the shop |
| `cancelled` | Annulée / Cancelled | Annulée / Cancelled |

- Failure reasons, delivery windows and ETA phrases ("demain", "sous 24–48 h", "au plus tard jeudi") are localised in `Africa/Douala` time.

## Testing

**Unit tests** (`tests/int`):

- Zone validation: district keys belong to the city, overlap detection for district and whole-city zones, limits, intercity forced `codAllowed: false`.
- Zone resolution: district beats whole city; `.other` matches only whole city; method separation; inactive zones ignored.
- Quote:
  - free-above boundary (subtotal equal to the threshold is free);
  - `minOrderSubtotal` moves the option to `unavailable`;
  - COD filtering by zone and courier;
  - cutoff and delivery days shifting `promisedBy` across a Sunday;
  - pickup sorting by distance;
  - a resale order quoted with the supplier's zones (P8 fixture);
  - the quote hash changes when a zone fee or `updatedAt` changes.
- Flat versus zone implementation switch on `delivery.zonesEnabled`, with P4 checkout tests passing under both.
- Shipment transition table: every allowed and forbidden transition; final-failure rules (refused, damaged, max attempts, reschedule timeout, not collected); `self` combined final-failure-and-return.
- Order effects: the shipment leaving `pending` ships the order once; delivered → order delivered; returned → `delivery_failed` with the correct buyer-caused reason mapping (`not_collected → absent`); a second live shipment for the same order is refused by the unique index.
- Handover through the shipment path uses P4 attempts and lock; GPS distance and the `gps_far` flag; photo required for declaration; declaration refused for courier and link riders.
- Rider link: token hashing, expiry at terminal, revocation, rotation, rate limits, projection excludes amounts other than COD total and never includes the token hash.
- Reschedule window, allowed dates by `deliveryDays`, address update propagating to the order with `order.address_updated`, phone change refused.
- `manual` adapter: tariff specificity, `cancel` rules, `verifyWebhook` capability error. `yango` adapter: every method throws `CourierNotConfiguredError` without env; unknown `STATUS_MAP` values yield `status: null`.
- Courier webhook job: duplicate event ignored, out-of-order event recorded without transition, `delivered` without code sets `carrier_pod` and the contest window.

**Migration tests:** run twice on a fixture with P4 shops (with and without `deliveryFee` override, with pickup point) and shipped orders; the second run changes nothing; attempts rebuilt from events.

**Route tests:**

- Zone and location CRUD restricted to `owner`/`manager`; a P3 `staff` member gets 403.
- Carrier switch cancels and replaces the provider shipment in one transaction.
- Buyer projection shows rider phone only during delivery.
- Courier dispatcher sees only their courier's shipments; an unassigned rider gets `shipment.notAssigned`.
- P4 wrapper routes behave as before, including after a carrier change replaced the shipment.
- Webhook route: invalid signature 400 with no signature in logs, duplicate 200, insert failure 500.
- Staff order cancel cancels non-terminal shipments.

**Jobs:** `finalizeFailedShipments`, `expirePickupHolds`, `flagLateShipments`, `remindReturns`, `pollCourierShipments` with a fake provider and a fixed clock.

**Clients:**

- Typecheck and biome on web and mobile; a development build with `react-native-maps` on iOS and Android.
- Manual pass on staging in Douala:
  - create zones for Akwa and whole city, and a pickup point in Bonapriso;
  - checkout from Akwa (district fee) and from Makepe (city fee), then above the free threshold;
  - self delivery with a member: start, handover with a code, GPS distance shown;
  - external rider link on a second phone: pickup, failed attempt "absent", buyer reschedule, re-delivery, handover by code;
  - refused parcel: final failure, returned, order `delivery_failed`, stock available again only after return;
  - pickup order: ready, reminder, collected with code; a second pickup order left to expire;
  - partner courier with a dispatcher and rider account: assignment, delivery, remittance declared and confirmed, and one disputed;
  - web and mobile tracking views in both languages.

## Verification targets

- `bun run generate:types` in `packages/api`
- `bun run check-types` in `packages/api`, `packages/web`, `packages/mobile`, `packages/search-indexer`
- `bunx vitest run --config ./vitest.config.mts` in `packages/api`
- `bun test` in `packages/mobile` and `packages/search-indexer`
- `bunx biome check` on touched files
- `bun run sync:notification-workflows -- --dry-run` in `packages/api` lists the new workflows
- EAS development builds for iOS and Android including `react-native-maps`
- Staging: migration run twice, then `delivery.zonesEnabled = true` with the manual pass above; production migration with the flag off, shop review period of one week, flag on; `couriersEnabled` on after the first partner courier completes 50 staged deliveries
