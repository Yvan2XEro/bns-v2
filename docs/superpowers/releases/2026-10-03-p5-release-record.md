# P5 release record — protected payment

## What P5 ships

Protected mobile-money payments for Cameroon's launch market, behind a flag
that defaults off: buyer-side checkout quoting and fee pricing, a payment
intent lifecycle driving `placed → paid → accepted → shipped → delivered →
completed`, release of the seller's funds at completion (or early, for
level-3 shops), a payout batch with provider-transfer tracking, refunds with
a clawback and a 60-day write-off path, nightly reconciliation against the
provider, moderation surfaces, buyer/seller notifications, and the buyer
fee/commission invoices. Every money path reaches the provider through one
port (`MarketplaceProvider`, `lib/payments/marketplaceRegistry.ts`); no
service, route or job imports a concrete adapter. Outside production, and in
production with `PAYMENTS_PROVIDER=fake`, the port resolves to the shared
`FakeMarketplaceProvider` — the only implementation that exists today, by the
user's own hexagonal decision (2026-10-03).

Suite and ceiling numbers at this task's close:

- `packages/api`: `bun run test:int` — **180 files, 3404 tests, 0 failures**
  (up from 3402 at P5's prior close; this task's two int specs account for
  the +2).
- `packages/web`: `bun test` — **571** (unchanged by this task).
- `packages/mobile`: `bun test` — **674** (unchanged by this task).
- `check-types:tests` (packages/api): **105** — held.
- `as never` in `packages/api/tests`: **86** — held.
- `as never` in `packages/web/src`, `packages/mobile/src`, `packages/mobile/app`: **78** — held.
- `packages/mobile` `check-types:advisory`: **35** at P5's prior close, not
  re-measured here — this task touched no mobile file.

All four measured on a quiet tree, with the published commands.

## Hexagonal exclusions — attached to future adapter work

Deliberately out of P5, by the user's decision recorded in the plan's spec
coverage note:

- **The NotchPay adapter itself.** `lib/payments/notchpay.ts` and
  `lib/payments/stripe.ts` exist for P0's boost payments only; neither
  implements `MarketplaceProvider`, and nothing registers one via
  `registerMarketplaceProvider`.
- **The G1–G6 gate evidence.** Six gate rows (`AppSettings.payments.gates`),
  each a staff-recorded attestation that a sandbox milestone against a real
  adapter has been cleared. `beforeChange` refuses enabling
  `protectedPayment` (or a market) without evidence for G1, G2, G4, G5, G6,
  and for G3 as well when `releaseModel` is `provider_hold` — see
  `lib/paymentSettings.ts`'s `missingGates`.
- **The N1–N14 / L1–L7 questions** the spec raised about the real adapter's
  behaviour and the legal reading of a live sandbox pass — unanswered,
  parked with the adapter work.

Two refusals in code hold this line even if someone tries to switch the flag
on early:

- `adapterPresenceRefusal` (`lib/payments/marketplaceRegistry.ts`) refuses to
  let `AppSettings`' `beforeChange` save an enabling change while the named
  market's provider has no registered adapter and `PAYMENTS_PROVIDER=fake`
  is not explicitly set.
- The gate record itself (`missingGates`) refuses the same save while G1–G6
  (G3 conditionally) lack an evidence row.

Both must stay satisfied — by a real adapter and real evidence — before
production enablement is possible. Nothing in this task weakens either.

## Production stance

Production ships with `AppSettings.payments.protectedPayment.enabled =
false`. With the flag off, checkout offers COD only, the seller payments
setup screens say "Coming soon", and intent creation answers
`payment.protectedDisabled` — but webhooks, refunds, payouts and
reconciliation keep running, so flipping the flag off never strands money in
flight (Task 2's own rule, unchanged by this task).

**What staging needs**, once the user decides to run a real pass:

1. Three environment variables on the API service, now threaded into every
   compose file (`docker-compose.yml`, `docker-compose.local.yml`,
   `docker-compose.atlas.yml`, `docker-compose.prod.yml`,
   `deployments/docker-compose/docker-compose.yml`), each `${VAR:-}` next to
   the existing `PAYMENTS_PROVIDER` line: `PAYMENTS_PROVIDER`,
   `NOTCHPAY_PRIVATE_KEY`, `PROTECTED_PAYMENT_ALLOWED`. All three are empty
   by default — production stays off because the values are empty and the
   gate record refuses, never because the wiring is missing.
2. **Fake balances seeded via `FakeMarketplaceProvider#setBalance` before the
   seven-night reconciliation count starts.** The staging rehearsal spec
   (below) does this once, right after the one order it drives has paid out,
   and before its first reconciliation run — seeding late, mid-count, is what
   would make a night read a false mismatch.
3. **Staging webhooks signed by `sharedFakeMarketplace()`** — the one fake
   instance every non-production caller shares (`usesFakeMarketplace`,
   `NODE_ENV !== "production"` or `PAYMENTS_PROVIDER=fake`), so a webhook
   verifies against the same instance that produced it. A real sandbox pass
   replaces this with NotchPay's own signature once the adapter exists.

**The staging-rehearsal int spec is a LOCAL stand-in, not the exit
criterion.** `packages/api/tests/int/staging-rehearsal.int.spec.ts` drives
one order through the real routes and services — onboarding, a mobile-money
checkout, the fake's webhook, delivery, completion, release, a payout batch,
the payout-complete webhook — then runs seven consecutive clean
`reconcileLedger` nights and one deliberately tampered eighth, all against
the in-memory Payload fake every other int spec in this suite uses. It
proves the pipeline and the alarm both work on a quiet, fast, fully
deterministic tree. **The real staging pass — a live sandbox, a live
Payload/Mongo, seven real nights of cron-driven reconciliation — remains the
user's own exit criterion**, not something this spec substitutes for.

## Deploy notes

- **Douala cron schedules are written in UTC.** The scheduler carries no
  timezone, so a job meant to run at 10:00 Africa/Douala (WAT, UTC+1, no DST)
  is scheduled `cron: "0 9 * * *"` — see `payload.config.ts`'s
  `releaseEligibleFundsTask` registration. Reading the cron string as local
  time is the mistake to watch for in any future schedule change.
- **Novu workflow re-sync at deploy.** `packages/api`'s
  `sync:notification-workflows` script (`src/scripts/syncNotificationWorkflows.ts`)
  must run against Novu before P5's payment notifications fire correctly;
  carried over from P4 (`progress.md`: "Run `syncNotificationWorkflows`
  against Novu on deploy"), it is still not wired into the CI deploy
  workflow — a manual or follow-up step each deploy until it is.
- **Pending migrations** include `20261003_000000_p5_invoice_indexes`
  (`packages/api/src/migrations/20261003_000000_p5_invoice_indexes.ts`);
  `bun run migrate` must run before the API serving this code goes live.
- **Meilisearch reindex**, from P4's own carried-forward list (owed since
  P2, twice) — still owed, unrelated to P5's own changes but still blocking
  a clean deploy.

## The user's obligations before launch

### Seller payment terms — legal copy (bilingual, FR/EN)

The seller payment terms must state, in both languages, the refund and
clawback clauses Task 15 actually implemented — drafting the copy is the
user's; what it must say is this:

- **Refund window.** A refund against a paid order's own budget
  (`amounts.total − settlement.refundedAmount`) can be requested for
  **85 days** after the order (`REFUND_WINDOW_DAYS`,
  `services/refunds.ts`).
- **Clawback.** When a seller owes the platform money it cannot recover from
  a completed order's own ledger position (a late or disputed refund after
  the seller's share already paid out), the platform recovers it by taking
  **50% of the destination amount of the seller's next charge**
  (`CLAWBACK_SHARE_BPS = 5_000`), posted as a debit at the provider
  referenced `CB-{orderId}` (`CLAWBACK_REFERENCE_PREFIX`).
- **Write-off.** A receivable still uncollected after **60 days**
  (`RECEIVABLE_WRITEOFF_DAYS`) is written off against the platform's own
  expense account, and the shop is suspended if the daily recovery sweep
  cannot collect or write it off cleanly (`recoverSellerReceivables`'s
  `suspended`/`failed` outcomes).

This is legal copy, not a contract rewrite: it must say exactly what the code
already does, in both languages, before any seller is asked to accept it.

### The 12 user-decision items

Collected during the plan's review, never decided by any task — listed in
full, with one line each, in
`.superpowers/sdd/2026-10-03-p5-protected-payment/final-review.md` §
"User-decision items (collected, not decided)". They are not decided here
either:

- **U-1** `refund.windowExpired`'s copy promises "arranged directly with the
  seller" — must change if a platform-advance refund path is ever enabled.
- **U-2** `payout.accountNameMismatch`'s copy omits the level-3 business-name
  route.
- **U-3** `sheet_cancelRefund` / `sheet_feeRefund` — sentences Task 7 wrote
  itself, never reviewed as copy.
- **U-4** `seller_providerSchedule`'s copy names NotchPay directly — pick
  neutral wording.
- **U-5** English invoice amounts read "XAF 1,410" where the spec's own
  copy says "FCFA 12,500" — the shared formatter also feeds COD invoices.
- **U-6** the placement-time COD fallback gesture: web's picker-with-choice
  vs. mobile's auto-fallback — unify, or keep both.
- **U-7** whether a staff-rejected payout account should notify the seller,
  or leave it to the setup view.
- **U-8** whether the buyer fee invoice should be downloadable on mobile.
- **U-9** whether `holds[]` should gain `amount`/`orderId` later.
- **U-10** order/contract total framing once B-1 lands: goods+delivery with
  the fee as a separate BuyNSellem service line, or `buyerTotal` everywhere.
- **U-11** the hand-rolled PDF writer's library choice at deploy time
  (non-Latin-1 text currently prints `?`), and whether an invoice retaining a
  deleted buyer's name is lawful (L7) — a lawyer question.
- **U-12** spec amendments owed from the review (the buyer-cancel set, the
  `payout_reversed` posting row, the fallback balance formula, and three
  smaller ledger notes) — recorded, not yet written back into the spec.

## Files touched by this task

- `packages/api/tests/int/staging-rehearsal.int.spec.ts` — the staging
  rehearsal (full lifecycle + seven clean nights + one tampered night) and
  the hot-account load test (60 concurrent charge postings on one shop).
- `docker-compose.yml`, `docker-compose.local.yml`, `docker-compose.atlas.yml`,
  `docker-compose.prod.yml`, `deployments/docker-compose/docker-compose.yml`
  — `NOTCHPAY_PRIVATE_KEY` and `PROTECTED_PAYMENT_ALLOWED` threaded next to
  the existing `PAYMENTS_PROVIDER` line, empty by default.
- This file.
