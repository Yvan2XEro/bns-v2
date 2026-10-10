# P10 release record: markets as rows, a multi-shop cart, split checkout

Plan `docs/superpowers/plans/2026-10-09-p10-beyond.md` (Tasks 1-26), spec
`docs/superpowers/specs/2026-10-09-p10-beyond-design.md`. It follows the
NotchPay record (`2026-10-08-notchpay-adapter-release-record.md`) and keeps its
split: everything provable on a quiet tree is built and measured here; the
live half is enumerated below and is the user's, not an exit criterion for
merging. Nothing in this release turns anything on: `multiShopCartEnabled`
ships off, and the only live market is CM.

## What ships

- **Markets are rows** (`markets`, `market-cities`): currency (code, minor
  unit, rounding), per-locale formatting, phone pattern, timezone, VAT rate,
  payment wiring, feature posture, amounts and money calendar. CM is migrated
  in (`migrations/p10Markets.ts`, idempotent) reproducing today's behaviour.
  A new market is a row behind a review gate (`draft` -> `review` -> `live`;
  `live` needs counsel's review filed as evidence, a registered adapter and
  an active city).
- **Money threads from the order's market**: formatting, rounding, ledger
  currency, sequences, calendars and sweeps. The ledger refuses a posting
  whose currency is not its order's.
- **The multi-shop cart and split checkout** (behind `multiShopCartEnabled`):
  up to 5 groups / 30 lines, one order per shop group under one
  `checkoutGroup`, paid order by order, each sibling living its own life.
- **Both clients** render the grouped cart, the "Order k of n" payment
  stepper, grouped purchases and the group screen, money and phone rules from
  the served market config.
- **The literals guard** (`tests/int/market-literals.guard.int.spec.ts`): a
  retired market literal (`XAF`, `FCFA`, `douala`, `+2376`, `Africa/Douala`...)
  outside a one-screen reasoned allowlist fails the build.

## The rehearsal: the international rule, demonstrated

`tests/int/staging-rehearsal.int.spec.ts` (the P5 release idiom) gained the
rehearsal market ZZ: fake currency ZZD (minor unit 2, half-even), fake city
rows, and a `FakeMarketplaceProvider` registered through
`registerMarketplaceProvider` - the same seam a real adapter uses, with the
registry untouched. The suite runs the guard beside it
(`market-literals.guard.int.spec.ts`), and the rehearsal itself scans every
shipped source root for `\bZZD?\b` and finds nothing: no line of `src`
knows the market exists.

What it asserts:

1. **The gate, in order.** draft -> live is refused (`cannot move from draft
   to live`); draft -> review passes; review -> live is refused without
   counsel's evidence and, in a production env, without a registered adapter
   (the refusal sentence names both); with the fake registered and evidence
   filed the market goes live through the collection's own `beforeChange`
   hook.
2. **The storyline.** A three-shop cart is quoted (three groups) and placed
   as three orders under one `checkoutGroup`, all `market-zz`, all ZZD. The
   market's formatting row renders `ZZD 250.00`. Each order is paid in turn
   through `createCheckoutIntent` and the real signed webhook route, which
   resolves its provider through the registry (asserted to be the ZZ fake).
   The group read shows all three paid, each owner accepts, ships and
   delivers their order, the completion sweep, the hold expiry, the payout
   batch and the transfer webhooks run, and every seller bucket is zero in
   ZZD, every ledger account is ZZD, the platform commission is positive and
   `ledgerIntegrity` is balanced.
3. **Contention.** Two buyers racing for the last unit of one variant in a
   split cart: exactly one placement lands (`checkout.stockChanged` for the
   other), nothing leaks, and the winner's idempotency key replayed over the
   same quote answers with the same group and creates nothing. The memory
   server's contention is approximate (it serialises what Mongo would race);
   the live-Mongo leg stays the user's staging pass (below).
4. **Per-currency reconciliation.** A ledger holding XAF and ZZD postings
   reconciles clean (`byCurrency` balances each on its own); a gap planted in
   one ZZD transaction is named by its currency and `runReconciliation` raises
   an `unbalanced_ledger` mismatch.
5. **The flag-off CM parity sweep (the Task 7 goldens, re-compared at
   close).** Every golden amount renders byte-identically through the CM
   format rows and `formatXaf` in both languages; the seeded cities and phone
   pattern equal the literals they replaced; a CM cart quoted flag-off with a
   live ZZ market beside it is still the flat legacy shape in XAF.

Red first: with the ZZ city row and the registration removed from the
fixture, the gate, storyline and contention tests fail (3 red) and the rest
stay green; with the wiring in, the whole file is green (11 tests).

### What the rehearsal found it could not do without code

The "no code change" claim holds for the market row, its formatting,
currency, VAT, calendar, payment wiring, cities and ledger. It does **not**
yet hold end to end for a brand new city key or payment rail, and the
rehearsal says so rather than hiding it:

- **City keys.** Cart orderability (`shopOrderabilityReason`, `orderable.ts`),
  delivery quoting (`isLaunchCityKey` in the zone, flat and registry quotes),
  `orderSettings.launchCities` and the generated `douala|yaounde` select
  enums still enumerate the CM keys. ZZ therefore *borrows* the key
  `yaounde` for its own city row (label "Zedton", ZZ's fee and districts).
  That works only because the CM `yaounde` row is absent from the rehearsal
  world: `marketOfShopCity` picks the first row of a key and does not read
  the shop's country. A genuinely new key is the per-market user gate
  (payload-types enums), and RW end-to-end stays blocked there.
- **Payment rails.** `PAYMENT_CHANNELS` and the dial-code rules in
  `paymentMath` know only `cm.mtn` / `cm.orange`, so ZZ's row carries
  `cm.mtn`. A new operator is an adapter-and-rules work item.
- **Phone.** Server-side delivery-phone validation still enforces
  `DELIVERY_PHONE_PATTERN`; ZZ's buyer uses a CM-shaped number. The row ==
  constant is pinned (`checkout-form-parity`); row-driven validation is a
  named follow-up.
- **Provider id.** `PAYMENT_PROVIDERS` is `["notchpay"]`; the ZZ fake is
  registered under that id. A second real provider is its own adapter task
  with the contract suites.

## Rollout sequencing (the spec dictates it)

1. Migrate with `multiShopCartEnabled` **off**.
2. Verify CM golden parity on staging (same quotes, same formatted strings,
   same cron effects): `market-golden` and the sweep above, then the staging
   click-list below with the flag off.
3. Remove the compat shims **one release later**: `launchCities` (the
   `AppSettings.orders.launchCities` data and `lib/launchCities.ts`
   constants), `payments.markets` (the P5 fallback in `paymentSettings`), and
   the serialize alias. A one-line task each; it is dated, not forgotten.
4. **The user** turns `multiShopCartEnabled` on after the staging rehearsal.
5. New markets are rows behind their review gate - never code.

### Release note: the zombie fix

On first deploy, each market with **no money-sweep stamp** runs its sweep at
once if its local hour has already passed (`marketSweep`'s stamp-guarded
catch-up, commit 62ab460). That is expected: a burst of release / VAT /
reconcile effects on the first hour after migrate is the catch-up, not an
incident. The same release makes payment-first orders skip the confirmation
path and has `expireOrders` sweep confirmed-and-unpaid zombies (776d62a).

## Deploy-time obligations

- Run `migrate` (the P10 migration seeds CM, its cities, the `orders.market`
  and `carts.market` backfills and the sequence counters at the same values).
- Regenerate types (`bun run generate:types`) and commit.
- `bun run build` in `packages/web`: the contracts value import means the
  image build must pass, not just `tsc`.
- Run the smoke spec against Atlas deliberately:
  `bunx vitest run --config ./vitest.config.mts --dir tests/smoke`.
- The P5 and NotchPay obligations stand unchanged (`2026-10-03-p5-release-record.md`,
  `2026-10-08-notchpay-adapter-release-record.md`).
- **Pre-deploy query (the user runs it before deploying).** It lists legacy
  protected orders that were never paid but got past `placed`/`confirmed`:

  ```js
  db.orders.find(
    {
      paymentMethod: "mobile_money",
      paymentStatus: { $nin: ["paid", "refunded", "partially_refunded"] },
      status: { $nin: ["placed", "confirmed", "cancelled"] },
    },
    { orderNumber: 1, status: 1, paymentStatus: 1, shop: 1, "timestamps.placedAt": 1 },
  )
  ```

  An empty result is the expected answer (protected payment was gated off).
  Handle any hit by hand before deploying: an `accepted` hit would be
  cancelled by the first `expireOrders` run (`payment_expired`), but the seller
  may already have handed over the goods; a `shipped` or later hit is not
  touched by any job. From this release, `acceptOrder` refuses an unpaid
  protected order (409 `order.invalidTransition`) and the sweep also selects
  `accepted`+unpaid ones.

## The user's decisions (verbatim from the spec)

1. **Money formatting per market** — approve each market's formatting rows (CM seeds today's vetted `"47 000 FCFA"` / `"XAF 47,000"`).
2. **Which markets to seed beyond CM** — each named country starts its row in `draft` and its regulatory review.
3. **Rounding rule per currency** — XAF stays integer half-up; any decimal-currency market needs its rule chosen.
4. **Per-market amounts** — `minPayout`, `maxOrderAmount`, exposure caps, protection-fee bounds, boost prices, default delivery fee for every new market.
5. **Cart bounds** — confirm 5 groups / 30 lines (M6).
6. **New-market feature posture** — whether a market opens COD-first (the CM path) or protected-only.
7. **Per-order protection fee on a split** — the fee's `min` applies per order, so a 3-shop cart pays 3 minimums; accept, or set a per-group floor rule (default: accept — per-order keeps P5's math untouched).
8. **Copy veto** — all new `fr`/`en` strings (grouped cart, pay-per-order stepper, market-closed notices).

The spec's Gates table adds, all the user's: per-country regulatory review
(counsel's review filed as evidence on the market row), per-market money
formatting, markets to seed, per-market amounts, and the multi-shop cart
rollout. The provider adapter per market is a future work item (contract
suites and a go-live record, as NotchPay did).

### Copy-veto additions for item 8

Beyond the new grouped-cart strings, review these changed ones:

- `disclosure_listingBadge` (the legal line) lost "FCFA".
- Ranges show the unit on both ends.
- Some validation hints lost their unit.
- The generic phone error ("like +CCXXXXXXXXX").
- The grouped `acceptTerms` rewording.
- `payNoCode`.

## Open items and carries

- Server phone validation still enforces `DELIVERY_PHONE_PATTERN` (row ==
  constant pinned; row-driven validation is a named follow-up).
- Web shipment-tracking `DELIVERY_TIMEZONE` and three mobile date sites
  (`SellerShipmentActions`, `TrackingBlock`, `purchases/[id]/reschedule`) are
  allowlisted until the served config carries a timezone.
- api `formatXaf` survives for SMS, chat, receipts and pre-snapshot documents
  (allowlisted by name; removed with the compat release).
- NotchPay balances are read at XAF only (`value.XAF` is the provider's
  balance key) until a second payout market.
- The generated `douala|yaounde` enums are the per-market user gate; RW (and
  any new city key) stays blocked end to end there, together with the
  `isLaunchCityKey` call sites listed above and the first-row-of-a-key
  behaviour of `marketOfShopCity`.
- The check that binds an `idempotencyKey` to its `quoteHash` is carried as an open item for the user's review.
- Live-Mongo contention for the split placements and the idempotency replay
  (the memory server only approximates it) is the user's staging pass.
- Compat shims removal, one release after this one (step 3 above).
- **Notification amounts carry no currency (gate on a second live market).**
  The Novu workflow copy in `api/src/scripts/syncNotificationWorkflows.ts`
  (order placed, commission invoice, weekly insights) prints
  `{{payload.total}} FCFA` / `XAF`, and `services/orders/notifications.ts`
  (`notifyOrderPlaced` and its seller SMS fallback) sends the raw
  `order.amounts.total` with no currency. Every non-XAF order would be notified in FCFA. Before a second
  market goes live, thread a pre-formatted amount (or the currency) into these
  payloads and re-sync the workflows. The literals guard allows only those
  template lines by needle.

## Staging script: the T20 reviewer's click-list (verbatim)

Flag-on cart with several groups incl. one resale and one unavailable;
per-group delivery option change re-quotes and resets acceptance; bad address
refusal; the quoteChanged 409; mobile-money: place → stepper "Order 1 of n" →
pay → pending → back to stepper, the NotchPay callback landing WITHOUT ?g=,
one sibling expired beside a paid one; COD per-order confirmation + code;
purchases grouped header + link; flag-off legacy whole.

Run it twice: with the flag off first (the legacy whole must be byte-for-byte
P8), then on. Then the live-Mongo contention leg: two real sessions
checking out a cart sharing a last-unit variant, and a replayed
`idempotencyKey`.

## Gates at close

- `packages/api` `vitest run` (the `test:int` config): **321 files (320 run, 1
  skipped), 4636 passed, 12 skipped, 0 failures**. The skips are the
  env-gated live NotchPay sandbox spec.
- The rehearsal file alone: 11 passed (4 P5 + 7 P10), run together with the
  literals guard, `market-golden` and `ledger-currency`: 32 passed.
- Root `bun run check-types`: green.
- Ceilings, with the AGENTS.md commands, re-measured on the quiet main tree
  at close: `check-types:tests` **100** (at the mark); api tests
  `grep -ro 'as never'` **86** (at the mark — the rehearsal worktree's 88
  was two test-fixture casts Task 23 had introduced; they were retyped and
  removed at close, commit `794c9e3`); client casts **77** (at the mark);
  mobile advisory **31** with a fresh `.expo/types/router.d.ts` (ceiling 35).
  Republished at 100/86/77/35.
