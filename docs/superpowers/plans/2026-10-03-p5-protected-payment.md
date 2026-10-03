# P5 Protected Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a buyer pay a verified shop by mobile money with the seller paid only after delivery — a licensed provider collects into the seller's connected account, BuyNSellem receives only its application fee, mirrors every provider fact in a double-entry ledger, and reconciles it nightly. All of it ships behind a flag whose enablement is refused until the spec's gate record is complete.

**Architecture: hexagonal, by the user's explicit decision (2026-10-03).** The whole domain — intents, ledger, holds, release, refunds, reconciliation — is built against the `MarketplaceProvider` **port** and a deterministic fake. **No concrete payment adapter is built in this phase**: the user does not yet know which provider(s) or terms will exist, so nothing here depends on NotchPay's answers, the lawyer's answers, or any gate. A registry returns the fake outside production and refuses cleanly in production until a real adapter is registered (a later, separate work item). A port **contract spec** pins the semantics every future adapter must pass. The spec's gates and its N/L question list stay attached to that future adapter work, not to this build. Ten new collections mirror provider state; `services/ledger.ts` is the only writer of an append-only double-entry mirror; P4's order transition service is untouched and consumed through its event registry; every provider call happens after commit, driven by jobs on a new `payments` queue.

**Tech Stack:** Payload CMS 3.79 + MongoDB transactions (`packages/api`), NotchPay Sync (public key + new `X-Grant` private key), Next.js 16 (`packages/web`), Expo SDK 57 (`packages/mobile`), Novu, vitest for the API (`bun run test:int` — never `bun test` there), `bun test` for both clients.

**Spec:** `docs/superpowers/specs/2026-09-15-p5-protected-payment-design.md` — the binding authority for every domain rule. Its gates (G1–G6) and "Questions to send" tail (N1–N14, L1–L7) belong to the future adapter work and to production enablement; **nothing in this plan waits on them**. Where the spec names NotchPay mechanics (header names, event spellings, `X-Grant`), this plan builds the normalised side only.

## Global Constraints

Copied from the spec and AGENTS.md; every task's requirements implicitly include this section.

- **Hexagonal, strictly.** No service, route, job or test imports a concrete payment adapter; everything reaches the provider through `getMarketplaceProvider(settings)` from `lib/payments/marketplaceRegistry.ts`. Outside production (`NODE_ENV !== "production"` or `PAYMENTS_PROVIDER=fake`) the registry returns the shared `FakeMarketplaceProvider`; in production with no adapter registered, every money path answers `payment.providerUnavailable` and the flag cannot be enabled. The port's semantics live in one **contract spec** (Task 12) that runs today against the fake and tomorrow against any real adapter unchanged.
- **Everything behind the flag.** `AppSettings.payments.protectedPayment.enabled` defaults `false`; `beforeChange` refuses enabling it (or a market) unless gates G1, G2, G4, G5, G6 each have an evidence row AND the env `PROTECTED_PAYMENT_ALLOWED=true` is set; `releaseModel: provider_hold` additionally requires G3. With the flag off: checkout offers COD only, setup screens say "Coming soon", intent creation answers `payment.protectedDisabled` — but webhooks, refunds, payouts and reconciliation keep running, so turning the flag off never strands money in flight.
- **Money is integers in XAF.** `roundXaf(x) = Math.floor(x + 0.5)`. `applicationFee = commission + commissionVat + buyerProtectionFee`; `destinationAmount = orderTotal − commission − commissionVat`; `applicationFee + destinationAmount = buyerTotal` always (property-tested). Destination charges use **fixed amounts, never `application_fee_percent`**, so the ledger is exact.
- **The ledger is a mirror, and `services/ledger.ts` is its only writer.** Append-only; every posting balanced (Σdebit = Σcredit, validated before insert); duplicate `idempotencyKey` returns the existing transaction without error; posting and balance `$inc` share one MongoDB transaction; every posting is caused by a stored `webhook-events` row, a reconciliation run, or an `order-events` row — no route or admin action creates one. Balances are never shown to users as a wallet.
- **Single writers stay single.** P4's `applyTransition` remains the only writer of order status/paymentStatus (P5 drives it through the existing service functions and the `registerOrderEventHandler` registry); `services/stock.ts` the only stock writer; `transitions.ts` the only creator of `order-events` (a source scan pins this — extend it, don't fight it).
- **Provider calls after commit.** Multi-document writes in one Payload transaction with the audit/log entry inside it; `createDestinationCharge`, `createRefund`, `releasePayout` and every other provider call happen after commit, via `onCommit` or a queued job. All provider calls: 15 s timeout; network failure or 5xx → `payment.providerUnavailable`.
- **Idempotency everywhere money moves.** Intent creation by `Idempotency-Key` header; refunds by `{sourceType}:{sourceId}:{sequence}`; ledger by `{sourceType}:{sourceId}:{kind}`; webhook events by provider event id (P0's `webhook-events` row); a replayed webhook produces one row and one posting.
- **Error codes once, translated twice.** Declared in `packages/api/src/lib/errors.ts`, FR/EN in `packages/web/messages/*` (`ApiErrors` namespace) and `packages/mobile/src/locales/*` (`apiErrors`), with the parity specs extended. The 21 new codes are listed in the contracts section.
- **International rule.** Cameroon is the launch market, not the product (user, 2026-10-03). Every country value goes through `payments.markets` (currency, VAT, provider, channels) or existing settings — **no new hard-coded country constant**. Operator phone prefixes for `cm.mtn`/`cm.orange` live in one exported table in `lib/paymentMath.ts` keyed by channel, beside the market row that names the channels.
- **i18next vs next-intl:** mobile interpolation is `{{x}}`, web is `{x}`. Legal/disclosure copy ships bilingual in the same change; the spec's disclosure sentences are quoted verbatim in Task 7 and used exactly.
- **Compose files:** `NOTCHPAY_PRIVATE_KEY` and `PROTECTED_PAYMENT_ALLOWED` enter **all four** compose files, including `deployments/docker-compose/docker-compose.yml` (the one the deploy workflow actually runs).
- **Ceilings (AGENTS.md):** `check-types:tests` ≤ 105; `as never` in `packages/api/tests` ≤ 86; client casts ≤ 78; mobile advisory ≤ 35 with fresh router types. None may rise; measure with the published commands on a quiet tree.
- **Runners:** `packages/api` is vitest via `bun run test:int`; web and mobile are `bun test`; `bun run generate:types` after any collection change, committed with it.
- **Assert a value, not an absence of complaint.** Counting, exact shapes, whole-object `toEqual` for wire shapes; secrecy assertions paired with positive ones.

## Review Focus

The five failure modes the spec implies that no single task's tests would otherwise exercise, most likely first. Each line's pinning test is assigned to the owning task.

1. **A late provider success must never pay twice or strand money.** Success on an `expired`/`cancelled` intent keeps the terminal status, sets `lateSuccess`, posts the `charge` (money moved), and triggers exactly one `late_payment` refund — and a *second* delivery of that success does nothing more. → Task 14's replay matrix.
2. **Out-of-order webhooks.** `transfer.complete` before `transfer.created`; `refund.complete` before `refund.created`; `payment.succeeded` arriving after the callback already settled: one state, one posting, no error loops. → Task 17's out-of-order block.
3. **A hold racing the release job.** A `payout-holds` row created in the same minute `releaseEligibleFunds` runs must keep that order's amount out of the batch — the job re-checks holds inside its per-shop transaction, not only in its selection query. → Task 16.
4. **Partial refund after release eligibility.** A refund that lands between `completed` and the payout batch must shrink D′ (and C′) so the payout never exceeds what the provider still holds. → Task 16 + Task 8's D′/C′ property test.
5. **Self-purchase by phone.** The payer phone matching the shop's verified phone or any member's verified phone refuses `payment.selfPurchase` even when the buyer account is a stranger. → Task 13.

## Current state (re-verified 2026-10-03 — the spec's own list is a year of work stale)

- P0–P4 are implemented and green (API 155 files / 2694 tests). `payment-intents` exists with `purpose: boost|commission`, `targetType: boost-payment|commission-invoice`, a settlement service (`services/payments.ts`: `createPaymentIntent`, `findIntentByIdempotencyKey`, `settleIntent` with `statusHistory` and monotonic transitions, `INTENT_TTL_MS`).
- `lib/payments/types.ts`: `PaymentProvider` has `createPayment`, `verifyWebhook`, `parseWebhookEvent`, `verifyPayment`. No marketplace method, no `X-Grant` anywhere, no `NOTCHPAY_PRIVATE_KEY` env var.
- Webhooks: only `api/public/boost/webhook/notchpay` + `api/public/boost/callback` exist; `processWebhookEvent` job exists (P0) with no entity dispatch.
- `AppSettings` groups: `auth`, `sms`, `orders` (with `vatRateBps` the market validation must agree with). No `payments` group.
- P4 gives: `applyTransition` + `registerOrderEventHandler`/`queueOrderEvent` (attempt-1 inline, failed handlers retried via the `dispatchOrderEvent` job); `expireOrders` already cancels `mobile_money` orders unpaid after 30 min with `payment_expired` (asserted by its "leaves a mobile_money order alone in P4" test, which P5 Task 14 flips); `paid` is a reserved status whose transitions are refused (`RESERVED_STATUSES` — P5 Task 13/14 unreserve `placed → paid` and `paid → accepted|cancelled`); `nextInvoiceNumber(series, at)` in `services/sequences.ts`; `shopCapabilities` with `protectedPayment` (level 2) and `fasterPayouts` (level 3) capability flags; the action tables + parity specs in both clients; `orderAccess`, `can()` matrix, `moderationRoute` idiom, P2 private storage, P4 invoice renderer.
- The clients: checkout flow built for COD (web `app/checkout/*`, mobile `app/checkout/*` with its own layout), `/purchases/[id]` and order screens on both, seller hub tiles, `useCheckout` hooks with `idempotencyKey` already in the place input, `ApiError` carrying `details` (web) / `data` (mobile).

## File structure

New, `packages/api/src/`:
- `lib/paymentMath.ts` (+ test) — fee/VAT/split arithmetic, `roundXaf`, channel phone prefixes.
- `lib/nameMatch.ts` (+ test) — normalisation + Jaro-Winkler + match verdicts.
- `lib/payments/marketplace.ts` — `MarketplaceProvider` interface + normalised shapes (the port).
- `lib/payments/marketplaceRegistry.ts` — `getMarketplaceProvider(settings)`: the fake outside production, a clean refusal in production until an adapter registers. **No concrete adapter in this phase.**
- `lib/payments/fakeMarketplace.ts` — the deterministic double every service spec uses, and the first implementation the port contract spec runs against.
- `collections/`: `ConnectedAccounts.ts`, `PayoutAccounts.ts`, `Refunds.ts`, `Payouts.ts`, `PayoutHolds.ts`, `LedgerAccounts.ts`, `LedgerTransactions.ts`, `BuyerFeeInvoices.ts`, `ReconciliationRuns.ts`, `ReconciliationMismatches.ts`.
- `services/`: `connectedAccounts.ts`, `payoutAccounts.ts`, `payoutHolds.ts`, `checkoutPayment.ts` (named so because P4 owns `services/checkout.ts`), `refunds.ts`, `payouts.ts`, `ledger.ts`, `reconciliation.ts`.
- `jobs/`: `submitRefund.ts`, `syncConnectedAccount.ts`, `releaseEligibleFunds.ts`, `expirePayoutHolds.ts`, `recoverSellerReceivables.ts`, `reconcileLedger.ts`.
- Routes under `app/(frontend)/api/`: `shops/[id]/payments/onboarding`, `shops/[id]/payments/setup`, `shops/[id]/payout-accounts` (+ `/[accountId]/not-me`), `orders/[id]/payment-intents`, `orders/[id]/payment`, `public/payments/webhook/notchpay`, `public/payments/notchpay/callback`, `moderation/shops/[id]/payouts`, `staff/finance/vat`, `staff/finance/reconciliation`.

Modified: `globals/AppSettings.ts` (the `payments` group), `collections/PaymentIntents.ts` and `Orders.ts` and `CommissionInvoices.ts` and `ModerationLog.ts` (extensions), `lib/errors.ts`, `services/payments.ts` (checkout dispatch), `services/moderation.ts` (payout holds + suspend hook), `jobs/processWebhookEvent.ts` (entity dispatch), `jobs/index.ts` + `payload.config.ts` (new tasks + `payments` queue — **Task 20 is sole owner of both**), `scripts/syncNotificationWorkflows.ts`, `hooks/notificationEvents.ts`, the four compose files, both clients' locales, hooks, screens and parity specs.

## API contracts

The wire shapes clients build against. The serialisers must produce these exactly (P4's drift lesson: pin each whole object with `toEqual`).

```ts
// GET /api/shops/{id}/payments/setup  (owner/manager; staff)
interface PaymentSetupView {
  flagEnabled: boolean;              // market + global flag, so "Coming soon" is server-decided
  eligible: boolean;                 // level 2 + shop active
  ineligibleReason: null | "level" | "shopStatus" | "market";
  connectedAccount: null | {
    status: "created" | "onboarding" | "restricted" | "active" | "disabled" | "deauthorized";
    chargesEnabled: boolean; payoutsEnabled: boolean;
    requirementsDue: string[];       // provider keys, displayed verbatim
    lastSyncedAt: string | null;
  };
  payoutAccount: null | {            // the active row
    method: "mtn_momo" | "orange_money" | "bank";
    accountName: string; accountNumberMasked: string;
    status: "pending_verification" | "pending_review" | "active" | "rejected" | "replaced";
    activatedAt: string | null;
  };
  pendingAccount: null | { method: string; accountNumberMasked: string; status: string };
  holds: Array<{ scope: "shop" | "order"; reasonCategory: "security" | "review" | "operations";
                 until: string | null }>;   // category only — never the fraud rule (spec)
  changeCooldownUntil: string | null;
}

// POST /api/orders/{id}/payment-intents  — header Idempotency-Key: <uuid>
// body { channel: "cm.mtn" | "cm.orange", phone: string }
interface PaymentIntentResponse {
  intentId: string;
  status: "created" | "pending";
  expiresAt: string;                 // intent expiry (30 min from order placement window rules)
  channel: string;
  attempt: number;                   // 1–3
  attemptsLeft: number;
  instructions: string | null;       // provider action text; client copy when null
}

// GET /api/orders/{id}/payment  (buyer or shop member)
interface PaymentStatusView {
  orderPaymentStatus: string;        // P4's paymentStatus
  intent: null | {
    id: string; status: string; channel: string;
    failureCode: null | "declined" | "insufficient_funds" | "timeout" | "limit_exceeded"
               | "invalid_number" | "provider_error";
    expiresAt: string; attempt: number; attemptsLeft: number;
  };
}

// GET /api/shops/{id}/payments  (owner/manager; staff) — the seller payments screen
interface SellerPaymentsView {
  amounts: {                          // from ledger balances, labelled per spec
    awaitingDelivery: number;         // seller_pending
    inWithdrawalPeriod: number;       // seller_pending share of delivered-not-completed (derived)
    readyForPayout: number;           // seller_releasable (provider_hold only; null on schedule)
    payoutInTransit: number;          // seller_payout_in_transit
    paidThisMonth: number;            // sum of complete payouts this calendar month, Africa/Douala
    currency: "XAF";
  };
  payouts: Array<{ id: string; date: string; amount: number; fee: number;
                   destinationMasked: string; status: string }>;
  orders: Array<{ orderId: string; orderNumber: string; goods: number; delivery: number;
                  commissionHt: number; vat: number; netToYou: number;
                  status: string; releaseDate: string | null }>;
  holds: PaymentSetupView["holds"];
}

// POST /api/shops/{id}/payout-accounts  (owner only)
// body { method, accountName, accountNumber } → 201 with the row (masked) or:
//   payout.accountInvalid | payout.accountNameMismatch | payout.accountChangeCooldown
//   | payout.methodUnavailable | payment.shopNotEligible

// POST /api/moderation/shops/{id}/payouts
// body { action: "hold" | "release" | "approve_account" | "reject_account", ... } per spec
```

New error codes (21 — Task 1 declares all, both clients translate all):
`payment.protectedDisabled`, `payment.marketUnavailable`, `payment.shopNotEligible`, `payment.orderNotPayable`, `payment.attemptInProgress`, `payment.tooManyAttempts`, `payment.channelUnsupported`, `payment.amountTooHigh`, `payment.selfPurchase`, `payment.declined`, `payment.insufficientFunds`, `payment.timeout`, `payment.limitExceeded`, `payment.expired`, `payout.ownerOnly`, `payout.methodUnavailable`, `payout.accountInvalid`, `payout.accountNameMismatch`, `payout.accountChangeCooldown`, `payout.onboardingIncomplete`, `payout.holdActive`, `refund.amountExceeds`, `refund.notRefundable`, `refund.windowExpired` (24 — the three `refund.*` included).

## Task dependency structure

- Wave 1: Task 1 (error contract).
- Wave 2 (parallel): Tasks 2, 3, 4, 5.
- Wave 3 (parallel): Tasks 6, 7 (6 consumes 2–5's names; 7 consumes 1).
- Wave 4 (parallel): Tasks 8, 9, 10, 11, 12 (all consume 5's interface + 6's collections; 12 — the registry and the port contract spec — also 2).
- Wave 5 (parallel): Tasks 13, 15, 16 then 14, 17 (14 consumes 13; 17 consumes 14, 15, 16).
  Dispatch 13, 15, 16 together; 14 when 13 lands; 17 when 14–16 land.
- Wave 6 (parallel): Tasks 18, 19, 21, 22; Task 20 last in the wave (sole owner of `jobs/index.ts` + `payload.config.ts`).
- Wave 7: Task 23 (backend checkpoint).
- Wave 8 (parallel): Tasks 24, 25, 26 (web).
- Wave 9 (parallel): Tasks 27, 28; Task 29 last (mobile `_layout.tsx` sole owner).
- Wave 10: Task 30 (staging/release — mostly the user's).

## Wave 1 — the error contract

### Task 1: The 24 error codes in all three packages

**Files:**
- Modify: `packages/api/src/lib/errors.ts`, `packages/web/src/lib/apiError.ts`, `packages/mobile/src/lib/apiError.ts`, `packages/web/messages/{fr,en}.json` (`ApiErrors` namespace), `packages/mobile/src/locales/{fr,en}.json` (`apiErrors`).
- Test: extend `packages/api/tests/int/error-codes.int.spec.ts` and `error-codes-parity.int.spec.ts`.

**Interfaces:**
- Produces: the 24 codes listed in this plan's contracts section, grouped `payment.*` (14), `payout.*` (7), `refund.*` (3), each with an English fallback sentence in all three files and FR/EN translations in both clients.
- Consumes: the existing parity spec, which already compares the three files — the new codes must enter all three or it goes red, which is the point.

- [ ] **Step 1: run the parity spec red** by adding the codes to `lib/errors.ts` alone. Expected: the parity spec names every missing client entry.
- [ ] **Step 2: add the codes + fallbacks to both clients and the translations to all four locale files.** Mobile interpolation `{{x}}`; web `{x}`. Fallback sentences are user-facing: write them the way the P4 codes read (plain, actionable — e.g. `payment.attemptInProgress`: "A payment attempt is already in progress. Approve it on your phone or wait a moment."). French translations accented (these are app strings, not SMS).
- [ ] **Step 3: run green** — `bun run test:int -- error-codes` in `packages/api`, `bun test` in both clients (their locale key/parity gates).
- [ ] **Step 4: mutation** — remove one mobile translation → the parity gate names it. Restore.
- [ ] **Step 5: commit** — `feat(payments): declare P5's error contract once and prove the three copies agree`

## Wave 2 — settings, pure money math, the provider seam

### Task 2: `AppSettings.payments`, the gate record and `resolveSettlement`

**Files:**
- Modify: `packages/api/src/globals/AppSettings.ts`
- Create: `packages/api/src/lib/paymentSettings.ts`
- Test: `packages/api/tests/int/payment-settings.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `getPaymentSettings(payload): Promise<PaymentSettings>` (fail-closed like `getOrderSettings`: unreadable global → everything disabled) and `resolveSettlement(settings, countryCode): MarketRow` (throws `ServiceError(payment.marketUnavailable, 400)`); the `payments` group with exactly the spec's defaults: `protectedPayment.enabled: false`, `releaseModel: "provider_hold"`, `markets: [CM row {currency: "XAF", provider: "notchpay", settlementMode: "provider_split", channels: ["cm.mtn","cm.orange"], vatRateBps: 1925, enabled: false}]`, `buyerProtection: {bps: 300, min: 100, max: 15000}`, `checkoutExpiryMinutes: 30`, `payoutAccountChangeHoldHours: 72`, `minPayout: 1000`, `maxOrderAmount: 1000000`, `exposureCaps: {level2: 500000, level3: 2000000}`, `earlyRelease: {enabled: false}`, `providerFeeBearer: "platform"`, `gates: []` (array of `{gate: "G1".."G6", clearedAt, clearedBy, evidence (upload, P2 private storage), note}`).
- Produces also: the `GET /api/public/config` route extended with `protectedPaymentEnabled` (global flag AND the caller's market enabled), `buyerProtection` and `checkoutExpiryMinutes` — the one place both clients learn the flag, so "Coming soon" is server-decided.
- Consumes: P4's `AppSettings.orders.vatRateBps` for the cross-validation.

- [ ] **Step 1: failing tests** (vitest, fakePayload `globals` seeding like `order-settings.int.spec.ts`):
- `fails closed when the global is unreadable or the group absent` (enabled false, markets empty).
- `seeds nothing and reads the CM defaults when the admin saved none` (every default above asserted by value).
- `resolveSettlement returns the CM row and throws payment.marketUnavailable for "NG"`.
- `beforeChange refuses settlementMode direct_to_seller and platform_collects` with the spec's reason strings in the error.
- `beforeChange refuses enabling protectedPayment without gate evidence rows` — gates G1,G2,G4,G5,G6 each need a row with `evidence`; G3 additionally when `releaseModel` is `provider_hold`.
- `beforeChange refuses enabling without PROTECTED_PAYMENT_ALLOWED=true in the env` (test sets/unsets `process.env`).
- `beforeChange refuses a market vatRateBps different from orders.vatRateBps for the same country` — the spec's COD/protected invoice-divergence guard.
- `public config answers protectedPaymentEnabled false until everything is on` (flag, market, gates, env — one case flipping each last).

- [ ] **Step 2–3: implement, run green.** The gate check lives in the global's `beforeChange` hook; the reason strings name the missing gate ids so an admin knows what to file.
- [ ] **Step 4: mutations** — drop the env check → its test red; drop the VAT cross-check → its test red. Restore each.
- [ ] **Step 5:** `bun run generate:types`, commit both — `feat(payments): the payments settings group, its gate record and the market resolver`

### Task 3: `lib/paymentMath.ts` — the split arithmetic

**Files:**
- Create: `packages/api/src/lib/paymentMath.ts`
- Test: `packages/api/tests/int/payment-math.int.spec.ts` (**new**)

**Interfaces:**
- Produces, all pure: `roundXaf(x)` (= `Math.floor(x + 0.5)`); `commissionVatOf(commission, vatRateBps)`; `buyerProtectionFee(orderTotal, {bps, min, max})` (clamped, TTC); `buyerProtectionFeeVat(fee, vatRateBps)` (= `fee − roundXaf(fee × 10000 / (10000 + vatRateBps))`); `splitAmounts({orderTotal, commission, vatRateBps, protection}): {commission, commissionVat, buyerProtectionFee, buyerProtectionFeeVat, applicationFee, destinationAmount, buyerTotal}`; `CHANNEL_PHONE_PREFIXES: Record<"cm.mtn" | "cm.orange", readonly string[]>` and `phoneMatchesChannel(phone, channel)` — the operator prefix table lives here and nowhere else (international rule: keyed by channel, extended by data when new markets come).
- Consumes: nothing. P4's `roundXaf` twin, if one exists in `orderMath.ts`, is re-exported, not duplicated — check first.

- [ ] **Step 1: failing tests:**
- `roundXaf` half-up at `.5` boundaries (0.5→1, 1.5→2, −0.5 not an input: amounts ≥ 0).
- fee clamp at min (small order → 100) and max (orderTotal 10,000,000 hypothetical → 15,000) and the 3% midband by exact value (orderTotal 50,000 → 1,500).
- `buyerProtectionFeeVat(1500, 1925)` asserted by exact value (TTC→HT extraction: 1500 − roundXaf(1500×10000/11925) = 1500 − 1258 = 242).
- **property test, 1,000 random orders** (`fast-check` if present, else a seeded loop): `applicationFee + destinationAmount === buyerTotal`, every component integer ≥ 0, `destinationAmount ≤ orderTotal`.
- `phoneMatchesChannel` per prefix table, plus a `+2372` landline refused for both channels.
- [ ] **Step 2–4: implement, green, mutations** — change the clamp order (max before min) → the min case red; change `roundXaf` to `Math.round` → the half-up boundary case stays green (same semantics for positives — pick a case that distinguishes: `Math.round(-0.5)` differs but amounts are ≥0, so instead mutate to `Math.floor` → the .5 case red). Restore.
- [ ] **Step 5: commit** — `feat(payments): the split arithmetic, fee clamp and channel prefixes`

### Task 4: `lib/nameMatch.ts` — the payout name match

**Files:**
- Create: `packages/api/src/lib/nameMatch.ts`
- Test: `packages/api/tests/int/name-match.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `normalizeName(s)` (NFKD, strip diacritics, upper case, strip punctuation, tokens sorted); `jaroWinkler(a, b): number` (implemented here — no new dependency); `nameMatch({candidate, identityName, businessName?, providerName?}): {result: "match"|"partial"|"mismatch", score}` per the spec: match = every token of the shorter name (≥ 2 tokens) in the other, or JW ≥ 0.92 on sorted-token strings; partial = at least one surname token matches; else mismatch. When `providerName` is present it must also match or the verdict caps at `partial` (the typed name alone never activates).
- Consumes: nothing.

- [ ] **Step 1: failing tests:** exact match; reordered tokens; diacritics (`"NGONO Désiré" vs "Desire Ngono"` → match); one-token-only candidate → never `match` (the ≥2 rule); one surname token shared → partial; nothing shared → mismatch; business name accepted as the identity side; providerName present and disagreeing → partial even when the typed name matches; JW threshold edge (a pair scoring just under .92 → not match by that route).
- [ ] **Step 2–4: implement, green, mutation** — drop the ≥2-token floor → the one-token case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): the payout account name match`

### Task 5: The `MarketplaceProvider` seam and its fake

**Files:**
- Create: `packages/api/src/lib/payments/marketplace.ts`, `packages/api/src/lib/payments/fakeMarketplace.ts`
- Test: `packages/api/tests/int/fake-marketplace.int.spec.ts` (**new**)

**Interfaces:**
- Produces: the `MarketplaceProvider` interface exactly as the spec's Provider interface block (createConnectedAccount, createOnboardingLink, getConnectedAccount, setPayoutSchedule, createDestinationCharge, chargeMobileMoney, verifyPayment, releasePayout, createRefund, getRefund, getTransfer, debitConnectedAccount, listTransactions, getConnectedAccountBalance, verifyWebhook); `NormalisedEvent` extending P0's `NormalizedWebhookEvent` with `entity: "payment"|"refund"|"transfer"|"account"|"debit"`, `accountId?`, `refundId?`, `transferId?`, `fee?`, `amount?`, `currency?`; `NormalisedAccount`, `NormalisedRefund`, `NormalisedTransfer`, `NormalisedTransaction` shapes; `ProviderCapabilityError`.
- Produces: `FakeMarketplaceProvider` — deterministic, in-memory, used by **every** service spec in waves 4–6: scripted outcomes per reference (`fake.script("ref", [...events])`), a call journal (`fake.calls`), `emit(event)` to drive webhook-shaped flows, and failure injection (`fake.failWhen(method)`), mirroring `fakePayload`'s idiom.
- Consumes: P0's `NormalizedWebhookEvent` from `lib/payments/types.ts`.

- [ ] **Step 1: failing tests** for the fake itself (the services' single test double must be trustworthy): a scripted charge returns its reference and the journal records the exact input; `failWhen("createRefund")` rejects; emitted events round-trip through `verifyWebhook`.
- [ ] **Step 2–4: implement, green, mutation** — make the journal drop the input → the exact-input case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): the marketplace provider seam and its deterministic fake`

## Wave 3 — the schema and the clients' vocabulary

### Task 6: Ten collections, four extensions, the generated types

**Files:**
- Create: `packages/api/src/collections/ConnectedAccounts.ts`, `PayoutAccounts.ts`, `Refunds.ts`, `Payouts.ts`, `PayoutHolds.ts`, `LedgerAccounts.ts`, `LedgerTransactions.ts`, `BuyerFeeInvoices.ts`, `ReconciliationRuns.ts`, `ReconciliationMismatches.ts`
- Modify: `collections/PaymentIntents.ts` (purpose `checkout`, targetType `order`, the 8 new fields incl. `payerPhone` with `read` restricted to customer+staff and the P0 anonymiser extended), `collections/Orders.ts` (the `settlement` group + the `amounts` additions, all service-written), `collections/CommissionInvoices.ts` (`settlement: mobile_money | application_fee`), `collections/ModerationLog.ts` (actions `payout.hold`, `payout.release`, `payout.account_approve`, `payout.account_reject`), `payload.config.ts` (register the ten — the one exception to Task 20's ownership, coordinated by dispatch order: Task 6 lands first in its wave).
- Test: `packages/api/tests/int/payment-collections.int.spec.ts` (**new**)

**Interfaces:**
- Produces: every field, option list, uniqueness and access rule from the spec's Data model tables, verbatim — field names and enum values are the contract later tasks compile against. `LedgerTransactions`: `create/update/delete` closed to everyone (service writes with `overrideAccess` only); `entries` validated balanced in a `beforeValidate` hook as defence-in-depth (the service validates first). `PayoutAccounts.accountNumber` field-level `read` owner+staff; `accountNumberMasked` service-written.
- Consumes: Task 2's settings names (for doc comments), nothing at runtime.

- [ ] **Step 1: failing tests:** per collection one access matrix case (owner/manager/staff/stranger read; every client write refused); `ledger-transactions` rejects an unbalanced `entries` array at the collection layer; `payout-accounts` uniqueness of one `active` per shop is **not** a collection rule (the service owns it — assert the collection allows two so the service test in Task 10 means something); `payment-intents` accepts `purpose: checkout` with `targetType: order`; P0's account-deletion anonymiser nulls `payerPhone` (extend its existing spec).
- [ ] **Step 2–4: implement, `bun run generate:types`, green.**
- [ ] **Step 5: commit** — `feat(payments): the ten payment collections and the four extensions`

### Task 7: Both clients' payments vocabulary and every P5 translation

**Files:**
- Create: `packages/web/src/lib/payment-status.ts` (+ test), `packages/mobile/src/lib/paymentStatus.ts` (+ test)
- Modify: `packages/web/messages/{fr,en}.json`, `packages/mobile/src/locales/{fr,en}.json` — new namespaces `Payments` (web) / `payments` (mobile): checkout pay/pending/failed copy, seller payments screen, setup steps, holds categories, the disclosure sentences **verbatim from the spec** (listing badge, method choice, summary sheet, "Your payment is collected and held by NotchPay, a payment provider. BuyNSellem never holds your money."), per-`failureCode` sentences, per-channel instruction copy.
- Test: the key gates already scan; extend `packages/api/tests/int/error-codes-parity.int.spec.ts`'s family only if a new cross-package list appears.

**Interfaces:**
- Produces: `PAYMENT_INTENT_STATUSES`, `PAYOUT_STATUSES`, `REFUND_STATUSES` label maps (explicit maps — no `t(\`ns.${variable}\`)`, the gate cannot see through it); `holdReasonCategory(reason): "security"|"review"|"operations"` mirrored in both clients (the spec: the owner sees the category, never the fraud rule).
- Consumes: Task 1's codes.

- [ ] **Step 1: failing tests:** each label map covers exactly its enum (import the API's option lists where a parity spec idiom exists — follow `order-actions-parity`'s style with a new `payment-vocab-parity.int.spec.ts` in the API comparing the two clients' maps cell for cell); `holdReasonCategory` total over the 8 reasons.
- [ ] **Step 2–4: implement, green, mutation** — drop one mobile label → the parity spec names it. Restore.
- [ ] **Step 5: commit** — `feat(clients): the payments vocabulary and every P5 translation`

## Wave 4 — the domain services on the port

### Task 8: `services/ledger.ts` — the double-entry mirror

**Files:**
- Create: `packages/api/src/services/ledger.ts`
- Test: `packages/api/tests/int/ledger.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `postLedger(req, {kind, occurredAt, sourceType, sourceId, order?, shop?, paymentIntent?, refund?, payout?, entries, reverses?, memo?})` — validates Σdebit = Σcredit and integers ≥ 0, derives `idempotencyKey = {sourceType}:{sourceId}:{kind}`, returns the existing transaction on a duplicate key without error, `$inc`s every touched `ledger-accounts.balance` **in the same transaction** (creating missing accounts by `key = {category}:{shopId|platform}:{currency}`); `accountBalance(payload, category, shopId?)`; `postingFor(kind, amounts)` — the pure function that turns one of the spec's posting kinds into its entries array, the whole postings table transcribed:

| Kind | Debit | Credit |
|---|---|---|
| `charge` | `provider_position` G | `seller_pending` D, `platform_fee_unearned` C, `platform_revenue_protection_fee` P − Pv, `vat_payable` Pv |
| `provider_fee` | `provider_fee_expense` F (bearer platform) or `seller_pending` F (bearer destination) | `provider_position` F |
| `release` | `seller_pending` D′ | `seller_releasable` D′ (provider_hold) or `seller_payout_in_transit` D′ (provider_schedule) |
| `commission_earned` | `platform_fee_unearned` C′ | `platform_revenue_commission` C′ − vat, `vat_payable` vat |
| `payout_submitted` | `seller_releasable` X | `seller_payout_in_transit` X |
| `payout_complete` | `seller_payout_in_transit` X | `provider_position` X |
| `payout_failed` / `payout_reversed` | `seller_payout_in_transit` X | `seller_releasable` X |
| `refund_submitted` | `seller_pending` (or `seller_receivable` when short) r_s; `platform_fee_unearned` r_c before `commission_earned` or `platform_revenue_commission`+`vat_payable` r_c after; `platform_revenue_protection_fee`+`vat_payable` r_p | `buyer_refund_in_transit` r |
| `refund_complete` | `buyer_refund_in_transit` r | `provider_position` r |
| `refund_failed` | reverse of `refund_submitted` | |
| `clawback_recovered` | `seller_pending`/`seller_releasable` k | `seller_receivable` k |
| `guarantee_writeoff` | `buyer_guarantee_expense` k | `seller_receivable` k |

with G = buyerTotal, D = destinationAmount, C = commission+commissionVat, P = buyerProtectionFee, Pv its VAT; D′/C′ = D/C minus what refunds already reversed for the order. Every posting uses the **event's** amounts, never the order's, except `release`/`commission_earned`.
- Consumes: Task 6's two ledger collections; Task 3's math for fixtures.

- [ ] **Step 1: failing tests:**
- every posting kind balanced, each with exact entry values from one worked order (G 47,000 / D 43,240 / C 3,760 incl. VAT / P 1,410, computed by Task 3's `splitAmounts` so the fixture cannot drift from the arithmetic).
- duplicate `idempotencyKey` returns the first transaction; the balance moved once (assert the balance value).
- **property test**: a random sequence of 200 legal events keeps Σ(all balances, sign-adjusted by type) = 0 and `seller_pending` never negative without a matching `seller_receivable` debit.
- `refund_submitted` before vs after `commission_earned` hits the two different fee accounts (two cases, exact entries).
- an unbalanced entries array is refused before any write (`payload.writes` empty).
- recompute-vs-cache: after the property run, recomputing balances from entries equals every cache.
- [ ] **Step 2–4: implement, green, mutations** — drop the `$inc` from the transaction (post then inc outside) → the forced-failure case shows a posted transaction with an unmoved balance, red; skip the duplicate-key return → its test red. Restore.
- [ ] **Step 5: commit** — `feat(payments): the double-entry ledger mirror and its posting table`

### Task 9: `services/connectedAccounts.ts` and onboarding

**Files:**
- Create: `packages/api/src/services/connectedAccounts.ts`, routes `app/(frontend)/api/shops/[id]/payments/onboarding/route.ts` and `app/(frontend)/api/shops/[id]/payments/setup/route.ts`
- Create: `packages/api/src/jobs/syncConnectedAccount.ts` (the `TaskConfig` export only — **registration belongs to Task 20**)
- Test: `packages/api/tests/int/connected-accounts.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `ensureConnectedAccount(req, shop)` (creates via the port when none: `accountType: "express"`, shop name, owner email, shop verified phone, `metadata.shopId`; schedule `manual` for provider_hold, `weekly` for provider_schedule); `freshOnboardingLink(payload, shop)` (never stored; returnUrl/refreshUrl per spec); `applyAccountEvent(req, event)` for `account/updated` and `account/deauthorized` (deauthorized/disabled → `payout-holds` `{reason: fraud_signal, blocksCharges: true}` + owner and staff notified); `paymentSetupView(payload, shop, user)` → the contracts section's `PaymentSetupView`, whole-object pinned.
- Consumes: the registry (Task 12's `getMarketplaceProvider` — in tests, inject the fake directly), Task 2's settings, Task 11's `createHold`, Task 6's collections. The onboarding route: owner-only (`payout.ownerOnly`), flag+market+`shopCapabilities(shop).protectedPayment` gates with the spec's three error codes.
- **Links out:** `PaymentSetupView` is Task 25/28's data source; `syncConnectedAccount` queued on onboarding return and 6-hourly for `onboarding|restricted` rows (the schedule rows are Task 20's).

- [ ] **Step 1: failing tests:** route access (owner 200, manager 403 `payout.ownerOnly`, stranger 404); the three eligibility refusals by code; account created once (second call returns the same providerAccountId — the fake's journal proves one `createConnectedAccount`); `account/deauthorized` creates the blocking hold and the view shows `status: "deauthorized"`; `paymentSetupView` whole-object for: no account, onboarding, active-with-requirements, hold present (category only — assert the fraud rule string absent from the JSON).
- [ ] **Step 2–4: implement, green, mutation** — let the view pass the raw hold reason through → the category-only assertion red. Restore.
- [ ] **Step 5: commit** — `feat(payments): connected accounts, onboarding and the setup view`

### Task 10: `services/payoutAccounts.ts` — the payout account lifecycle

**Files:**
- Create: `packages/api/src/services/payoutAccounts.ts`, routes `app/(frontend)/api/shops/[id]/payout-accounts/route.ts` and `.../payout-accounts/[accountId]/not-me/route.ts`
- Test: `packages/api/tests/int/payout-accounts.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `createPayoutAccount(req, shop, user, {method, accountName, accountNumber})` — validations in order: owner (`payout.ownerOnly`), owner identity level ≥ 2 (`payment.shopNotEligible`), method `bank` refused (`payout.methodUnavailable`), number valid for the operator via Task 3's prefixes (`payout.accountInvalid`), 7-day cooldown since the last activation (`payout.accountChangeCooldown`), then Task 4's `nameMatch` against the P2 identity (level-3 shops also accept the RCCM business name): `match` → active (and the previous active row → `replaced`, **one active per shop enforced in the transaction**), `partial` → `pending_review` (+ `moderation/summary.pendingPayoutAccounts`), `mismatch` → `rejected` + `payout.accountNameMismatch`; masks the number (`maskAccountNumber`: `+237 6•• •• •4 21` shape); on a second-or-later activation creates the 72 h `payout_account_changed` hold **in the same transaction** and notifies push+email+SMS with the not-me link.
- Produces: `revertPayoutAccount(req, shop, accountId)` (the not-me path: previous account restored, hold kept open with `until: null`, escalated `fraud_signal`).
- Consumes: Tasks 3, 4, 6, 11; P2's identity read; `services/smsProvider.ts`.
- **Links out:** `approve_account`/`reject_account` are Task 19's; the pending-review queue count feeds the existing moderation summary.

- [ ] **Step 1: failing tests:** the validation ladder, one red case per code in order (each earlier gate passing); match/partial/mismatch wiring (nameMatch is already unit-tested — here assert the status and side-effects per verdict); one-active invariant under `Promise.all` of two creates (one active, one `replaced` or rejected — exactly one `active` row); change hold created in-transaction (forced failure after the account write leaves no hold and no account — atomicity); not-me reverts and escalates (previous row `active` again, hold `until: null`, reason `fraud_signal`); cooldown counted from activation, not creation.
- [ ] **Step 2–4: implement, green, mutations** — drop the in-transaction hold → atomicity case red; compare cooldown against `createdAt` → its test red. Restore.
- [ ] **Step 5: commit** — `feat(payments): payout accounts — name match, one active, the 72-hour change hold`

### Task 11: `services/payoutHolds.ts` — holds and the fraud rules

**Files:**
- Create: `packages/api/src/services/payoutHolds.ts`
- Modify: `packages/api/src/services/moderation.ts` (`suspendShop`/`unsuspendShop` create/release the `shop_suspended` hold in their transaction)
- Create: `packages/api/src/jobs/expirePayoutHolds.ts` (TaskConfig export only)
- Test: `packages/api/tests/int/payout-holds.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `createHold(req, {scope, shop, order?, reason, until?, blocksCharges?, createdByType, createdBy?})` (idempotent per `{scope, shop, order, reason}` while active); `releaseHold(req, holdId, {releasedBy?, note?})`; `activeHolds(payload, {shop, order?})`; `hasBlockingHold(payload, shop)`; the **fraud rules** as `applyFraudRules(req, trigger)` evaluated on the events the spec's table names: first-3-protected-orders-or-≥200k order hold until `completed`+72 h; refund-rate >10% over 30 days with ≥10 protected orders; `blocksCharges` fixed true for `fraud_signal|moderation|shop_suspended`.
- Consumes: Task 6; P4's order events for triggers (registered in Task 17's dispatch, not here).
- **Links out:** Task 13 (checkout refuses on `hasBlockingHold`), Task 16 (release skips held orders/shops), Task 19 (moderation hold/release), Task 20 (`expirePayoutHolds` schedule).

- [ ] **Step 1: failing tests:** `blocksCharges` forced by reason; idempotent create while active, a new row after release; `expirePayoutHolds` expires past-`until` rows and notifies the owner, leaves `until: null` rows alone; suspendShop creates the hold in the same transaction (forced-failure atomicity) and unsuspend releases it; the first-3-orders rule by exact boundary (3rd order yes, 4th no; 199,999 no, 200,000 yes); the refund-rate rule boundary (10 orders / 1 refund = 10% → no; 2 refunds → yes).
- [ ] **Step 2–4: implement, green, mutation** — invert the ≥200k boundary → its case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): payout holds and the fixed fraud rules`

### Task 12: The provider registry and the port contract spec

**Files:**
- Create: `packages/api/src/lib/payments/marketplaceRegistry.ts`
- Test: `packages/api/tests/int/marketplace-contract.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `getMarketplaceProvider(settings): MarketplaceProvider` — `PAYMENTS_PROVIDER=fake` or non-production → the shared fake; production with no registered adapter → throws `ServiceError(payment.providerUnavailable, 503)`; `registerMarketplaceProvider(name, factory)` for the future adapter(s), **none registered in this phase** (the user's hexagonal decision: real systems come later, nothing to decide now).
- Produces: the **contract spec** — a suite written against the `MarketplaceProvider` type and exported as `runMarketplaceContract(makeProvider)`, executed today with the fake: create-account/onboarding round trip; destination charge carries fixed `applicationFee` + `destination.amount`; `verifyWebhook` rejects a tampered signature; refund idempotency by key; transfer status normalisation; `ProviderCapabilityError` surfacing. A future NotchPay (or other) adapter passes this same function against the sandbox — that is where the spec's G5/N11 questions land, later.
- Consumes: Tasks 2, 5.

- [ ] **Step 1: failing tests:** registry selection per env matrix (fake in test; 503 in simulated production; a registered dummy wins in production); `runMarketplaceContract(fakeFactory)` green and **meaningful** — mutate the fake's refund idempotency → the contract names it (run once, revert).
- [ ] **Step 2–4: implement, green.**
- [ ] **Step 5: commit** — `feat(payments): the provider registry — fake outside production, a clean refusal inside, and the contract any future adapter must pass`

## Wave 5 — the money flows

### Task 13: Payment-intent creation — `services/checkoutPayment.ts` and its two routes

**Files:**
- Create: `packages/api/src/services/checkoutPayment.ts`, routes `app/(frontend)/api/orders/[id]/payment-intents/route.ts` and `app/(frontend)/api/orders/[id]/payment/route.ts`
- Modify: `packages/api/src/services/orders/transitions.ts` — **unreserve** `placed → paid` (buyer via payment) and `paid → accepted | cancelled` (P4's table already names them reserved-for-P5; this is P5)
- Test: `packages/api/tests/int/checkout-payment.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `createCheckoutIntent(req, order, user, {channel, phone, idempotencyKey})` implementing the spec's eight numbered rules exactly: (1) buyer-only, order `placed` + `mobile_money` + `unpaid|awaiting_payment` + younger than 30 min else `payment.orderNotPayable`; (2) eligibility — flag+market, shop level 2 via `shopCapabilities`, connected account `active` with both enables, an active payout account, no `blocksCharges` hold, open protected exposure (paid-not-completed + this order) within `exposureCaps` by level — any failure `payment.shopNotEligible`; (3) self-purchase: buyer an active member, or the payer phone equal to the shop's verified phone or any member's verified phone → `payment.selfPurchase` (Review Focus 5's pin lives here); (4) channel in the market row (`payment.channelUnsupported`), phone matches the channel's prefixes (`phone.invalid`); (5) attempts — pending intent < 3 min old → 409 `payment.attemptInProgress` with its id; 3 attempts → `payment.tooManyAttempts`; same `Idempotency-Key` → the existing intent; plus the buyer-side rate limit (3 failed intents per payer phone per hour → `generic.rateLimited`); (6) one transaction: intent (`purpose: checkout`, `targetType: order`, amount `buyerTotal`, `applicationFee`/`destinationAmount` from Task 3, `connectedAccount`, `expiresAt = now + checkoutExpiryMinutes`, `attempt`) then order → `awaiting_payment` through `applyTransition`; (7) after commit: `createDestinationCharge` (fixed amounts) then `chargeMobileMoney`; intent → `pending`; provider error → intent `failed` `provider_error` + `payment.providerUnavailable`; (8) the `PaymentIntentResponse` of the contracts section.
- Produces: `paymentStatusView(payload, order, caller)` (buyer or shop member) with the poll rule: `pending` > 60 s → `verifyPayment` at most every 20 s per intent, settling with `source: "callback"`.
- Consumes: Tasks 2, 3, 11, 12 (registry; fake in tests), P4's `applyTransition`, P0's `createPaymentIntent`/`findIntentByIdempotencyKey` (extended, not forked).
- **Links out:** Task 14 settles what this creates; Tasks 24/27 render the response shapes.

- [ ] **Step 1: failing tests** — one per numbered rule, each by exact code, plus: amounts frozen on the order at intent time (`settlement` group + `amounts.*` asserted by value from a worked order); the transaction atomicity (forced failure on the order transition leaves no intent); the idempotent replay returns the same intent id; two concurrent creates under `Promise.all` yield one intent (unique key or pre-check — one winner, 409 loser); the 20 s poll throttle (fake journal counts one `verifyPayment` for two calls 5 s apart).
- [ ] **Step 2–4: implement, green, mutations** — drop the member-phone half of self-purchase → its case red; count exposure without the new order → the boundary case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): the checkout intent — eligibility, attempts, idempotency and the awaiting-payment transition`

### Task 14: Settlement of a checkout intent

**Files:**
- Modify: `packages/api/src/services/payments.ts` (dispatch `purpose: checkout` to the new module), create `packages/api/src/services/checkoutSettlement.ts`
- Modify: `packages/api/tests/int/order-jobs.int.spec.ts` — **flip** P4's `expireOrders leaves a mobile_money order alone in P4` into the P5 behaviour (cancel with `payment_expired` at placement + 30 min, refund if a success lands later)
- Test: `packages/api/tests/int/checkout-settlement.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `settleCheckoutIntent(req, intent, report)` — idempotent as P0's settlement; on `succeeded` with amount+currency matching: order `paymentStatus: paid` + status `placed → paid` via `applyTransition` (starts the 48 h acceptance clock from `paidAt`), post `charge` (Task 8), issue the buyer fee invoice (Task 22's renderer — this task writes the row, Task 22 the PDF), notify buyer and seller; success on an order with another succeeded intent → `requestRefund(reason: duplicate_payment)`; success on a `cancelled` order → `requestRefund(reason: late_payment)`; success on an `expired|cancelled` **intent**: terminal status kept, `statusHistory` appended, `lateSuccess: true`, `charge` still posted (money moved), one `late_payment` refund — **and a second delivery of the same success does nothing more** (Review Focus 1's pin); `failed`: store `failureCode`, keep `awaiting_payment` while attempts remain and the order is < 30 min, else `paymentStatus: failed` + P4 cancel + stock release; `expired` → the final-failure branch.
- Produces: the `order.cancelled` handler (registered through P4's registry) that refunds the full `buyerTotal` of a **paid** order with reason `seller_declined | acceptance_timeout | order_cancelled` mapped from the cancellation.
- Consumes: Tasks 8, 13, 15 (refund request — `requestRefund` is Task 15's; dispatch 13→14 after 15 lands or stub the import seam: **dispatch order 13, 15, 16 first, then 14**).
- **Links out:** Task 17 routes `payment` events here.

- [ ] **Step 1: failing tests** — the settlement matrix, one case per branch above, each asserting **values**: paymentStatus, posted entries (exact), refund row (reason by value), notification calls; the Review Focus 1 pin: success on expired intent twice → one `lateSuccess` flag, one charge posting, one refund row; amount mismatch → no settle, a `status_mismatch`-shaped alert path (log + no state move); the `expireOrders` flip: a `mobile_money` order unpaid at 30 min cancels with `payment_expired` and releases stock.
- [ ] **Step 2–4: implement, green, mutations** — drop the duplicate-success guard → its case red; settle on mismatched amount → red. Restore.
- [ ] **Step 5: commit** — `feat(payments): settlement — paid orders, late successes, duplicates and the expiry flip`

### Task 15: `services/refunds.ts` and the `submitRefund` job

**Files:**
- Create: `packages/api/src/services/refunds.ts`, `packages/api/src/jobs/submitRefund.ts` (TaskConfig export only)
- Test: `packages/api/tests/int/refunds.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `requestRefund(req, {order, amount?, breakdown?, reason, sourceType, sourceId})` — validates `amount ≤ buyerTotal − refundedAmount` (`refund.amountExceeds`) and a succeeded intent exists (`refund.notRefundable`); default breakdown: full refund returns every component including the protection fee; partial takes seller first, then commission proportionally to refunded goods value, never the fee; creates the row (`created`, `idempotencyKey: {sourceType}:{sourceId}:{seq}`), increments `settlement.refundedAmount` — all one transaction; `paymentStatus` moves to `refunded|partially_refunded` **only when the refund succeeds**; 85-day-old payments → `refund.windowExpired` (the clawback path is P6's); an order with releasable funds requires an order hold `return_open|dispute_open` first (P6 creates it — refuse without).
- Produces: `applyRefundEvent(req, event)` for `refund/created|complete|failed` → status transitions (monotonic per the spec's table) + postings `refund_submitted|refund_complete|refund_failed`; the job `submitRefund` (queued immediately, 5 backoff retries) calling `createRefund` with the row's key; a failed submit retried once after 1 h, a second failure → staff alert + `status_mismatch` mismatch row.
- Produces: `applyDebitEvent` (clawback: `clawback_recovered` posting) and the `recoverSellerReceivables` daily logic (50%-of-new-charge cap, 60-day `guarantee_writeoff` + protected-payment suspension) in this same module; its job file `jobs/recoverSellerReceivables.ts` (TaskConfig only).
- Consumes: Tasks 6, 8, 12.
- **Links out:** Tasks 14, 17, 19, and P6 by contract (`sourceType: return-case|dispute`).

- [ ] **Step 1: failing tests:** breakdown arithmetic (full returns the fee; partial never touches it; proportional commission by exact values on a two-item order); the ladder of refusals by code; monotonic transitions (a `complete` after `failed` refused); submit retries by fake `failWhen` then success → one provider call per attempt in the journal; out-of-order `refund.complete` before `refund.created` lands once (idempotent posting); clawback: shortfall creates `seller_receivable`, recovery capped at 50% of a new charge's destination, write-off at 60 days with suspension.
- [ ] **Step 2–4: implement, green, mutations** — let partial refunds touch the fee → red; drop the releasable-funds hold requirement → red. Restore.
- [ ] **Step 5: commit** — `feat(payments): refunds — breakdown, idempotent lifecycle, clawback and write-off`

### Task 16: `services/payouts.ts` — release in both models

**Files:**
- Create: `packages/api/src/services/payouts.ts`, `packages/api/src/jobs/releaseEligibleFunds.ts` (TaskConfig export only)
- Test: `packages/api/tests/int/payouts.int.spec.ts` (**new**)

**Interfaces:**
- Produces: the `order.completed` handler (P4 registry): verifies the release conditions — `completed`, no active hold on order or shop, shop not suspended, the charge posting exists, no `balance_mismatch` state — then posts `release` + `commission_earned` (D′/C′ net of refunds — Review Focus 4's pin), sets `settlement.releaseEligibleAt`, and hands the commission invoice issue to Task 22's function.
- Produces (primary, `provider_hold`): `releaseEligibleFunds(payload, now)` — per shop with `seller_releasable ≥ minPayout` and no active shop hold: one `payouts` row (`scheduled`, with the released orders), `releasePayout` → `pending`; **holds are re-checked inside the per-shop transaction** (Review Focus 3); a payout `failed` 3× in a row → `payout_failed_repeatedly` hold + owner notified. Early release (flag off by default): level 3 + ≥30 completed protected orders + dispute loss < 2% over 90 d → 70% of D releasable 48 h after `delivered`, rest at `completed`.
- Produces (fallback, `provider_schedule`): `applyTransferEvent(req, event)` creates/updates `payouts` rows `origin: provider_schedule` from `transfer/*` webhooks; `release` posts to `seller_payout_in_transit` directly; the narrower eligibility rules (reserve question is the future adapter's; implement the no-reserve arm: shop ≥ 60 days, ≥ 10 completed COD orders, refusal+dispute loss < 5%; exposure caps halved) exposed as `providerScheduleEligible(shop, stats)` consumed by Task 13's rule 2.
- Produces: `applyTransferEvent` also drives the primary model's `transfer/created|complete|failed|reversed` → payout statuses (monotonic table from the spec) + postings `payout_submitted|payout_complete|payout_failed|payout_reversed`.
- Consumes: Tasks 8, 11, 12; P4's registry.
- **Links out:** Tasks 17, 20, 25/28 (SellerPaymentsView amounts read the ledger).

- [ ] **Step 1: failing tests:** release conditions one by one (each blocker alone blocks); D′ shrinks by a partial refund landed before the batch (exact amounts); the hold-race pin: a hold created after selection but before the shop's transaction keeps the order out (inject via fakePayload's `maybeFail`-style seam or a hook between select and transact); batch respects `minPayout`; 3× failed → hold + no fourth attempt; transfer events out of order (`complete` before `created`) land one terminal state and one posting; early-release split 70/30 by exact value with the three eligibility gates each tested at boundary; `providerScheduleEligible` boundaries (59 days no / 60 yes; 9 orders no / 10 yes; 5% no / 4.9% yes).
- [ ] **Step 2–4: implement, green, mutations** — select-time-only hold check → the race pin red; release gross D instead of D′ → red. Restore.
- [ ] **Step 5: commit** — `feat(payments): release — the completed handler, the daily batch and both models' transfer lifecycle`

### Task 17: The webhook spine — one route, entity dispatch, the callback

**Files:**
- Create: routes `app/(frontend)/api/public/payments/webhook/notchpay/route.ts` and `app/(frontend)/api/public/payments/notchpay/callback/route.ts`
- Modify: `packages/api/src/jobs/processWebhookEvent.ts` (entity dispatch), the P0 boost webhook route (delegate to the same handler, URL kept)
- Test: `packages/api/tests/int/payments-webhook.int.spec.ts` (**new**)

**Interfaces:**
- Produces: the webhook route following P0's behaviour exactly — verify through the registry's provider, insert `webhook-events`, answer 200, queue `processWebhookEvent`; the job dispatches on `NormalisedEvent.entity`: `payment` → Task 14, `refund` → Task 15, `transfer` → Task 16 (except references starting `RP-`, reserved for P8 — logged and skipped), `account` → Task 9, `debit` → Task 15's clawback; the GET callback verifies, settles with `source: "callback"`, redirects `/checkout/{orderId}/pending` or `buynsellem://checkout/{orderId}/pending`.
- Consumes: Tasks 9, 12, 14, 15, 16; P0's `webhook-events` idempotency.
- **Links out:** the fake's `emit` drives every event-shaped test in this plan; staging's real webhooks arrive here when an adapter exists.

- [ ] **Step 1: failing tests:** signature rejection stores nothing (and the signature value never appears in logs — scan the fake logger's calls); the same event id twice → one `webhook-events` row, one dispatched effect; the same state change under two event ids → second ignored by the transition table, posting skipped by key; **the out-of-order matrix** (Review Focus 2): `transfer.complete` before `created`, `refund.complete` before `created`, `payment.succeeded` after callback settled — each: one state, one posting; `RP-` transfers skipped with a log; the boost URL still settles a boost payment (P0 regression pin); the callback redirects per platform.
- [ ] **Step 2–4: implement, green, mutation** — drop the event-id idempotency read → the twice-delivered case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): one webhook spine, entity dispatch and the callback`

## Wave 6 — reconciliation, moderation, jobs, notifications, invoices

### Task 18: `services/reconciliation.ts` and the nightly run

**Files:**
- Create: `packages/api/src/services/reconciliation.ts`, `packages/api/src/jobs/reconcileLedger.ts` (TaskConfig export only), route `app/(frontend)/api/staff/finance/reconciliation/route.ts`
- Test: `packages/api/tests/int/reconciliation.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `runReconciliation(payload, {from, to})` implementing the spec's five steps over a 3-day window: (1) provider→local via `listTransactions` paging — missing locally is re-fetched (`verifyPayment`/`getRefund`/`getTransfer`) and applied through the same idempotent service paths with `source: "reconcile"` (`auto_fixed`), unfetchable → `missing_locally` open; (2) local→provider — `missing_at_provider`, `amount_mismatch`, `status_mismatch`; (3) per-shop balance check (`seller_pending + seller_releasable` vs the port's `getConnectedAccountBalance`, model-dependent; ≥ 1 XAF off → `balance_mismatch` + a `reconciliation_mismatch` hold via Task 11); (4) ledger integrity — recompute every balance from entries, Σdebit≠Σcredit or cache drift → `unbalanced_ledger`, cache corrected, **transaction never edited**; (5) the run row, `payments-reconciliation-alert` to admins when any `open` mismatch exists, and the staff route (admin-only, `?run=`).
- Also: extend P0's `reconcilePendingPayments` coverage (checkout intents pending > 2 min, refunds pending/processing > 24 h, payouts pending/sent/processing > 24 h) — in that job's own file.
- Consumes: Tasks 8, 11, 12 (the fake's `listTransactions` is scripted per test), 14–16's idempotent appliers.

- [ ] **Step 1: failing tests** — one fixture per mismatch kind, exactly as the spec's testing section lists: provider payment missing locally and auto-fixed (the fake returns it on `verifyPayment`; the intent settles with `source: reconcile`); unfetchable → `missing_locally`; local refund missing at provider; amount mismatch; status mismatch; shop balance off by 1 XAF → mismatch **and** hold; corrupted cache → `unbalanced_ledger`, cache corrected, transaction untouched (assert the transaction's `updatedAt` unmoved); **a second run over the same window creates no new mismatch** (idempotency of the whole run); the alert fires only with open mismatches.
- [ ] **Step 2–4: implement, green, mutation** — let step 4 edit the transaction → red. Restore.
- [ ] **Step 5: commit** — `feat(payments): nightly reconciliation — five steps, idempotent, evidence-preserving`

### Task 19: Moderation — holds, releases, account review, the shop sheet

**Files:**
- Modify: `packages/api/src/services/moderation.ts` (`holdPayouts`, `releasePayoutHold`, `approvePayoutAccount`, `rejectPayoutAccount`), the P1 moderation shop sheet service (`payments` section), `moderation/summary` (`pendingPayoutAccounts`)
- Create: route `app/(frontend)/api/moderation/shops/[id]/payouts/route.ts`
- Test: `packages/api/tests/int/moderation-payouts.int.spec.ts` (**new**)

**Interfaces:**
- Produces: `holdPayouts` (moderator+; hold + `ModerationLog` `payout.hold` in one transaction, metadata `{holdId, scope, orderId, reason, until}`); `releasePayoutHold` with the rank ladder — moderators release `moderation|dispute_open|return_open`; `fraud_signal|reconciliation_mismatch|payout_failed_repeatedly` need admin (`moderation.rankTooLow`); `payout_account_changed` admin-only; a moderator who is a member of the shop refused (`moderation.forbidden`); account review actions writing `payout.account_approve|payout.account_reject` and flipping the `pending_review` row (`active` + previous replaced, or `rejected`); the sheet's `payments` block: connected-account status, masked active account, holds, open exposure, last payouts, refund rate.
- Consumes: Tasks 10, 11; P1's `moderationRoute` idiom and rank model.

- [ ] **Step 1: failing tests:** the rank ladder one case per reason class; member-conflict refusal; log row in-transaction (forced-failure atomicity); approve activates + replaces previous and the summary count drops; the sheet block whole-object (and the raw fraud-rule reason absent — the sheet shows reasons to staff, but `blocksCharges` rules' internals stay out of the JSON where the spec says category only; staff **do** see the reason enum itself).
- [ ] **Step 2–4: implement, green, mutation** — let a moderator release a `fraud_signal` hold → red. Restore.
- [ ] **Step 5: commit** — `feat(moderation): payout holds, releases and the payout-account review`

### Task 20: Jobs wiring — the `payments` queue (sole owner of `jobs/index.ts` + `payload.config.ts`)

**Files:**
- Modify: `packages/api/src/jobs/index.ts`, `packages/api/src/payload.config.ts` (**sole owner this wave — every other task only created TaskConfig exports**)
- Test: `packages/api/tests/int/payment-jobs.int.spec.ts` (**new**)

**Interfaces:**
- Produces: registration of `submitRefund`, `syncConnectedAccount`, `releaseEligibleFunds`, `expirePayoutHolds`, `recoverSellerReceivables`, `reconcileLedger`; `autoRun` gains `{ cron: "* * * * *", queue: "payments", limit: 50 }`; the schedules: `releaseEligibleFunds` daily 10:00 Africa/Douala (from the market row's timezone when P5+1 internationalises — today the spec's literal), `recoverSellerReceivables` daily 03:00, `reconcileLedger` daily 02:30, `expirePayoutHolds` every 15 min, `syncConnectedAccount` 6-hourly sweep for `onboarding|restricted`; `bun run generate:types` for the task slugs.
- Consumes: every wave 4–6 TaskConfig export.

- [ ] **Step 1: failing test:** `every P5 job is registered in payload.config.ts with its queue` — import the config, assert the six slugs and the payments autoRun row (the P4 class: a job that exists and is scheduled nowhere fails here).
- [ ] **Step 2–4: implement, generate:types, green, mutation** — drop the payments autoRun row → red. Restore.
- [ ] **Step 5: commit** — `feat(payments): the payments queue and every P5 job on its schedule`

### Task 21: The fourteen payment workflows and their push data

**Files:**
- Modify: `packages/api/src/scripts/syncNotificationWorkflows.ts`, `packages/api/src/hooks/notificationEvents.ts`
- Create: notifier functions in `packages/api/src/services/paymentNotifications.ts`
- Test: extend `packages/api/tests/int/notification-workflows.int.spec.ts`

**Interfaces:**
- Produces: the spec's workflow table verbatim — `payment-succeeded`, `payment-failed`, `order-paid`, `payments-onboarding-action`, `payout-account-activated`, `payout-account-review`, `payout-account-changed` (push+email+SMS with the "This was not me" link), `payout-hold-placed`/`payout-hold-released` (**reason category only, never the fraud rule** — the payload carries the category string), `payout-sent`/`payout-failed`, `refund-initiated`/`refund-completed`/`refund-failed`, `payments-reconciliation-alert` (admins, email); push data routes: payments → `/orders/{id}`, payouts → `/seller/payments`, account changes → `/seller/payments/setup`; mixed-audience lessons from P4 applied — any workflow reaching buyer and shop carries `audience` in its payload schema from day one.
- Consumes: Tasks 9, 10, 11, 14–16, 18's call sites (each already calls a named notifier — this task implements them; earlier tasks stub against the module with vi.mock as P4 did).

- [ ] **Step 1: failing tests:** every workflow id declared and payload-schema'd; each notifier fires its workflow with the exact payload (category-only asserted on the hold pair: the fraud-rule string absent, the category present); deep-link cases in `notificationEvents` for the three routes.
- [ ] **Step 2–4: implement, green, mutation** — pass the raw reason into the hold payload → red. Restore.
- [ ] **Step 5: commit** — `feat(payments): the fourteen payment workflows, audience-carrying from day one`

### Task 22: Invoices — series F, the application-fee commission invoice, the VAT export

**Files:**
- Create: `packages/api/src/services/buyerFeeInvoices.ts`, route `app/(frontend)/api/staff/finance/vat/route.ts`
- Modify: `packages/api/src/services/commission.ts` (the `mobile_money` line leaves the weekly run — extend Task 27-P4's `not_equals` exclusion already in place — and is invoiced at `completed` on its own `settlement: application_fee`, `status: paid` invoice), the P4 invoice renderer (series `F` template, bilingual, accented French — these are PDFs, not SMS)
- Test: `packages/api/tests/int/buyer-fee-invoices.int.spec.ts` (**new**), extend `commission-invoicing.int.spec.ts`

**Interfaces:**
- Produces: `issueBuyerFeeInvoice(req, order, intent)` — `BNS-F-{year}-{seq}` via `nextInvoiceNumber("F", issuedAt)`, amounts HT/VAT/TTC from the order's frozen fee fields, PDF in P2 private storage, 5-minute signed URLs for buyer and owner/manager; `creditNoteFor(invoice, refund)` (full refunds; P6 calls it); `issueApplicationFeeCommissionInvoice(req, order)` at `completed` (series `C`, `paid`); the VAT CSV route (admin, `?month=`, `vat_payable` movements by source).
- Consumes: Tasks 3, 6, 8, 14, 16; P4's renderer and `nextInvoiceNumber`.

- [ ] **Step 1: failing tests:** invoice numbering per series and year; amounts by exact value from a worked order; the weekly run skips `mobile_money` lines while the `completed` path invoices them `paid` (extend the P4 spec's case); credit note mirrors the refunded fee; CSV shape (header + one asserted row); signed-URL access matrix (buyer yes, stranger no, expiry honoured).
- [ ] **Step 2–4: implement, green, mutation** — let the weekly run include a mobile_money line → the P4-extended case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): the buyer fee invoice, the paid commission invoice and the VAT export`

## Wave 7 — the backend checkpoint

### Task 23: Backend checkpoint

**Files:** none unless a defect is found; the report is the deliverable. Same shape as P4's Task 28, which earned its seat.

- [ ] **Step 1: trace one protected order end to end** file by file: place (P4) → intent → charge webhook → paid → accept → ship → deliver → complete → release posting → payout → transfer complete; and the unhappy paths: expiry at 30 min, decline-then-retry-then-paid, late success after cancel, seller declined after paid (refund), payout failure ×3, clawback. Confirm every seam's types and every posting against Task 8's table.
- [ ] **Step 2: grep the invariants and quote the output** — ledger writes only from `services/ledger.ts`; order status writes only through `applyTransition`; no concrete adapter import anywhere (`grep -rn "notchpayMarketplace\|fakeMarketplace" packages/api/src --include="*.ts"` shows only the registry and tests); every new error code thrown somewhere; `audience` present on every mixed-recipient workflow payload.
- [ ] **Step 3: every reference resolves** — route paths vs client hooks, workflow ids vs sync script, job slugs vs config, deep links vs screens (web now, mobile after wave 9 re-check).
- [ ] **Step 4: suites + the four ceilings on a quiet tree, quoted.**
- [ ] **Step 5: report; fix the smallest thing that closes any defect, with a test.**

## Waves 8–9 — the clients

### Task 24: Web — `/checkout/[orderId]/pay` and `/pending`

**Files:** create `packages/web/src/app/checkout/[orderId]/pay/*` and `.../pending/*`; extend `packages/web/src/hooks/use-checkout.ts` (`useCreatePaymentIntent`, `usePaymentStatus` — polling 3 s × 60 s then 10 s, stop on terminal); keys in both message files.
**Consumes:** the contracts section's `PaymentIntentResponse`/`PaymentStatusView`; Task 7's vocabulary; the P4 checkout's house style.
- [ ] Pure module `payment-flow.ts` + test first: attempt/countdown/retry decisions (resend after 3 min as a new attempt with a fresh `Idempotency-Key`; "use another operator" resets channel; expiry → cancelled messaging; `payment.shopNotEligible` → COD fallback when the order allows).
- [ ] The two screens: operator choice with the fee line and the protection sheet (spec copy verbatim); pending with countdown, per-channel instructions, provider `instructions` when present; failed state per `failureCode` with attempts left.
- [ ] Run `bun test`, `check-types`, key gate, biome; mutation: drop the fresh-key-on-retry rule → its test red.
- [ ] Commit — `feat(web): pay by mobile money — the pay and pending screens`

### Task 25: Web — `/seller/payments`, `/seller/payments/payouts/[id]`, `/seller/payments/setup`

**Files:** create the three route groups; `use-seller-payments.ts` hooks (`SellerPaymentsView`, `PaymentSetupView`, payout detail); sidebar entry (Payments, gated `payments.view` + flag); keys.
**Consumes:** Tasks 9/16's views; the P4 seller screens' house style; `useAppConfig().protectedPaymentEnabled` (Task 2 exposes it via public config — verify the route, it is in the spec's flag section).
- [ ] Amount strip labelled per spec (Awaiting delivery / In withdrawal period / Ready for payout (hold model only) / In progress / Paid this month) with the legend sentence verbatim; payouts table; per-order breakdown; setup's three steps (identity → onboarding link → payout account form with the name-match result and the 72 h notice before confirming a change); "Coming soon" when the server says `flagEnabled: false`.
- [ ] Mutation: compute an amount client-side instead of rendering the server's → its test red.
- [ ] Commit — `feat(web): the seller payments screens`

### Task 26: Web — the existing screens' payment surfaces

**Files:** modify `/orders/[id]` (P4 purchases page: payment status, refunds with the 5–7 day sentence, fee-invoice download), the listing page (protection badge for eligible shops, spec copy), the payment-method step of checkout (COD vs protected with this order's fee); keys.
**Consumes:** Tasks 7, 24's flow module; `availableActions` untouched (payment is not an order action — it is its own flow off `paymentStatus`).
- [ ] Mutation: show the protection badge on an ineligible shop → red.
- [ ] Commit — `feat(web): protection disclosure on listing, checkout and the order page`

### Task 27: Mobile — `app/checkout/[orderId]/pay.tsx` and `pending.tsx`

**Files:** create the two screens + `src/lib/paymentFlow.ts` (+ test) mirroring Task 24's module (compared in the parity family); extend `src/hooks/useCheckout.ts`; keys (`{{x}}`).
**Consumes:** Task 24's flow semantics; `AppState` re-check on `active` (the buyer leaves to approve the USSD prompt); a local notification 1 min before expiry while pending; hosted-checkout fallback via `openAuthSessionAsync` with return `buynsellem://checkout/{orderId}/pending`.
- [ ] Mutation: drop the AppState re-check → its test red (the pure module decides "refresh on foreground after N s").
- [ ] Commit — `feat(mobile): pay by mobile money`

### Task 28: Mobile — seller payments and the moderation section

**Files:** create `app/seller/payments/index.tsx`, `payouts/[id].tsx`, `setup.tsx`; `src/hooks/useSellerPayments.ts`; the Payments hub tile with its action badge; `app/moderation/shop/[id]` Payments section through `DecisionSheet`; keys.
**Consumes:** Tasks 19, 25 (same views); onboarding via `openAuthSessionAsync` with return `buynsellem://seller/payments/setup` + `syncConnectedAccount` trigger on return.
- [ ] Mutation: hub badge from a hardcoded flag instead of the view's action state → red.
- [ ] Commit — `feat(mobile): the seller payments screens and the moderation payments section`

### Task 29: Mobile — registrations, deep links, parity (sole owner of `app/_layout.tsx`)

**Files:** modify `app/_layout.tsx` (the five new screens), `src/lib/deepLinks.ts` (payments routes), extend the registration proof test and the deep-link parity spec (push data of Task 21's workflows resolve to screens, run against the real `buildExpoPushData`).
- [ ] Mutation: delete one registration → the proof test names the file.
- [ ] Commit — `feat(mobile): the payment routes, reachable and provably so`

## Wave 10 — release

### Task 30: Staging pass and the release record

Mostly the user's. The buildable half: a `fake`-provider staging pass (the flag enabled in staging via `PROTECTED_PAYMENT_ALLOWED=true` + sandbox-evidence gate rows, `PAYMENTS_PROVIDER=fake`) exercising pay → pending → paid → deliver → complete → release → payout on the fake, plus 7 consecutive green `reconcileLedger` nights against the fake's `listTransactions`. The provider half (real sandbox, gates G1–G6, N/L answers) belongs to the future adapter work and is **not** a P5 exit criterion, per the user's hexagonal decision. Production ships with the flag off. The seller payment terms (the refund and
clawback clauses, bilingual) are legal copy the spec requires "before launch":
drafting them is the user's, with Task 15's implemented rules as the source of
what they must say — listed here so the release record carries the obligation.

## Spec coverage

Every spec section maps to a task: Settlement modes → 2; Data model → 6 (+10 services); Provider interface → 5, 12 (port + contract; adapter deferred by user decision); Services and routes → 9, 10, 13–17; Release → 16; Refunds → 15; Buyer protection fee → 3, 22, 24–26; VAT → 22; Fraud holds → 11; Jobs → 18, 20; Moderation → 19; Notifications → 21; Flag/gates → 2, 30; Errors → 1; Web → 24–26; Mobile → 27–29; Testing section's named cases are distributed into the owning tasks' Step 1 lists; Verification targets → 23, 30. **Deliberately out (user decision, 2026-10-03):** the NotchPay adapter, the G1–G6 gate evidence, the N/L questions — all attached to the future adapter work item; the gate record in code (Task 2) still refuses production enablement until they exist.

## Conflicts found while planning

- The spec's "Current state" predates P0–P4's implementation; the plan's own re-verified section replaces it.
- The spec routes checkout payment through `services/checkout.ts`, which P4 already owns for COD; P5 uses `services/checkoutPayment.ts` and `services/payments.ts` dispatch instead — same seams, no file contention.
- P4's `expireOrders` test "leaves a mobile_money order alone in P4" was written to be flipped by P5 (its own comment says so); Task 14 flips it.
- P4 reserved `paid` and refuses its transitions (`RESERVED_STATUSES`); Task 13 unreserves exactly `placed → paid` and `paid → accepted|cancelled`, and both clients' action tables already carry empty `paid` rows that Task 26/28 revisit only if the spec's screens demand actions there (they do not — `paid` renders as a status, the accept flow is P4's).
- The spec's `releaseEligibleFunds` at "10:00 Africa/Douala" is a country literal; it stays (job schedule), noted against the international rule as data to lift with multi-market work.
