# P10 Beyond Design — Multi-Shop Cart, Multi-Currency, Multi-Country

Date: 2026-10-09
Parent: `2026-09-15-business-layer-design.md`
Depends on: `2026-09-15-p5-protected-payment-design.md` and `2026-09-15-p8-resale-design.md` (both shipped), with `2026-09-15-p4-cod-orders-design.md` (cart, checkout, orders) and `2026-09-15-p7-delivery-design.md` (zones, couriers) as the surfaces it rewires.

## Goal

P10 is the last roadmap row, and it is mostly a promotion: every launch-market fact that today lives in code — `douala`/`yaounde` city keys, the `+2376…` phone pattern, `Africa/Douala`, `"XAF"` and `FCFA` literals, cron hours written as "Douala minus one" — becomes a row in one market registry, exactly as P5 already did for provider, settlement mode and VAT rate. On top of that registry:

1. **Multi-currency plumbing.** The market's currency travels from cart to quote to order to payment intent to ledger to invoices to the clients' formatters. Integer minor-unit money stays; there is no FX — one market, one currency.
2. **Multi-shop cart.** The cart accepts lines from several shops and splits at checkout into one order per fulfilling shop, grouped by `checkoutGroup` (the field P4 already carries). The existing single-fulfilment rule stops being a cart refusal and becomes a per-order invariant.
3. **Per-country provider wiring.** The payment and courier registries — already keyed by provider id — resolve through the market row, so a new country is rows plus a provider go-live record, never code (adapters themselves stay future work items, exactly as NotchPay was for P5).

The international rule this phase installs: **a new market is data — market row, city rows, settings amounts, formatting table, review evidence — never a code change.** The only code a market can require is a new provider adapter, which has its own contract suites and release record.

Country choices themselves — which markets, what the review finds, how money is written — are the user's per-country gate, not this spec's.

## Scope

1. A `markets` collection as the one source of truth per country: currency and rounding, money formatting per locale, phone pattern, timezone, VAT, languages, enabled features, amount-bearing limits, payment wiring (absorbing P5's `payments.markets` rows), regulatory-review record, status. Fail-closed loader in the `paymentSettingsOf` discipline.
2. A `market-cities` collection replacing `lib/launchCities.ts`: cities and districts as rows, seeded from the current CM constants.
3. Currency threading: `Money` in the contracts slice, `orders.amounts.currency` required and market-derived, ledger postings refused on currency mismatch, invoices carrying currency plus a formatting snapshot, both clients formatting from market data served over the wire.
4. Multi-shop cart and split checkout: grouped cart, per-group delivery quotes, all-or-nothing placement creating one order per `(storefront shop, fulfilling shop)` group, one payment intent per order, the clients' grouped cart/checkout/purchases UX.
5. Market-keyed provider resolution for payments and couriers; per-market feature switches feeding `GET /api/public/config`.
6. Per-market calendars: sequences, VAT report, insights aggregation and the money jobs compute local boundaries from `market.timezone` instead of hard-coded Douala.
7. CM seed migration, feature flags, rollout, error codes, parity specs.

## Out of scope

- **FX conversion**, multi-currency carts, or showing a price in a currency other than its market's. One market, one currency, end to end.
- **New country launches themselves.** Each is data plus its regulatory review — the user's gate. P10 ships the mechanics with CM as the only live market.
- **Cross-border orders.** A buyer orders within one market; a shop sells in its own market. Cross-market resale, shipping and settlement are a later phase if ever.
- **Cross-order payment splitting.** No intent covers more than one order; P5's money invariants are untouched.
- New provider or courier adapters. The registry mechanics are specced; each adapter remains its own work item with contract suites and a release record.
- New client languages. `market.languages` is data, but the clients ship `fr` and `en` only; a market requiring another language is blocked at its review gate.
- Per-market category trees, moderation policy or legal-document templates (the review may demand them; they become their own items).

## Gates

| Gate | Holder | Clears when |
|---|---|---|
| Per-country regulatory review (the umbrella's P10 gate) | **user** | For each market: counsel's review filed as evidence on the market row — payment licensing (CEMAC 04/18 or local equivalent), e-commerce and consumer law, data-protection authorisation, VAT registration. The row cannot reach `live` without it. |
| Per-market money formatting | **user** | The user approves each market's formatting table (the "XAF 1,410 vs FCFA" veto, now data). CM seeds the already-approved behaviour. |
| Markets to seed beyond CM | **user** | The user names countries; each becomes rows plus its review, never code. |
| Per-market amounts | **user** | `minPayout`, `maxOrderAmount`, exposure caps, protection-fee bounds, boost prices are currency amounts; the user sets them per new market. |
| Provider adapter per market | future work item | Adapter passes the marketplace/courier contract suites and carries a go-live record, as NotchPay did. |
| Multi-shop cart rollout | **user** | `multiShopCartEnabled` turned on after the staging rehearsal; off, behaviour is byte-identical to P8. |

## Current state (verified 2026-10-09)

### Already multi-market (built by P5)

- `lib/paymentSettings.ts` — `MarketRow { countryCode, currency, provider, settlementMode, channels, vatRateBps, enabled }` rows under `AppSettings.payments.markets`; `DEFAULT_MARKETS` seeds CM/XAF/notchpay. `marketOf` drops any imperfect row ("a guessed currency or VAT rate on a live market would be charged to buyers"); `getPaymentSettings` fails closed to no markets. `resolveSettlement(settings, countryCode)`, `isProtectedPaymentOpen(settings, countryCode)`, the G1–G6 gate rows, and `paymentSettingsRefusal` — which today pins every market's VAT to `orders.vatRateBps` "until COD becomes per-market".
- `GET /api/public/config` takes `?country=` and defaults to the first market's country (`app/(frontend)/api/public/config/route.ts:89-93`).
- `lib/payments/marketplaceRegistry.ts`: provider factories keyed by `PaymentProviderId`, `hasMarketplaceProvider`, `adapterPresenceRefusal` (enabling a market whose provider has no registered adapter is refused). `lib/delivery/registry.ts` mirrors it for couriers.
- The ledger already threads currency: `PostLedgerInput.currency` is required and the account key is `category:{shop|platform}:{currency}` (`services/ledger.ts:45-47, 321`). `checkoutSettlement.ts` refuses a provider success whose amount **or currency** differs from the intent's (`:382-417`).
- `orders.checkoutGroup` (text, indexed) exists since P4 (`collections/Orders.ts:134`) — the umbrella's split anchor, never yet written. Payment intents are already per order (`POST /api/orders/{id}/payment-intents`, `targetType: order`).

### The hard-coded launch-market facts (the debt P10 promotes to data)

| Fact | Where | Today |
|---|---|---|
| Launch cities and districts | `lib/launchCities.ts` | `LaunchCityKey = "douala" \| "yaounde"`, 40 district slugs, labels, default fees; imported by checkout, delivery zones, couriers, seed, both clients' forms |
| Delivery phone | `services/checkout.ts:294` | `DELIVERY_PHONE_PATTERN = /^\+2376\d{8}$/`, duplicated in both clients and pinned by `checkout-form-parity.int.spec.ts` |
| Timezone | `lib/delivery/eta.ts:1` `DELIVERY_TIMEZONE = "Africa/Douala"`; `services/sequences.ts:3`; `lib/orderMath.ts:72` and `services/checkout.ts:116` `DOUALA_OFFSET_MS`; `vatReport.ts`, `commission.ts` (weekly period), `shopInsights*.ts`, `shopDailyAggregation.ts`, `shopResponseBursts.ts`, `listingViews.ts` | ~12 files assume Douala |
| Cron hours | `payload.config.ts:165-180` | schedules written as "Douala hour minus one"; `releaseEligibleFunds` at `0 9 * * *` = 10:00 Douala — flagged by the P5 ledger (`plans/2026-10-03-p5-protected-payment.md:630`) as a country literal "to lift with multi-market work" |
| `"XAF"` literals | ~30 sites: `cart.ts:430`, `checkout.ts` (quote, contract, intents), `commission.ts`, `purchaseOrders.ts`, `resellerLedger.ts` (`const CURRENCY = "XAF"`), `resellerPayouts.ts`, `paymentBackfill.ts`, `boostPricing.ts`, `orderContract.ts`, `lib/delivery/types.ts` (`cod.currency: "XAF"`), `Orders.ts:286` and `CommissionInvoices.ts:112` (`defaultValue: "XAF"`), `orders/serialize.ts` (`?? "XAF"` fallback) | currency is threaded but hard-coded at every entry |
| Rounding | `lib/paymentMath.ts:9` `roundXaf = roundHalfUp`; integer XAF everywhere | correct for XAF (minor unit 0), unnamed as a per-currency rule |
| Client formatting | `web/src/lib/order-money.ts:18`, `mobile/src/lib/orderMoney.ts:18` — `fr → "47 000 FCFA"`, `en → "XAF 47,000"`; `FCFA` in all four locale files (web `messages/fr|en.json`, mobile `locales/fr|en.json`) | the formatting veto, hard-coded twice |
| Amount-bearing settings | `paymentSettings.ts:86-98` — `buyerProtection {min:100, max:15_000}`, `minPayout 1000`, `maxOrderAmount 1_000_000`, `exposureCaps`, plus boost prices | XAF amounts on global settings, meaningless in another currency |
| Cart single-shop | `services/cart.ts` throws `cart.singleShop` (storefront) and `cart.singleFulfilment` (`:524`); `checkout.ts:606` re-asserts at quote | the P8 rule the split turns into a per-order invariant |

## Design

### Assumptions where the umbrella leaves a choice

- **M1 — Market identity:** a market is one ISO 3166-1 alpha-2 country with exactly one ISO 4217 currency. CEMAC countries sharing XAF are still separate markets (own review, cities, phone pattern, provider wiring).
- **M2 — One market per cart:** the cart binds to a market when its first line is added (the listing shop's market); a line from another market returns `cart.marketMismatch`. The delivery address must be in the cart's market.
- **M3 — Split key:** checkout groups cart lines by `(storefront shop, fulfilling shop)` — the fulfilling shop is the resale supplier when the line is resale, else the storefront. One order per group; `order.shop` stays the storefront, `order-items.fulfillingShop` the supplier, exactly as P8 routes purchase orders.
- **M4 — Payment stays per order:** one intent per order (today's shape). For a multi-order group the buyer pays order by order; sibling orders are independent after placement — an unpaid sibling expires and cancels alone (P5 `expireOrders`), it never claws back a paid one.
- **M5 — Placement is all-or-nothing:** one transaction creates every order of the group and reserves all stock, or nothing is created.
- **M6 — Cart bounds:** at most 5 fulfilling groups and 30 lines per cart (`cart.shopLimitReached`).
- **M7 — Crons stay UTC:** no per-market cron rows. Jobs with a local-time contract run hourly and act on each market whose local time crosses the boundary (lifts the flagged `releaseEligibleFunds` literal).
- **M8 — Backward compatibility:** released clients see today's behaviour until `multiShopCartEnabled` is on; `cart.singleShop` / `cart.singleFulfilment` keep firing while it is off.
- **M9 — Formatting fallback:** a market row lacking a locale's formatting entry renders `"{CODE} {grouped amount}"` — explicit, ugly, and never a silent `FCFA`.

### `markets` collection

The source of truth, one document per country. Staff-written in the Payload admin; REST closed; public reads only through `GET /api/public/config`. All service reads go through `lib/markets.ts` (below).

| Field | Type | Rules |
|---|---|---|
| `countryCode` | text, unique, indexed | `^[A-Z]{2}$`, immutable after creation |
| `name` | text, required | "Cameroun" |
| `status` | select `draft`, `review`, `live`, `suspended` | service-pinned transitions; `live` requires `regulatoryReview.evidence` and a provider adapter registered for `payments.provider` (`adapterPresenceRefusal` moves here) |
| `currency` | group | `code` (`^[A-Z]{3}$`), `minorUnit` (0–3; XAF = 0), `rounding` (select `half_up`, `half_even`, `down`; XAF = `half_up`) |
| `formatting` | array, one row per locale | `locale` (`fr`, `en`), `symbol` ("FCFA"), `position` (`before`, `after`), `groupSeparator` (narrow no-break space, comma…), `decimalSeparator`, `pattern example` (display-only check string). CM seeds today's exact outputs. |
| `phone` | group | `pattern` (anchored regex source; must compile, must match every `examples.valid` and no `examples.invalid` or the save is refused), `examples` (valid/invalid arrays), `displayExample` ("+237 6XX XX XX XX") |
| `timezone` | text | IANA name, validated with `Intl.DateTimeFormat` at save |
| `languages` | select hasMany `fr`, `en` | required contract languages (Law 2011/012 analogue per market); a market needing a language the clients lack cannot leave `review` |
| `vatRateBps` | number 0–10 000 | replaces the single `orders.vatRateBps` pin; CM = 1925 |
| `payments` | group | P5's `MarketRow` minus `countryCode`/`currency`/`vatRateBps` (now market-level): `provider`, `settlementMode` (only `provider_split` saveable — the P5 refusal texts move verbatim), `channels` (keys now `{cc}.{operator}`), `enabled` |
| `features` | group of checkboxes | `cod`, `protectedPayment`, `deliveryZones`, `couriers`, `disputes`, `resale`, `resalePrepaid`, `boosts` — each ANDed with the existing global flag: a feature is open in a market only when both are on |
| `amounts` | group, integers in the market's minor units | `minPayout`, `maxOrderAmount`, `exposureLevel2`, `exposureLevel3`, `buyerProtectionMin`, `buyerProtectionMax`, `defaultDeliveryFeeFallback`; `buyerProtectionBps` stays global (a rate, not an amount) |
| `regulatoryReview` | group | `reviewedBy`, `reviewedAt`, `evidence` (relationship to the P5 `payment-gate-evidence` upload collection, extended with `scope: market`), `note` — the user's gate record |
| `moneyCalendar` | group | `releaseHourLocal` (default 10), `reconcileHourLocal` (default 2), `vatPeriod` (`calendar_month`) |

Save hook refusals, in the `paymentSettingsRefusal` sentence-per-reason style: duplicate country; invalid pattern or pattern failing its own examples; invalid timezone; `settlementMode` other than `provider_split` (with the P5 refusal prose); `live` without review evidence, without a registered provider adapter, or with zero active cities; currency fields edited while any non-terminal order exists in the market.

`lib/markets.ts`:

```ts
export interface Market { /* the validated shape above */ }

// Fail-closed: an invalid document is dropped, not repaired (marketOf discipline).
export async function getMarkets(payload): Promise<Market[]>;          // cached 60 s
export async function getMarket(payload, countryCode): Promise<Market>; // throws market.unknown
export function marketIsOpen(market, feature): boolean;                 // status live + feature + global flag
```

`getPaymentSettings` keeps its signature and return shape for every existing P5 caller: its `markets` array is now hydrated from this collection (`MarketRow` assembled from `market.payments` + market-level fields). `isProtectedPaymentOpen`, `resolveSettlement`, the G1–G6 gates and the env kill-switch are untouched — P10 moves the rows, not the rules. The `AppSettings.payments.markets` field becomes read-only after migration and is removed one release later (the P7 deprecation pattern).

**Fail-closed everywhere:** an unknown or non-`live` market never defaults to CM. Checkout, quote, cart-add, payment-intent creation and public config all resolve the market first and refuse (`market.unknown`, `market.notLive`) when resolution fails. The CM fallback dies with the literals.

### `market-cities` collection

Replaces `lib/launchCities.ts`. One document per city.

| Field | Type | Rules |
|---|---|---|
| `market` | relationship markets, required, indexed | |
| `key` | text | `^[a-z0-9-]{2,30}$`, unique per market ("douala") |
| `label` | text, required | "Douala" |
| `districts` | array `{ slug, label }` | slugs unique per city; `{city}.other` stays implicit and always accepted, as today |
| `defaultDeliveryFee` | number, integer ≥ 0 | in the market's currency |
| `active` | checkbox | an inactive city stops being orderable; existing orders unaffected |
| `sortOrder` | number | |

`lib/launchCities.ts` becomes a thin async compat shim over this collection (`isLaunchCityKey` → `isMarketCityKey(market, key)` etc.) kept one release for its ~15 importers, then deleted. District keys keep the `{city}.{slug}` wire format, so stored orders, zones and courier tariffs need no rewrite. `AppSettings.orders.launchCities` (per-city fee overrides) migrates into these rows and is removed.

Delivery zones (`delivery-zones.city`), couriers (`couriers.cities`) and checkout address validation all validate against the cart's market's cities — a courier serves cities, cities belong to markets, so courier resolution becomes market-keyed with no schema change to `couriers`.

### Multi-currency plumbing

**The `Money` contract.** `src/contracts/money.ts` (the shipped api slice — the web client value-imports only through it, per the deploy rule):

```ts
export interface Money { amount: number; currency: string } // integer minor units
export interface MoneyFormat { locale: "fr" | "en"; symbol: string; position: "before" | "after";
  groupSeparator: string; decimalSeparator: string; minorUnit: number }
export function formatMoney(amount: number, format: MoneyFormat): string;
```

`formatMoney` is pure and table-driven; both clients call it with the `formats` block served by public config — formatting is data over the wire, never a client-side `locale === "fr" ? FCFA : XAF` branch. `web/lib/order-money.ts` and `mobile/lib/orderMoney.ts` become wrappers that read the active market from config and fall back per M9. The four locale files lose their `FCFA` strings; copy that must name an amount interpolates a formatted value (bilingual copy changes go to the user for veto, as always).

**Rounding.** `lib/paymentMath.ts` gains `roundMinor(value, market)` dispatching on `currency.rounding`; `roundXaf` becomes `roundMinor` with the CM market and is deleted after its three callers (`refunds.ts`, `payouts.ts`, `resellerPayoutPlanner.ts`) migrate. For XAF nothing changes numerically (minor unit 0, half-up) — pinned by a golden test.

**Thread, end to end.** The currency is read once per flow from the market and copied forward; nothing downstream re-derives it:

- cart stores `market` (relationship) at creation; every quote and contract amount carries `market.currency.code`;
- `orders` gains `market` (relationship, indexed, service-pinned); `orders.amounts.currency` loses its `"XAF"` default, becomes required, and is set from the market at placement;
- payment intents already carry currency — created from `order.amounts.currency`, never a literal;
- `checkoutSettlement` keeps its amount/currency mismatch refusal (nothing to change — it already does the right thing);
- **ledger:** `postLedger` gains a refusal — when the posting names an order, `input.currency` must equal that order's `amounts.currency`, else `LedgerPostingError("currency mismatch")`, caught by nothing: the posting fails loudly. Account keys already segregate by currency, so balances can never net across currencies; `reconcileLedger` and the nightly balance check run per currency. `resellerLedger.ts`'s `const CURRENCY = "XAF"` and every posting-site literal is replaced by the order's currency;
- commission and buyer-fee invoices (`CommissionInvoices`, `BuyerFeeInvoices`) drop the `"XAF"` default, store `currency` plus a `formatSnapshot` (the market's formatting row at issue time), so a later formatting edit never rewrites an issued invoice's PDF; `vatRateBps` comes from the order's market (the `paymentSettingsRefusal` VAT pin against `orders.vatRateBps` is retired — COD is now per-market);
- courier types widen `cod.currency: "XAF"` to `string`, filled from the order;
- `boostPricing` keys prices per market (`markets.amounts` sibling table, user decision for non-CM).

**No FX, stated as a refusal:** any attempt to combine amounts of two currencies — a posting, an invoice line, a cart — is a thrown error, not a conversion.

### Multi-shop cart and split checkout

**Cart.** With `multiShopCartEnabled` on, `services/cart.ts` stops throwing `cart.singleShop` and `cart.singleFulfilment` on add. New checks: the line's market equals the cart's (`cart.marketMismatch`), and the group/line bounds (M6, `cart.shopLimitReached`). `GET /api/cart` returns lines grouped:

```ts
type CartView = {
  market: { countryCode: string; currency: string };
  groups: Array<{
    groupKey: string;                    // "{storefrontShopId}:{fulfillingShopId}"
    storefrontShop: ShopSummary;
    fulfillingShop: ShopSummary;        // === storefrontShop unless resale
    resale: boolean;
    items: CartLineView[];
    subtotal: number;
  }>;
  grandSubtotal: number;
};
```

**Quote.** `POST /api/checkout/quote` runs P7's `quoteDelivery` once per group against the group's fulfilling shop (P7's `resolveQuoteShop` precondition becomes "per group" instead of "per cart" — its single-fulfilment throw moves inside the group boundary where it is an integrity assertion, not a user error). Response: per-group `{ items, subtotal, delivery: { options, unavailable }, deliveryFee, vat, total }` plus `grandTotal`. Groups whose shop is unavailable or whose destination is unserved come back in `unavailableGroups` with a reason; the buyer can place the rest (the client asks). The quote hash covers the full set — every group's items, selected options, fees, plus `market.updatedAt` and each zone's `updatedAt` — so any edit in between returns `checkout.quoteChanged`, as today.

**Place.** `POST /api/checkout/place` takes the quote hash and one selected delivery option per group, and in **one transaction** (shared `req`, 3 retries on `TransientTransactionError`, the house pattern):

1. allocates `checkoutGroup` (`CHK-{YYMM}-{seq}` via `sequences`, month boundary in the market's timezone);
2. for each group, creates the order (storefront, fulfilling shop on every item, delivery snapshot, `amounts` with the market currency, `checkoutGroup`) — **and asserts the per-order invariant: every item's `fulfillingShop` equals the group's, else `order.mixedFulfilment` aborts everything.** This is the P8 single-fulfilment rule, relocated: per order, not per cart;
3. reserves stock per line with the conditional atomic update, variants processed in sorted id order across the whole group (deadlock avoidance); any reservation miss throws and rolls back **all** orders (M5) with `checkout.stockChanged` naming the line;
4. writes `order-events`, P8 purchase orders for resale groups, and the P4 confirmation obligations per order.

Response: `{ checkoutGroup, orders: [{ id, orderNumber, shop, total, currency, paymentMethod }] }`.

**Payment.** Unchanged per order: COD orders proceed individually; `mobile_money` orders each get their intent via the existing `POST /api/orders/{id}/payment-intents`. The client drives a pay-each-order sequence ("Payer la commande 1/3"); the per-order checkout expiry (`checkoutExpiryMinutes`) applies to each order independently (M4). Exposure caps, commission, protection fee, settlement, payouts, refunds, disputes: all already per order, all untouched — the split multiplies orders, never touches a money rule.

**Group reads.** `GET /api/checkout/groups/{checkoutGroup}` (buyer only) returns the sibling orders and their payment states, feeding the post-placement screen and "My purchases" grouping. Sellers see nothing new: each order is as single as it ever was.

### Per-market provider wiring

- `getMarketplaceProviderFor(market)` in `lib/payments/index.ts`: resolves `market.payments.provider` through the existing registry; a missing adapter throws the existing configuration error and the market cannot be `live` (save hook). `PAYMENT_PROVIDERS` grows one union member per adapter that lands — the one acceptable code touch, since an adapter is code by nature.
- `PAYMENT_CHANNELS` stops being a const union (`cm.mtn`, `cm.orange`) and becomes per-market data validated as `^[a-z]{2}\.[a-z0-9_]{2,20}$`; the adapter contract suite checks the adapter accepts its market's channel keys.
- Couriers: no new keying needed — `couriers.cities` already scopes them, and cities now belong to markets. `courierAdapterPresenceRefusal` extends to refuse enabling `features.couriers` on a market none of whose active couriers has a working adapter.
- Webhook routes, `webhook-events`, and the verify → store → 200 → job pattern are shared across markets; the event's intent/shipment resolves its market.

### Calendars and timezones

- `lib/delivery/eta.ts` `DELIVERY_TIMEZONE` → the zone's shop's market timezone, passed in.
- `sequences.ts` takes a timezone argument (callers pass the order's market); the shared `YYMM` guard stays per sequence key, now `{key}:{countryCode}`.
- `vatReport.ts`, `commission.ts` weekly periods, `shopInsights*`, `shopDailyAggregation`, `shopResponseBursts`, `listingViews` compute boundaries from the shop's market timezone (a shop belongs to one market via its city).
- `lib/orderMath.ts` / `checkout.ts` `DOUALA_OFFSET_MS` → `Intl`-based boundary helpers taking the market timezone (works for DST timezones, which Douala never needed).
- Cron rows in `payload.config.ts` stay UTC (M7). `releaseEligibleFunds` and `reconcileLedger` reschedule hourly; each run processes the markets whose `moneyCalendar` hour has just crossed locally, with a per-market `lastRunLocalDate` guard so a market is processed once per local day. This retires the P5 ledger's flagged literal, as that ledger said it would.

### Public config

`GET /api/public/config?country=XX` (parameter exists) gains a `market` block when the country resolves to a `live` market:

```ts
market: {
  countryCode, name, currency: { code, minorUnit },
  formats: MoneyFormat[],                      // per locale
  phone: { pattern, displayExample },
  cities: [{ key, label, districts: [{ key, label }], fee }],
  features: { cod, protectedPayment, deliveryZones, couriers, disputes, resale, resalePrepaid, boosts },
  languages,
}
```

An unknown country returns the market block absent and every ordering feature off — fail-closed presentation. The legacy top-level `launchCities` and flat flags stay, serving CM values, until released clients age out. **The client's `?country=` is presentational only:** the server derives the authoritative market from the cart's listing shop and the delivery address city, never from the query parameter — a spoofed country can change what a visitor sees, not what anyone is charged.

### Migration and seed

`src/migrations/p10_markets`, idempotent via `metadata.migratedFrom`:

1. Create the CM market from `DEFAULT_MARKETS` + `AppSettings.payments.markets` (payment fields, gates evidence references), `vatRateBps` from `orders.vatRateBps`, timezone `Africa/Douala`, phone pattern from `DELIVERY_PHONE_PATTERN`, formatting rows reproducing today's `fr`/`en` outputs exactly, amounts from `PAYMENT_DEFAULTS`, status `live` carrying the P5 review record.
2. Create `market-cities` from `LAUNCH_CITIES` merged with `AppSettings.orders.launchCities` fee overrides.
3. Backfill `orders.market` = CM and set `amounts.currency`/invoice `currency` explicitly where the default had applied; backfill `carts.market`.
4. Point ledger reconciliation at per-currency scopes (no data change — keys already carry currency).

Rollout: migrate with `multiShopCartEnabled` off → verify CM golden parity (same quotes, same formatted strings, same cron effects) → remove the compat shims one release later → user turns the cart flag on after the staging rehearsal → new markets are rows behind their review gate.

### Error codes

New in `lib/errors.ts`, translated in both clients: `market.unknown`, `market.notLive`, `market.featureClosed`, `cart.marketMismatch`, `cart.shopLimitReached`, `checkout.stockChanged`, `checkout.groupUnavailable`, `order.mixedFulfilment` (integrity; should never reach a user). Reused: `payment.marketUnavailable`, `checkout.quoteChanged`, `checkout.addressInvalid`, `cart.singleShop`/`cart.singleFulfilment` (flag off only).

### Web and mobile

- **Cart** groups lines by shop with per-group subtotal and a per-group delivery line; a group with an unserved destination shows its reason and a "remove group" action.
- **Checkout** shows one review per group (P4's Law 2010/021 confirmation step per order — each order keeps its own contract and receipt), one address for all, then per-order payment steps for `mobile_money` ("Commande 2 sur 3"), with per-order success/failure — a failed sibling never blocks a paid one.
- **My purchases** groups sibling orders under the checkout group header; each order keeps its own timeline, tracking and dispute entry.
- Money rendering everywhere goes through `formatMoney` with config-served formats; phone fields validate with the config-served pattern and show `displayExample`. The hard-coded pattern copies in both clients are deleted; `checkout-form-parity.int.spec.ts` flips from "same literal on three sides" to "clients validate with the served pattern".
- All new copy in `fr` and `en`, submitted for the user's veto.

## Review focus — failure modes

- **A cart split racing stock.** Two buyers place groups sharing a variant's last unit. Both run M5 transactions; reservations are conditional atomic updates in globally sorted variant order, so one transaction loses, throws `checkout.stockChanged`, and rolls back *all* of its orders — the invariant to verify is that no sibling order of the losing placement survives, and no reservation leaks from the aborted transaction. Test: concurrent placements over a 1-unit variant; assert exactly one group of orders exists and `stockReserved` totals are exact.
- **A market row missing a field.** The loader drops imperfect rows (P5 discipline), so a market mangled by a raw DB edit becomes *unknown*, not *default*: checkout, intents and config all refuse rather than serve CM/XAF facts to the wrong country. The save hook makes this unreachable through the admin. Test: each required field invalidated in turn ⇒ `market.unknown` on every money path, never a fallback value.
- **Currency mismatch refused at the ledger.** A posting whose `currency` differs from its order's market currency throws `LedgerPostingError` and the enclosing transaction aborts — the books prefer a loud gap (caught by the nightly reconciliation) over a silently mixed account. Account keys carrying currency mean even a bug that got past the check could not net XAF against another currency. Test: forced mismatch posting aborts; reconciliation runs per currency and flags the gap.
- **The single-fulfilment invariant surviving the split.** The rule that protected P7 quoting and P8 purchase-order routing was a cart refusal; it is now asserted per order at placement (`order.mixedFulfilment`) and re-checked by P7's per-group quote precondition. The failure to fear is a future cart change assembling a group with two fulfilling shops — the placement assertion makes that abort loudly instead of producing an order no shipment or purchase order can serve. Test: a corrupted group (integrity harness) aborts the whole placement.
- **A spoofed or stale `?country=`.** Presentational only; the authoritative market comes from the shop and delivery city server-side. Test: mismatched query parameter changes nothing charged.
- **Partial payment of a group.** One sibling paid, another expired: each order's P5 lifecycle runs alone; the paid order ships, the expired one releases its stock. No cross-order clawback exists to get wrong — verified by a group test with one paid and one expired order.
- **Formatting row absent for a locale.** M9 fallback renders `"XAF 1 410"`-style explicit code, never the wrong symbol; golden tests pin CM's exact current strings so the migration cannot change a single rendered amount.

## Testing

`bun test` throughout (unit beside the code, int specs in `tests/int`):

- **Unit:** `formatMoney` table-driven per market × locale, including the CM golden strings and the M9 fallback; `roundMinor` per rounding rule with the XAF golden equivalence to `roundHalfUp`; market loader fail-closed matrix; phone pattern self-validation (pattern must match its own examples at save).
- **Int:** `market-registry.int.spec.ts` (loader, save-hook refusals, status transitions, live-gate requirements); `checkout-split.int.spec.ts` (grouping, quote per group, all-or-nothing place, stock race, mixed-fulfilment abort, checkout-group reads, flag-off parity with today's refusals); `ledger-currency.int.spec.ts` (mismatch refusal, per-currency reconciliation); `market-calendar.int.spec.ts` (release/reconcile local-hour sweep, sequence month boundaries per timezone); public config market block incl. unknown-country fail-closed.
- **Parity specs:** `checkout-form-parity` reworked to served-pattern validation; a new `money-format-parity` running the same fixtures through the contracts formatter as both clients consume it (web value-imports only via the shipped api slice).
- **The international rule as a test:** `market-literals.guard.spec.ts` greps the api and client sources and fails on `Africa/Douala`, `+2376`, `"XAF"`, `FCFA`, `douala`/`yaounde` outside an explicit allowlist (seed, migration, tests, golden fixtures, compat shims with their removal release noted). New markets = rows is enforced by CI, not prose.

## Decisions for the user

1. **Money formatting per market** — approve each market's formatting rows (CM seeds today's vetted `"47 000 FCFA"` / `"XAF 47,000"`).
2. **Which markets to seed beyond CM** — each named country starts its row in `draft` and its regulatory review.
3. **Rounding rule per currency** — XAF stays integer half-up; any decimal-currency market needs its rule chosen.
4. **Per-market amounts** — `minPayout`, `maxOrderAmount`, exposure caps, protection-fee bounds, boost prices, default delivery fee for every new market.
5. **Cart bounds** — confirm 5 groups / 30 lines (M6).
6. **New-market feature posture** — whether a market opens COD-first (the CM path) or protected-only.
7. **Per-order protection fee on a split** — the fee's `min` applies per order, so a 3-shop cart pays 3 minimums; accept, or set a per-group floor rule (default: accept — per-order keeps P5's math untouched).
8. **Copy veto** — all new `fr`/`en` strings (grouped cart, pay-per-order stepper, market-closed notices).

## Verification targets

- `bun test` green across the suites above; `bun run generate:types` clean after the collection changes.
- Flag-off parity: with `multiShopCartEnabled` off and only CM live, every existing int suite (P4 checkout, P5 payments, P7 delivery, P8 resale) passes unmodified, and the CM golden fixtures (quotes, formatted amounts, invoice PDFs, cron effects) are byte-identical pre/post migration.
- The literals guard suite passes with an allowlist small enough to read in one screen.
- A rehearsal market (fake provider, fake country, staging only) goes from `draft` to `live` to a placed-paid-delivered split order **without one code change** — the international rule, demonstrated.
- Ledger reconciliation runs per currency and balances on staging with the rehearsal market active.
- The release record for P10 carries the user's gate list from the table above, in the house release-record format.
