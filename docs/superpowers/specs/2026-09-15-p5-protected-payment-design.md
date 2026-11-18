# P5 Protected Payment Design

Date: 2026-09-15
Parent: `2026-09-15-business-layer-design.md`
Depends on: `2026-09-15-p0-foundations-design.md`, `2026-09-15-p1-shops-design.md`, P2 (verification levels, private storage), P4 (COD orders)

## Gates

P5 is designed now and built behind a flag. None of it reaches production until every blocking gate below is cleared in writing and the evidence is filed with the gate record (see Feature flag).

| # | Gate | Owner | Blocking for | Consequence if the answer is no |
|---|---|---|---|---|
| G1 | NotchPay confirms in writing its licence or partner bank under CEMAC Regulation 04/18, and the segregated-account arrangement for Sync balances (art. 53). | Product owner | All of P5 | P5 does not launch. No other settlement mode is enabled in its place (see Settlement modes). |
| G2 | A Cameroonian lawyer's written opinion that `provider_split` (destination charge to the seller's connected account, application fee to BuyNSellem) does not make BuyNSellem a payment service provider, and that holding the application fee while it can still be refunded is compatible with Regulation 04/18. | Product owner | All of P5 | P5 does not launch. |
| G3 | NotchPay confirms whether funds of a destination charge can stay in the connected account until the platform releases them (manual payout schedule plus platform-triggered payout per order or per amount). | Engineering | Choice of release model | Yes: `releaseModel = provider_hold` (primary). No: `releaseModel = provider_schedule` (fallback), with its eligibility restrictions. |
| G4 | NotchPay confirms that a refund on a destination charge debits the connected account (and states what happens to the application fee), and not the platform balance. The public refunds page says "ensure your Notch Pay account has sufficient funds", which suggests the platform balance is debited. | Engineering | Refunds, hence all of P5 | If refunds can only debit the platform balance, BuyNSellem would advance every buyer refund from its own revenue and chase sellers. P5 does not launch until G2's lawyer has also cleared that advance-and-recover model (lawyer question L4). |
| G5 | NotchPay sandbox run confirming the exact API contract: account creation path (`/accounts` in the Sync integration guide, `/sync/accounts` in the account-management guide), onboarding body (`callback` vs `redirect_url`/`refresh_url`), webhook signature header (`x-notch-signature` in the verification guide and in current code, `notchpay-signature` in the Sync sample), event field (`event` in current code, `type` in the Sync and refund docs), event names (`payment.complete` in current code, `payment.succeeded` in the Sync guide), direct mobile-money charge compatibility with `destination` and `application_fee`. | Engineering | Merge of the NotchPay adapter | The adapter maps whatever the sandbox returns; the rest of P5 depends only on the normalised shapes below. |
| G6 | Data-protection authorisation (inherited from P2) covers transfer of payout account data to NotchPay. | Product owner | Payout accounts | Payout accounts cannot be stored or sent. |

The exact questions to send are listed at the end of this document.

## Goal

Let a buyer pay a verified shop by mobile money with the promise that the seller is paid only after delivery, while BuyNSellem never holds, receives or moves the buyer's money. A licensed provider collects the payment into the seller's connected account and pays it out; BuyNSellem receives only its application fee (commission plus buyer protection fee), mirrors what the provider did in a double-entry ledger, and reconciles it nightly.

## Scope

1. Settlement mode per market: `provider_split` enabled for Cameroon; `direct_to_seller` and `platform_collects` documented and disabled.
2. NotchPay Sync connected accounts and hosted onboarding for level-2 shops.
3. `payout-accounts` with name matching against the level-2 identity and a 72-hour hold on change.
4. Mobile-money checkout for P4 orders: `payment-intents` purpose `checkout`, destination charge, application fee, 30-minute expiry, pending and failure paths.
5. Release of seller funds driven by delivery confirmation and the withdrawal window, in two release models (`provider_hold`, `provider_schedule`).
6. Refunds through the provider API, including late and duplicate payments.
7. `ledger-accounts` and `ledger-transactions` as an idempotent double-entry mirror, and nightly reconciliation against provider reports.
8. Buyer protection fee: pricing, disclosure, receipts. VAT at 19.25% on commission and fee invoices.
9. Payouts, payout holds, fraud holds, moderation actions `payout.hold` and `payout.release`.
10. Web and mobile screens: checkout, pending, failed, payout account setup, seller payments and payouts.
11. Feature flag with a gate record.

## Out of scope

- Disputes, returns and their money outcomes beyond the refund primitive (P6). P5 exposes `services/refunds.ts` and `payout-holds`; P6 decides when to call them.
- Delivery proof (P7). P5 consumes P4's handover OTP and P7's proof of delivery through the order's `delivered` transition only.
- Affiliate resale payment splits and reseller commission payouts (P8). P5's destination charge already targets the seller of record; P8 changes who that is and how the application fee is split internally.
- Risk scoring (P9). P5 ships the fixed fraud-hold rules listed below and reads P9 `risk-flags` once they exist.
- Cards and Stripe for orders. Stripe cannot pay out to Cameroonian sellers; Stripe stays on boosts only.
- Multi-shop checkout (P10). One order, one shop, one intent.
- Selling anything digital. Orders, commission and the buyer protection fee are tied to physical goods and stay outside Apple and Google in-app purchase (parent spec D2).
- Bank payouts. NotchPay documents bank transfers as "coming soon"; the `bank` method exists in the enum and is refused at creation until enabled.

## Current state (verified 2026-09-15)

- `packages/api/src/lib/payments/types.ts`: `PaymentProvider` has `createPayment` and `verifyWebhook` only. `WebhookEvent` carries `reference`, `status`, `providerTransactionId`, with no amount, currency or event id. No marketplace, refund, transfer or balance method exists.
- `packages/api/src/lib/payments/notchpay.ts`: authenticates with `Authorization: NOTCHPAY_PUBLIC_KEY` only. NotchPay's refunds, transfers and balance endpoints also require the `X-Grant` private key, which no code or env var provides. `verifyWebhook` throws; `verifyPayment(reference)` maps `complete|completed|approved|success` to `completed`.
- `packages/api/src/lib/payments/index.ts`: `getProvider` silently falls back to NotchPay when Stripe is not configured (`boost/route.ts` catches and retries with `notchpay`).
- `packages/api/src/app/(frontend)/api/public/boost/webhook/notchpay/route.ts`: reads `x-notch-signature`, parses `event.event` and `event.data.merchant_reference`, handles `payment.complete`, `payment.failed`, `payment.cancelled`. It is the only NotchPay webhook endpoint.
- `packages/api/src/app/(frontend)/api/public/boost/callback/route.ts`: GET callback that verifies through the API and redirects to web or to an app deep link.
- `packages/api/src/payload.config.ts`: jobs `expireListingsTask`, `expireBoostsTask`, `checkSearchAlertsTask`; `autoRun` on queue `nightly` at `0 0 * * *` and `0 */6 * * *`.
- `packages/api/src/globals/AppSettings.ts`: admin-only global with `auth` and `sms` groups; no payment settings.
- `packages/api/src/collections/ModerationLog.ts`: actions `listing.*`, `user.*`, `report.*`; target types `listing`, `user`, `report` (P1 adds `shop`).
- `packages/api/src/plugins/storage.ts`: storage adapters apply to `media` only (public).
- `packages/api/src/lib/errors.ts`: no payment, payout or refund codes.
- `payment-intents`, `webhook-events` (P0), `shops` (P1), verification levels (P2) and `orders` (P4) exist only as specs; none is implemented. P5 assumes all of them shipped.
- NotchPay public documentation (read 2026-09-15): Sync offers connected accounts of type `standard`, `express` ("platform-managed payouts") and `custom`; destination charges with `application_fee` (fixed) and/or `application_fee_percent`; payout schedules daily, weekly, monthly, plus manual and batch payouts; "Account Debits: charge connected accounts for platform fees or services"; refunds full or partial within 90 days, statuses `pending|processing|complete|failed`, webhooks `refund.created|refund.complete|refund.failed`, original fees not refunded; transfers to `cm.mtn`, `cm.orange`, `cm.mobile` with statuses `pending|sent|processing|complete|failed|reversed`; `GET /balance` and `GET /balance/history`; fees 2% on collection and 1% on mobile-money transfers. Holding a specific destination charge until an event, and refunds on split payments, are not documented.

## Design

### Settlement modes

`AppSettings` gains `payments.markets`, one row per country:

| Field | Type | Rules |
|---|---|---|
| `countryCode` | text | ISO 3166-1 alpha-2, unique within the array |
| `currency` | text | ISO 4217; `XAF` for `CM` |
| `provider` | select `notchpay` | |
| `settlementMode` | select `provider_split`, `direct_to_seller`, `platform_collects` | validation rejects any value other than `provider_split` (see below) |
| `channels` | select hasMany `cm.mtn`, `cm.orange` | channels offered at checkout |
| `vatRateBps` | number | `1925` for `CM` |
| `enabled` | checkbox | default `false` |

`CM` is seeded as `{ currency: XAF, provider: notchpay, settlementMode: provider_split, channels: [cm.mtn, cm.orange], vatRateBps: 1925, enabled: false }`.

`services/payments.ts#resolveSettlement(countryCode)` returns the market row or throws `payment.marketUnavailable`. Only a `provider_split` strategy is implemented. The other two values exist so the choice is explicit and reviewed, and the `beforeChange` validation on `AppSettings` rejects them with the reason below:

| Mode | How money moves | Why it is disabled |
|---|---|---|
| `provider_split` | Provider collects into the shop's connected account (destination charge). BuyNSellem receives only the application fee. Provider pays the seller out. | Enabled for `CM`, subject to gates G1–G5. |
| `direct_to_seller` | Buyer pays the seller's own merchant account directly; BuyNSellem invoices commission afterwards, as for COD. | The seller has the money before delivery, so there is no protection: it is the mobile-money deposit pattern behind the scams the product exists to stop. BuyNSellem cannot refund or hold anything. Kept only as a possible future mode for a market with no marketplace-capable provider, where it would be sold as prepayment without protection. |
| `platform_collects` | BuyNSellem's merchant account collects the full amount and pays sellers by transfer. | BuyNSellem would hold and transmit third-party funds: a payment service under Regulation 04/18 art. 5, closable under art. 84. Only a market where BuyNSellem holds a licence, or acts under a licensed institution's agency agreement cleared by counsel, could enable it. |

### Data model

#### `connected-accounts`

One per shop per provider. Mirrors the provider's connected account.

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required | unique together with `provider` |
| `provider` | select `notchpay` | |
| `providerAccountId` | text, unique | NotchPay account id |
| `accountType` | select `express`, `custom`, `standard` | `express` by default (platform-managed payouts); `standard` is refused because the seller could change the payout schedule and defeat release control |
| `status` | select `created`, `onboarding`, `restricted`, `active`, `disabled`, `deauthorized` | service-written from provider state |
| `chargesEnabled` / `payoutsEnabled` | checkbox | from provider |
| `requirementsDue` | json | `requirements.currently_due` from provider |
| `kycStatus` | text | `verification.status` from provider |
| `kycName` | text | account holder name returned by the provider, when it returns one |
| `payoutSchedule` | select `manual`, `daily`, `weekly`, `monthly` | set by the service according to `releaseModel` |
| `lastSyncedAt` | date | |

Access: read by the shop's `owner` and `manager` and staff; writes service-only.

#### `payout-accounts`

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | |
| `method` | select `mtn_momo`, `orange_money`, `bank` | `bank` refused with `payout.methodUnavailable` until enabled in settings |
| `accountName` | text, required | name registered with the operator or bank, 2–80 characters |
| `accountNumber` | text, required | `mtn_momo`/`orange_money`: E.164 Cameroonian mobile number validated by prefix for the operator; `bank`: RIB (23 digits). Field read: owner and staff only |
| `accountNumberMasked` | text | service-written, e.g. `+237 6•• •• •4 21`; readable by owner and manager |
| `status` | select `pending_verification`, `pending_review`, `active`, `rejected`, `replaced` | service-written |
| `nameMatch` | group | `identityName` (from P2), `providerName` (operator or NotchPay name when available), `result` `match|partial|mismatch`, `score` (0–1), `checkedAt` |
| `providerRecipientId` | text | provider-side payout destination id, when the provider exposes one |
| `activatedAt` / `replacedAt` | date | |
| `createdBy` | relationship users | |

At most one `active` account per shop, enforced by the service inside a transaction. Changing the number or method creates a new row; the previous row becomes `replaced` when the new one activates. Records are never deleted (Law 2010/021 art. 32).

**Name match.** Both names are normalised: NFKD, diacritics removed, upper case, punctuation removed, tokens sorted.
- `match`: every token of the shorter name (at least two tokens) appears in the other, or Jaro-Winkler on the sorted token strings is at least 0.92.
- `partial`: at least one surname token matches → `pending_review`. Staff review it in the Payments section of the P1 moderation shop sheet (`POST /api/moderation/shops/{id}/payouts` with `action: approve_account | reject_account`, see Moderation), and `moderation/summary` counts it as `pendingPayoutAccounts`.
- `mismatch` → `rejected`, error `payout.accountNameMismatch`.
- Identity name comes from P2's level-2 verified identity. For a level-3 shop, the RCCM business name is also accepted.
- When NotchPay returns the operator's registered name for the number (`kycName` or recipient lookup, question N7), that name must also match; the seller-typed name alone never activates an account in that case.

**Change hold.** When a second or later payout account becomes `active`, or `account.updated` reports a payout method different from the active row:
- a `payout-holds` row `{ scope: shop, reason: payout_account_changed, until: now + 72 h }` is created in the same transaction;
- the owner is notified by push, email and SMS (through `services/smsProvider.ts`) to the shop's verified phone, with a "This was not me" link;
- "This was not me" reverts to the previous account, keeps the hold open without end date and escalates it to moderation with reason `fraud_signal`.

A shop may change its payout account at most once every 7 days (`payout.accountChangeCooldown`).

#### `payment-intents` (extends P0)

- `purpose` gains `checkout`; `targetType` gains `order`.
- New fields: `channel` (`cm.mtn|cm.orange`), `payerPhone` (read: customer and staff; nulled by P0 account-deletion anonymisation), `connectedAccount` (relationship), `destinationAmount`, `applicationFee` (integers), `attempt` (1–3), `failureCode` (`declined|insufficient_funds|timeout|limit_exceeded|invalid_number|provider_error`), `lateSuccess` (checkbox).
- For `checkout`, `expiresAt = createdAt + payments.checkoutExpiryMinutes` (30).
- P0's transition table is unchanged. A provider success reported for a `checkout` intent already `expired` or `cancelled` is appended to `statusHistory`, sets `lateSuccess: true`, and triggers an automatic refund with reason `late_payment`. The intent status stays terminal; the ledger still posts the charge, because money did move.

#### `orders` (extends P4)

P4 owns `orders` and its transition service. P5 adds:

| Field | Type | Rules |
|---|---|---|
| `paymentMethod` | P4's `mobile_money` value | set at checkout; no new enum value |
| `amounts.buyerProtectionFee` | number | P4 field, written by P5: TTC, integer XAF |
| `amounts.buyerProtectionFeeVat` | number | |
| `amounts.commission` / `amounts.commissionVat` | number | HT and VAT |
| `amounts.applicationFee` | number | `commission + commissionVat + buyerProtectionFee` |
| `amounts.destinationAmount` | number | `orderTotal - commission - commissionVat` |
| `settlement` | group | `mode`, `releaseModel` (snapshot at payment), `connectedAccount`, `releaseEligibleAt`, `releasedAt`, `payout` (relationship), `refundedAmount` |

`orderTotal` is P4's `amounts.subtotal + amounts.deliveryFee`. `buyerTotal` below is P4's `amounts.total`, which already includes `buyerProtectionFee`; no separate field is added. All `settlement` and `amounts` fields are service-written.

#### `refunds`

| Field | Type | Rules |
|---|---|---|
| `order` | relationship orders, required, indexed | |
| `paymentIntent` | relationship payment-intents, required | |
| `amount` | number, integer, > 0 | ≤ `buyerTotal - refundedAmount` |
| `breakdown` | group | `seller`, `commission`, `commissionVat`, `buyerProtectionFee` (sum equals `amount`) |
| `reason` | select `order_cancelled`, `seller_declined`, `acceptance_timeout`, `late_payment`, `duplicate_payment`, `withdrawal`, `dispute`, `unavailable`, `moderation` | |
| `sourceType` / `sourceId` | select `order|return-case|dispute|payment-intent|moderation` / text | who asked |
| `status` | select `created`, `pending`, `processing`, `succeeded`, `failed` | monotonic: `created → pending|failed`, `pending → processing|succeeded|failed`, `processing → succeeded|failed` |
| `statusHistory` | array | `{ status, source, at }` |
| `providerRefundId` | text, unique when set | |
| `fundedBy` | select `connected_account`, `platform_advance` | `platform_advance` only in the clawback path |
| `idempotencyKey` | text, unique | `{sourceType}:{sourceId}:{sequence}` |
| `attempts` / `lastError` | number / text | |

Access: buyer and shop owner/manager read their own; staff read all; writes service-only.

#### `payouts`

| Field | Type | Rules |
|---|---|---|
| `shop` | relationship shops, required, indexed | |
| `connectedAccount` | relationship, required | |
| `payoutAccount` | relationship payout-accounts | the active account at submission |
| `amount` / `fee` / `currency` | number / number / text | `fee` is the provider transfer fee reported |
| `orders` | array `{ order, amount }` | orders released into this payout; empty for `provider_schedule` payouts the provider created |
| `origin` | select `platform_release`, `provider_schedule` | |
| `status` | select `scheduled`, `pending`, `sent`, `processing`, `complete`, `failed`, `reversed`, `cancelled` | table below |
| `statusHistory` | array | |
| `providerTransferId` | text, unique when set | |
| `failureReason` | text | |

Transitions: `scheduled → pending|cancelled`; `pending → sent|processing|complete|failed`; `sent → processing|complete|failed`; `processing → complete|failed`; `complete → reversed`. `failed`, `reversed`, `cancelled` are terminal. Access: shop owner and manager read; staff read; writes service-only.

#### `payout-holds`

| Field | Type | Rules |
|---|---|---|
| `scope` | select `shop`, `order` | |
| `shop` | relationship shops, required, indexed | |
| `order` | relationship orders | required when `scope = order` |
| `reason` | select `payout_account_changed`, `fraud_signal`, `reconciliation_mismatch`, `dispute_open`, `return_open`, `moderation`, `payout_failed_repeatedly`, `shop_suspended` | |
| `blocksCharges` | checkbox | also refuses new protected checkouts for the shop; true for `fraud_signal`, `moderation`, `shop_suspended` |
| `status` | select `active`, `released`, `expired` | |
| `until` | date | null means until released |
| `createdByType` / `createdBy` | select `system|moderator` / relationship users | |
| `releasedBy` / `releasedAt` / `note` | | |

A hold never moves money. Its effect depends on the release model (see Release).

#### `ledger-accounts` and `ledger-transactions`

The ledger is a mirror. Its accounts describe positions at the provider and BuyNSellem's own revenue, never a balance anyone can spend. No route, admin action or user action can create a posting; every posting is caused by a provider fact (a stored `webhook-events` row or a reconciliation run) or by an internal accounting reclassification tied to an `order-events` row. Balances are never presented to users as a wallet or a balance "on BuyNSellem".

`ledger-accounts`:

| Field | Type | Rules |
|---|---|---|
| `key` | text, unique | `{category}:{shopId or platform}:{currency}` |
| `category` | select, see chart below | |
| `type` | select `asset`, `liability`, `revenue`, `expense` | |
| `shop` | relationship shops | set for seller categories |
| `currency` | text | |
| `balance` | number | cache, `$inc` in the posting transaction; recomputed from entries nightly |

Chart of accounts:

| Category | Type | Meaning |
|---|---|---|
| `provider_position` | asset | total the provider has collected for the marketplace and not yet paid out or refunded |
| `seller_pending` | liability | seller funds at the provider for orders not yet releasable |
| `seller_releasable` | liability | release conditions met, payout not yet submitted (`provider_hold` only) |
| `seller_payout_in_transit` | liability | payout submitted, not complete |
| `seller_receivable` | asset | amount a seller owes after a refund exceeding their remaining funds |
| `buyer_refund_in_transit` | liability | refund submitted, not complete |
| `platform_fee_unearned` | liability | commission (TTC) received in application fees on orders not completed |
| `platform_revenue_commission` | revenue | commission HT earned |
| `platform_revenue_protection_fee` | revenue | buyer protection fee HT |
| `vat_payable` | liability | VAT on commission and fee |
| `provider_fee_expense` | expense | NotchPay collection fees borne by the platform |
| `buyer_guarantee_expense` | expense | refunds advanced and not recovered |

`ledger-transactions` (append-only; `create`, `update`, `delete` closed; only `services/ledger.ts` writes):

| Field | Type | Rules |
|---|---|---|
| `idempotencyKey` | text, unique | `{sourceType}:{sourceId}:{kind}` |
| `kind` | select, see postings | |
| `occurredAt` / `postedAt` | date | provider time / our time |
| `sourceType` / `sourceId` | select `webhook-event|reconciliation-run|order-event` / text | |
| `order`, `shop`, `paymentIntent`, `refund`, `payout` | relationships | as applicable |
| `entries` | array `{ account, debit, credit }` | integers ≥ 0, one side per line; Σdebit = Σcredit, validated before insert |
| `reverses` | relationship ledger-transactions | for reversals |
| `memo` | text | |

A duplicate `idempotencyKey` returns the existing transaction without error. The posting and the balance increments share one MongoDB transaction.

Postings, with G = `buyerTotal`, D = `destinationAmount`, C = `commission + commissionVat`, P = `buyerProtectionFee`, Pv = its VAT:

| Kind | Trigger | Debit | Credit |
|---|---|---|---|
| `charge` | intent reaches `succeeded` (or `lateSuccess`) | `provider_position` G | `seller_pending` D, `platform_fee_unearned` C, `platform_revenue_protection_fee` P − Pv, `vat_payable` Pv |
| `provider_fee` | fee reported by webhook or balance history | `provider_fee_expense` F (bearer platform) or `seller_pending` F (bearer destination) | `provider_position` F |
| `release` | order `completed` (P4) | `seller_pending` D′ | `seller_releasable` D′ (`provider_hold`) or `seller_payout_in_transit` D′ (`provider_schedule`, already on schedule) |
| `commission_earned` | order `completed` | `platform_fee_unearned` C′ | `platform_revenue_commission` C′ − vat, `vat_payable` vat |
| `payout_submitted` | `transfer.created` or payout accepted | `seller_releasable` X | `seller_payout_in_transit` X |
| `payout_complete` | `transfer.complete` | `seller_payout_in_transit` X | `provider_position` X |
| `payout_failed` / `payout_reversed` | `transfer.failed` / `transfer.reversed` | `seller_payout_in_transit` X | `seller_releasable` X |
| `refund_submitted` | `refund.created` | `seller_pending` (or `seller_receivable` when pending is short) r_s; `platform_fee_unearned` r_c before `commission_earned`, or `platform_revenue_commission` + `vat_payable` r_c after it (P6 issues the commission credit note); `platform_revenue_protection_fee` + `vat_payable` r_p | `buyer_refund_in_transit` r |
| `refund_complete` | `refund.complete` | `buyer_refund_in_transit` r | `provider_position` r |
| `refund_failed` | `refund.failed` | reverse of `refund_submitted` | |
| `clawback_recovered` | account debit complete | `seller_pending` or `seller_releasable` k | `seller_receivable` k |
| `guarantee_writeoff` | receivable unrecovered after 60 days | `buyer_guarantee_expense` k | `seller_receivable` k |

D′ and C′ are D and C minus what refunds already reversed for that order. Every posting uses the webhook event's amounts, never the order's, except the internal `release` and `commission_earned` reclassifications.

#### `buyer-fee-invoices`

The buyer protection fee is a service BuyNSellem sells to the buyer, invoiced at payment.

| Field | Type | Rules |
|---|---|---|
| `number` | text, unique | `BNS-F-{year}-{6-digit sequence}`, from P4's `nextInvoiceNumber("F", issuedAt)` |
| `kind` | select `invoice`, `credit_note` | |
| `creditsInvoice` | relationship buyer-fee-invoices | for credit notes |
| `order`, `buyer` | relationships | |
| `amountHt` / `vat` / `amountTtc` / `vatRateBps` | numbers | |
| `pdf` | upload in P2 private storage | bilingual FR/EN (Law 2011/012 art. 6) |
| `issuedAt` | date | |

P4's `commission-invoices` gains `settlement: mobile_money | application_fee`. P4 still accrues the commission line at delivery; for a `mobile_money` order that line is left out of P4's weekly invoicing and invoiced here instead, at `completed`, on its own invoice (series `C`, `nextInvoiceNumber("C", …)`) with `settlement: application_fee` and `status: paid`, since the fee was already collected; P6 issues credit notes on it.

#### `reconciliation-runs` and `reconciliation-mismatches`

`reconciliation-runs`: `startedAt`, `finishedAt`, `window` (`from`, `to`), `status` (`running|succeeded|failed`), `counts` (`checked`, `matched`, `autoFixed`, `mismatches`), `error`.

`reconciliation-mismatches`:

| Field | Type | Rules |
|---|---|---|
| `run` | relationship | |
| `kind` | select `missing_locally`, `missing_at_provider`, `amount_mismatch`, `status_mismatch`, `balance_mismatch`, `unbalanced_ledger` | |
| `entityType` / `providerId` / `localId` | text | |
| `expected` / `actual` | json | |
| `shop` | relationship | |
| `status` | select `open`, `auto_fixed`, `resolved`, `ignored` | `resolved` and `ignored` require a staff note |
| `resolvedBy` / `note` | | |

All three collections: staff read, admin update of `status` and `note` only, service writes otherwise.

### Provider interface

New `lib/payments/marketplace.ts`:

```ts
interface MarketplaceProvider {
  createConnectedAccount(input: { shopId, name, email, phone, type }): Promise<{ accountId }>
  createOnboardingLink(accountId, { returnUrl, refreshUrl }): Promise<{ url }>
  getConnectedAccount(accountId): Promise<NormalisedAccount>
  setPayoutSchedule(accountId, schedule: "manual" | "daily" | "weekly" | "monthly"): Promise<void>
  createDestinationCharge(input: { reference, amount, currency, applicationFee, destination: { accountId, amount }, customer, description, callbackUrl }): Promise<{ providerReference, checkoutUrl? }>
  chargeMobileMoney(reference, { channel, phone }): Promise<{ status, action? }>
  verifyPayment(reference): Promise<NormalisedPayment>
  releasePayout(accountId, { amount, currency, reference }): Promise<{ transferId }>   // provider_hold only
  createRefund({ paymentReference, amount, reason, idempotencyKey }): Promise<{ refundId, status }>
  getRefund(refundId): Promise<NormalisedRefund>
  getTransfer(transferId): Promise<NormalisedTransfer>
  debitConnectedAccount(accountId, { amount, reference, description }): Promise<{ debitId }>
  listTransactions({ from, to, page }): Promise<NormalisedTransaction[]>
  getConnectedAccountBalance(accountId): Promise<{ available, pending }>
  verifyWebhook(rawBody, headers): Promise<NormalisedEvent>
}
```

- `NotchPayMarketplaceProvider` implements it with `Authorization` (public key) and `X-Grant` (`NOTCHPAY_PRIVATE_KEY`, new env var). Stripe does not implement it.
- `NormalisedEvent` extends P0's shape with `entity` (`payment|refund|transfer|account|debit`), `accountId`, `refundId`, `transferId`, `fee`.
- Event names are mapped in one table in the adapter (G5), so `payment.complete` and `payment.succeeded` both normalise to `payment/succeeded`.
- A method NotchPay cannot support after G3/G4 throws `ProviderCapabilityError`, and the corresponding setting cannot be enabled.
- All calls use a 15-second timeout. Network failure or 5xx → `payment.providerUnavailable`.

### Services and routes

New services: `services/connectedAccounts.ts`, `services/payoutAccounts.ts`, `services/checkout.ts` (payment part of P4 checkout), `services/refunds.ts`, `services/payouts.ts`, `services/ledger.ts`, `services/reconciliation.ts`, `services/payoutHolds.ts`. `services/payments.ts` (P0) keeps settlement of intents and dispatches purpose `checkout` to `services/checkout.ts`. Multi-document writes use a Payload transaction. Provider calls happen outside the transaction, after commit, driven by jobs, except where noted.

#### Connected account onboarding

`POST /api/shops/{id}/payments/onboarding` (owner only):

1. Protected payment flag on, market enabled, shop `active`, `shopCapabilities(shop).protectedPayment === true` (level 2). Otherwise `payment.protectedDisabled`, `payment.marketUnavailable`, `payment.shopNotEligible`.
2. Create the connected account if none (`accountType: express`, shop name, owner email, shop verified phone, `metadata.shopId`), store `status: created`.
3. Set the payout schedule: `manual` for `provider_hold`; for `provider_schedule`, the schedule from Release eligibility.
4. Return a fresh onboarding link (never stored). `returnUrl`: web `/seller/payments/setup?onboarding=done`, mobile `buynsellem://seller/payments/setup`; `refreshUrl`: the same route, which issues a new link.

`GET /api/shops/{id}/payments/setup` returns connected-account status, `requirementsDue`, active payout account (masked), pending account, active holds and eligibility reasons.

`account.updated` and `account.application.deauthorized` webhooks update the row. `deauthorized` or `disabled` creates a `payout-holds` row with `reason: fraud_signal` and `blocksCharges: true`, and notifies owner and staff.

#### Payout accounts

- `POST /api/shops/{id}/payout-accounts` (owner only). Body: `method`, `accountName`, `accountNumber`. Validates, computes the name match, creates the row, pushes it to the connected account when NotchPay allows the platform to set the payout destination (question N6), and activates on `match`.
- `POST /api/shops/{id}/payout-accounts/{accountId}/not-me`: authenticated link target from the change notification; see Change hold.
- The shop owner's P2 identity must be level 2 or higher at creation, otherwise `payment.shopNotEligible`.

#### Checkout with mobile money

P4 creates the order with `paymentMethod: mobile_money`, reserves stock and sets `paymentStatus: unpaid`. Amounts are computed at order creation and frozen:

- `commission = Σ order-items.commissionAmount` (P4, computed at placement on the goods subtotal; P8 overrides it for resale orders), `commissionVat = roundXaf(commission × vatRateBps / 10000)`.
- `buyerProtectionFee = clamp(roundXaf(orderTotal × buyerProtectionFeeBps / 10000), feeMin, feeMax)`; defaults `300` bps (3%), `feeMin` 100 XAF, `feeMax` 15,000 XAF. `buyerProtectionFeeVat = buyerProtectionFee − roundXaf(buyerProtectionFee × 10000 / (10000 + vatRateBps))`.
- `roundXaf(x) = Math.floor(x + 0.5)`.
- `buyerTotal ≤ payments.maxOrderAmount` (default 1,000,000 XAF), otherwise `payment.amountTooHigh`.

`POST /api/orders/{id}/payment-intents`, header `Idempotency-Key` (UUID), body `{ channel, phone }`:

1. Caller is the order's buyer. Order `placed`, `paymentMethod: mobile_money`, `paymentStatus` `unpaid` or `awaiting_payment`, created less than 30 minutes ago. Otherwise `payment.orderNotPayable`.
2. Eligibility, checked again at pay time:
   - flag and market enabled;
   - shop level 2 through `shopCapabilities`;
   - connected account `active` with `chargesEnabled` and `payoutsEnabled`;
   - an active payout account;
   - no active hold with `blocksCharges`;
   - open protected exposure (paid, not completed) plus this order within the cap: 500,000 XAF at level 2, 2,000,000 XAF at level 3;
   - `provider_schedule` eligibility when that model is active.
   Any failure → `payment.shopNotEligible`, and the client offers COD when the product allows it.
3. Buyer is not an active member of the shop, and the payer phone is not the shop's verified phone or any member's verified phone → `payment.selfPurchase`.
4. `channel` is in the market's channels (`payment.channelUnsupported`); the phone is a valid number for that operator's prefixes (`phone.invalid`).
5. Attempts:
   - a pending intent younger than 3 minutes → `payment.attemptInProgress` (409) with its id;
   - three attempts already → `payment.tooManyAttempts`;
   - the same `Idempotency-Key` returns the existing intent.
6. In one transaction: create the intent (`purpose: checkout`, `targetType: order`, `amount: buyerTotal`, `applicationFee`, `destinationAmount`, `connectedAccount`, `expiresAt`, `attempt`), then set order `paymentStatus: awaiting_payment` through P4's transition service.
7. After commit:
   - `createDestinationCharge` with `application_fee = applicationFee` and `destination.amount = destinationAmount` (fixed amounts, never `application_fee_percent`, so the ledger is exact);
   - then `chargeMobileMoney` to trigger the operator push/USSD prompt;
   - intent → `pending`. A provider error moves the intent to `failed` with `failureCode: provider_error` and returns `payment.providerUnavailable`.
8. Response: `{ intentId, status, expiresAt, channel, instructions }`. `instructions` is the provider's `action` text when present, otherwise the client shows its per-channel copy.

`GET /api/orders/{id}/payment` (buyer or shop member) returns the latest intent status, `failureCode`, `expiresAt` and order `paymentStatus`. When the intent has been `pending` for more than 60 seconds, the route calls `verifyPayment` at most once every 20 seconds per intent and settles with `source: callback`.

Settlement of a `checkout` intent (from webhook, callback, poll or reconciliation, idempotent as in P0):

- `succeeded`, with amount and currency matching:
  - order `paymentStatus: paid`, P4 status `placed → paid` (starts the 48-hour acceptance clock);
  - post `charge` and issue the buyer fee invoice;
  - notify buyer and seller.
- Success on an order that already has another succeeded intent → refund with reason `duplicate_payment`.
- Success on an order already `cancelled` → refund with reason `late_payment`.
- `failed`:
  - store `failureCode`;
  - if attempts remain and the order is within 30 minutes, keep `paymentStatus: awaiting_payment`;
  - otherwise `paymentStatus: failed`, order cancelled by P4 and stock released.
- `expired` → same as the last `failed` branch.

P4's `expireOrders` job cancels `mobile_money` orders unpaid 30 minutes after placement (reason `payment_expired`). Seller refusal or the 48-hour acceptance timeout (from `paidAt`) cancels the order in P4; P5 registers an `order.cancelled` handler through P4's `registerOrderEventHandler` that calls `services/refunds.ts#requestRefund` for the full `buyerTotal` of a paid order, with reason `seller_declined`, `acceptance_timeout` or `order_cancelled`.

Callback for hosted checkout (web fallback when the direct charge is unavailable for a number): `GET /api/public/payments/notchpay/callback` verifies, settles with `source: callback`, and redirects to `/checkout/{orderId}/pending` or `buynsellem://checkout/{orderId}/pending`.

Webhooks: `POST /api/public/payments/webhook/notchpay` receives every NotchPay event and follows P0's route behaviour exactly (verify, insert `webhook-events`, 200, queue `processWebhookEvent`). The P0 boost URL stays registered and calls the same handler. `processWebhookEvent` dispatches on the normalised `entity`:
- `payment` → intent settlement;
- `refund` → `services/refunds.ts`;
- `transfer` → `services/payouts.ts`, except references starting with `RP-`, which go to P8's `services/resellerPayouts.ts`;
- `account` → `services/connectedAccounts.ts`;
- `debit` → `services/refunds.ts` clawback.

#### Release

Release conditions for an order, all required:
- P4 status `completed`, which P4 sets when the order is `delivered` (handover OTP confirmed in P4 or proof of delivery in P7) and the 15-day withdrawal window (P4's `AppSettings.orders.withdrawalDays`, from `deliveredAt`) has elapsed with no open return case or dispute;
- no active `payout-holds` on the order or the shop;
- the shop is not suspended: P5 extends P1's `suspendShop` and `unsuspendShop` in `services/moderation.ts` to create and release a `shop_suspended` hold in the same transaction;
- the charge posting exists and the order's reconciliation state is not `balance_mismatch`.

On `completed`, `services/payouts.ts` posts `release` and `commission_earned`, issues the commission invoice and sets `settlement.releaseEligibleAt`.

**Primary: `releaseModel = provider_hold`** (G3 yes).
- Connected accounts run on `manual` payout schedule; funds of every destination charge stay at NotchPay in the seller's connected account.
- Job `releaseEligibleFunds`, daily at 10:00 Africa/Douala:
  - for each shop with `seller_releasable ≥ payments.minPayout` (1,000 XAF) and no active shop hold, create a `payouts` row (`scheduled`) listing the released orders;
  - call `releasePayout` → `pending`;
  - `transfer.*` webhooks drive the status and postings.
- Order-level holds keep that order's amount out of the batch.
- A payout `failed` three times in a row creates a `payout_failed_repeatedly` hold and asks the owner to check the payout account.
- Faster payouts for level 3 (`payments.earlyRelease.enabled`, default `false`): for a shop with `shopCapabilities(shop).fasterPayouts` (level 3) and at least 30 completed protected orders and a dispute loss rate below 2% over 90 days, 70% of D becomes releasable 48 hours after `delivered` and the rest at `completed`. Refunds after an early release follow the clawback path.

**Fallback: `releaseModel = provider_schedule`** (G3 no).
- NotchPay pays connected accounts on its own schedule. `payouts` rows are created from `transfer.*` webhooks with `origin: provider_schedule`. At `completed`, `release` moves D′ straight to `seller_payout_in_transit`, or to a reconciling state if the provider already paid it.
- Schedule: `weekly` (Monday) for every eligible shop. Holds call `setPayoutSchedule(manual)` when the API allows pausing (question N3) and restore `weekly` on release. If pausing is impossible, a hold only blocks new charges.
- Eligibility is narrower because funds may leave before delivery. A shop is eligible for protected payment only when either:
  - NotchPay offers an account-level rolling reserve (question N4): 20% of each charge kept for 30 days on shops younger than 90 days or with fewer than 10 completed orders; or
  - without a reserve, the shop has at least 60 days, at least 10 completed COD orders, and a COD refusal and dispute loss rate below 5%.
- Exposure caps are halved.
- Refund and clawback terms, written into the seller terms before launch:
  1. Refunds debit the connected account first (G4).
  2. When the connected account balance is short, the shortfall becomes `seller_receivable` and is recovered by `debitConnectedAccount` against subsequent collections, at most 50% of each new charge's destination amount.
  3. If the receivable is not recovered within 60 days, BuyNSellem writes it off as `buyer_guarantee_expense`, suspends protected payment for the shop, and pursues the seller for its own claim.
  4. A buyer refund is never delayed by a seller shortfall. When the provider cannot debit the connected account, BuyNSellem advances the refund from its own platform revenue (`fundedBy: platform_advance`) and then recovers its own receivable. This path is enabled only after lawyer question L4 is answered yes.

#### Refunds

`services/refunds.ts#requestRefund({ order, amount, breakdown?, reason, sourceType, sourceId })`:

1. In a transaction:
   - validate `amount ≤ buyerTotal − refundedAmount` (`refund.amountExceeds`) and the order has a succeeded intent (`refund.notRefundable`);
   - compute the breakdown when not given: a full refund returns every component, including the buyer protection fee (see Buyer protection fee); a partial refund is taken from the seller part first, then commission proportionally to the refunded goods value, and never the protection fee;
   - create the `refunds` row `created`;
   - increment `settlement.refundedAmount`;
   - set P4 `paymentStatus` to `refunded` or `partially_refunded` when the refund succeeds, not before.
2. Job `submitRefund` (queued immediately, retried five times with backoff) calls `createRefund` with idempotency key = `refunds.idempotencyKey` → `pending`.
3. `refund.created|complete|failed` webhooks move the status and post `refund_submitted`, `refund_complete`, `refund_failed`. On `failed`, the job retries once after 1 hour. A second failure opens a staff alert and a `reconciliation-mismatches` row of kind `status_mismatch` for manual handling.
4. Payments older than 85 days cannot be refunded through the provider (90-day limit). `requestRefund` returns `refund.windowExpired` and the caller (P6) uses the clawback path with a `platform_advance` refund by transfer, subject to L4.
5. An order-level `payout-holds` row with reason `return_open` or `dispute_open` must exist before a refund on an order with releasable funds is requested; P6 creates it.

Refunds typically reach the buyer in 5–7 business days; the buyer UI says so. Original NotchPay collection fees are not refunded; they stay in `provider_fee_expense` when the platform bears them.

#### Buyer protection fee

- Rate, minimum and maximum live in `AppSettings.payments.buyerProtection` (`bps` 300, `min` 100, `max` 15,000). Changing them affects new orders only.
- Disclosure, identical on web and mobile and in both languages:
  - listing page, next to the price for shops eligible for protected payment: "Protected payment available: your money is released to the seller only after delivery. Fee: 3% (min 100 FCFA)";
  - payment method choice: COD vs protected, with the fee amount for this order;
  - order summary before payment (Law 2010/021 art. 17): goods, delivery, buyer protection fee (VAT included), total to pay, and a "What does protection cover?" sheet;
  - order confirmation and receipt; the fee invoice PDF.
- The sheet states who holds the money: "Your payment is collected and held by NotchPay, a payment provider. BuyNSellem never holds your money."
- Refund of the fee: refunded on every full refund of the order; retained on partial refunds. Whether it may be retained when a buyer exercises the withdrawal right after delivery is lawyer question L3; until answered, it is refunded.

#### VAT and invoices

- VAT rate from the market row (`1925` bps for `CM`). `AppSettings` validation refuses a market rate different from P4's `orders.vatRateBps` for the same country, so COD and protected invoices never diverge.
- Commission: expressed HT, VAT added on top, commission invoice to the seller at `completed`, bilingual, showing shop RCCM and NIU when present.
- Buyer protection fee: price shown TTC, invoice to the buyer at payment, credit note on refund.
- Invoice PDFs are generated by the P4 invoice renderer with series `C` (commission) and `F` (fee), and stored in P2 private storage. Buyer and shop owner/manager download them through signed URLs valid 5 minutes.
- `vat_payable` feeds a monthly VAT report for the accountant: `GET /api/staff/finance/vat?month=`, admin only, CSV.

#### Fraud holds

Created automatically by `services/payoutHolds.ts`:

| Rule | Hold |
|---|---|
| Payout account changed | shop, `payout_account_changed`, 72 h |
| Connected account `disabled` or `deauthorized` | shop, `fraud_signal`, `blocksCharges`, until released |
| First 3 protected orders of a shop, any order ≥ 200,000 XAF | order, `fraud_signal`, until `completed` plus 72 h |
| Refund rate > 10% over 30 days with at least 10 protected orders | shop, `fraud_signal`, until released |
| Reconciliation `balance_mismatch` on the shop | shop, `reconciliation_mismatch`, until the mismatch is resolved |
| P9 `risk-flags` severity `high` on the shop or its owner (once P9 ships) | shop, `fraud_signal`, `blocksCharges` |
| Shop suspended (P1) | shop, `shop_suspended`, `blocksCharges`, released on unsuspension |
| Dispute or return case open (P6) | order, `dispute_open` / `return_open` |

Buyer-side, enforced at checkout: `payment.selfPurchase`, and at most 3 failed intents per payer phone per hour (`generic.rateLimited`).

### Jobs

Added to `payload.config.ts` `jobs.tasks`, with a new `payments` queue autoRun every minute (`* * * * *`, limit 50):

| Job | Schedule | Work |
|---|---|---|
| `processWebhookEvent` | queued | P0 job, extended dispatch |
| `submitRefund` | queued | provider refund call |
| `syncConnectedAccount` | queued on onboarding return; every 6 h for `onboarding`/`restricted` | pulls account state |
| `reconcilePendingPayments` | every 15 min (P0) | also covers `checkout` intents pending > 2 min, refunds `pending|processing` > 24 h, payouts `pending|sent|processing` > 24 h |
| `releaseEligibleFunds` | daily 10:00 Africa/Douala | primary model payouts |
| `expirePayoutHolds` | every 15 min | `active` holds past `until` → `expired`, notify owner |
| `recoverSellerReceivables` | daily 03:00 | fallback clawback debits, 60-day write-off |
| `reconcileLedger` | daily 02:30 Africa/Douala | below |

#### Nightly reconciliation

`reconcileLedger` covers the previous 3 days (late provider updates) and runs in five steps.

1. **Provider to local:** page through `listTransactions` for the platform and each connected account with activity. Every payment, refund, transfer and debit must match a local intent, refund, payout or ledger transaction with the same amount and a compatible status.
   - Missing locally → fetch it through `verifyPayment`, `getRefund` or `getTransfer`, and apply it through the same idempotent service path with `source: reconcile`. Record `auto_fixed`.
   - Not fetchable → `missing_locally`, `open`.
2. **Local to provider:** every local `succeeded` intent, `succeeded` refund and `complete` payout in the window must exist at the provider, otherwise `missing_at_provider`. Amount differences give `amount_mismatch`; status differences that the state machines cannot apply give `status_mismatch`.
3. **Balances:** for each shop, `seller_pending + seller_releasable` (primary) or `seller_pending` (fallback), minus provider-side pending fees, must equal `getConnectedAccountBalance` `available + pending`. A difference of 1 XAF or more gives `balance_mismatch` and a `reconciliation_mismatch` hold on the shop.
4. **Ledger integrity:** recompute every `ledger-accounts.balance` from entries. Any transaction with Σdebit ≠ Σcredit, or a cache differing from the recomputation, gives `unbalanced_ledger`. The cache is corrected; the transaction is never edited.
5. **Report:** write the run, notify staff through `payments-reconciliation-alert` when any `open` mismatch exists, and expose `GET /api/staff/finance/reconciliation?run=` (admin).

### Moderation

- `MODERATION_ACTIONS` gains `payout.hold` and `payout.release`. Target type `shop` (P1); metadata `{ holdId, scope, orderId, reason, until }`.
- `services/moderation.ts`:
  - `holdPayouts(payload, actor, shopId, { scope, orderId?, reason, untilDays?, blocksCharges, note })`: moderator or admin; creates the hold and writes the log in one transaction.
  - `releasePayoutHold(payload, actor, holdId, { note })`: moderators release holds with reason `moderation`, `dispute_open` or `return_open`; holds with reason `fraud_signal`, `reconciliation_mismatch` or `payout_failed_repeatedly` require an admin (`moderation.rankTooLow`). `payout_account_changed` holds cannot be released early by anyone but an admin.
  - A moderator who is a member of the shop cannot act on it (`moderation.forbidden`).
- Route `POST /api/moderation/shops/{id}/payouts` with `action: hold | release | approve_account | reject_account` (the last two for payout accounts in `pending_review`, written as `payout.account_approve` and `payout.account_reject`, which `MODERATION_ACTIONS` also gains), and the P1 shop sheet `GET` gains `payments`: connected account status, active payout account (masked), holds, open exposure, last payouts, refund rate.
- Mobile `moderation/shop/[id]` gains a Payments section with hold and release through `DecisionSheet`.

### Notifications

New Novu workflows in `syncNotificationWorkflows.ts`, with push data routes added to `hooks/notificationEvents.ts`:

| Workflow | Recipient | Channels | Trigger |
|---|---|---|---|
| `payment-succeeded` | buyer | in-app, push, email | checkout intent succeeded |
| `payment-failed` | buyer | in-app, push | final failure or expiry |
| `order-paid` | shop owner and managers | in-app, push | order paid, accept within 48 h |
| `payments-onboarding-action` | owner | in-app, email | connected account `restricted` or requirements due |
| `payout-account-activated` | owner | in-app, email | account active |
| `payout-account-review` | owner | in-app, email | name match `partial` or `mismatch` |
| `payout-account-changed` | owner | push, email, SMS | change hold created, with "This was not me" |
| `payout-hold-placed` / `payout-hold-released` | owner | in-app, email | hold created (reason category only, never the fraud rule) / released |
| `payout-sent` / `payout-failed` | owner | in-app, push | transfer complete / failed |
| `refund-initiated` / `refund-completed` / `refund-failed` | buyer (and owner for initiated) | in-app, push, email | refund lifecycle |
| `payments-reconciliation-alert` | staff (admins) | email | open mismatches after a run |

Push data routes: payments to `/orders/{id}`, payouts to `/seller/payments`, account changes to `/seller/payments/setup`.

### Feature flag and gate record

`AppSettings` gains a `payments` group:

| Setting | Default |
|---|---|
| `protectedPayment.enabled` | `false` |
| `releaseModel` | `provider_hold` |
| `markets` | `CM` row, disabled |
| `buyerProtection` | `{ bps: 300, min: 100, max: 15000 }` |
| `checkoutExpiryMinutes` | `30` |
| `payoutAccountChangeHoldHours` | `72` |
| `minPayout` | `1000` |
| `maxOrderAmount` | `1000000` |
| `exposureCaps` | `{ level2: 500000, level3: 2000000 }` |
| `earlyRelease.enabled` | `false` |
| `providerFeeBearer` | `platform` |
| `gates` | array `{ gate: G1..G6, clearedAt, clearedBy, evidence (upload in P2 private storage), note }` |

- Enabling `protectedPayment.enabled` or a market is refused by `beforeChange` unless G1, G2, G4, G5 and G6 each have a `gates` row with evidence, and the env var `PROTECTED_PAYMENT_ALLOWED=true` is set on the API. Staging sets the env var with sandbox evidence.
- `releaseModel = provider_hold` additionally requires a G3 row; otherwise only `provider_schedule` can be selected.
- `GET /api/public/config` exposes `protectedPaymentEnabled`, `buyerProtection` and `checkoutExpiryMinutes`.
- When disabled: checkout offers COD only, payments setup screens show "Coming soon", payment-intent creation returns `payment.protectedDisabled`. Webhooks, refunds, payouts and reconciliation keep running, so turning the flag off never strands money in flight.

### Error codes

Added to `lib/errors.ts` with English fallbacks and translations in both clients:

- `payment.protectedDisabled`
- `payment.marketUnavailable`
- `payment.shopNotEligible`
- `payment.orderNotPayable`
- `payment.attemptInProgress`
- `payment.tooManyAttempts`
- `payment.channelUnsupported`
- `payment.amountTooHigh`
- `payment.selfPurchase`
- `payment.declined`, `payment.insufficientFunds`, `payment.timeout`, `payment.limitExceeded` (from `failureCode`, shown on the failed screen)
- `payment.expired`
- `payout.ownerOnly`
- `payout.methodUnavailable`
- `payout.accountInvalid`
- `payout.accountNameMismatch`
- `payout.accountChangeCooldown`
- `payout.onboardingIncomplete`
- `payout.holdActive`
- `refund.amountExceeds`
- `refund.notRefundable`
- `refund.windowExpired`

Existing codes reused: `phone.invalid`, `generic.rateLimited`, `payment.providerUnavailable`, `moderation.*`, `shop.notMember`.

### Web

New routes:
- `/checkout/[orderId]/pay`:
  - order summary with the fee line and "What does protection cover?";
  - operator choice (MTN MoMo, Orange Money) with logos;
  - phone prefilled from the verified phone and editable;
  - "Pay {buyerTotal} FCFA".
  - The form is disabled with the reason when `payment.shopNotEligible`, with a "Pay on delivery instead" action when the product allows COD.
- `/checkout/[orderId]/pending`:
  - countdown to `expiresAt`, operator-specific instruction ("Approve the payment request on your phone, or dial the operator's approval menu"), provider `instructions` when present;
  - polling `GET /api/orders/{id}/payment` every 3 s for 60 s, then every 10 s;
  - "I didn't receive the prompt" re-sends after 3 minutes as a new attempt;
  - on success → `/orders/{id}` with a success banner.
- Failed state on the same route: `failureCode` message, attempts left, "Try again" (new `Idempotency-Key`), "Use another number or operator", "Pay on delivery instead" when allowed. Expiry shows that the order was cancelled and stock released.
- `/seller/payments` (sidebar entry Payments):
  - status strip: connected account, payout account, holds with category and end date;
  - amounts at NotchPay: Awaiting delivery, In withdrawal period, Ready for payout (primary model only), Payout in progress, Paid this month;
  - legend: "Funds are held by NotchPay. BuyNSellem never holds your money.";
  - payouts table: date, amount, fee, destination (masked), status;
  - per-order breakdown: goods, delivery, commission HT, VAT, net to you, status, release date.
- `/seller/payments/payouts/[id]`: payout detail with orders and status history.
- `/seller/payments/setup`:
  - step 1 identity level (link to P2 verification when below 2);
  - step 2 NotchPay onboarding (button opens the onboarding link; requirements due listed);
  - step 3 payout account form with name-match result and the 72-hour notice before confirming a change.
- `/orders/[id]` (P4 page): payment status, refunds with expected delay, fee invoice download.

### Mobile

New routes, registered in `app/_layout.tsx`:
- `app/checkout/[orderId]/pay.tsx` and `app/checkout/[orderId]/pending.tsx`: same content as web.
  - Pending polls while foregrounded and re-checks on `AppState` `active` (the buyer typically leaves the app to approve the USSD prompt).
  - A local notification is scheduled for 1 minute before expiry if still pending.
  - Hosted checkout fallback opens `expo-web-browser` `openAuthSessionAsync` with return `buynsellem://checkout/{orderId}/pending`.
- `app/seller/payments/index.tsx`, `app/seller/payments/payouts/[id].tsx`, `app/seller/payments/setup.tsx`. Onboarding opens `openAuthSessionAsync` with return `buynsellem://seller/payments/setup` and triggers `syncConnectedAccount` on return.
- The Shop hub (`app/seller/index.tsx`) gains a Payments tile with a badge when action is required.
- `app/moderation/shop/[id].tsx` gains the Payments section.

App Store and Play compliance: the flows pay for physical goods and a fee tied to them, so non-IAP payment is allowed. No screen sells anything digital. Push notifications for payments open the order, never a purchase of a digital item.

### Internationalisation

Every string in English and French on web (`packages/web/messages/{en,fr}.json`) and mobile (`packages/mobile/src/locales/{en,fr}.json`) in the same change. Legal texts are published bilingually: fee disclosure sheet, seller payment terms with the refund and clawback clauses, invoices and credit notes. Amounts are formatted `12 500 FCFA` in French and `FCFA 12,500` in English.

## Testing

**Unit:**
- Amount computation: commission, VAT, fee clamp at min and max, `roundXaf` half-up, `applicationFee + destinationAmount = buyerTotal`, for 1,000 random orders (property test).
- Name match: exact, reordered tokens, diacritics, one-token partial, mismatch, business name at level 3, provider name overriding the typed name.
- Transition tables: `payouts`, `refunds`, `payout-holds`; `checkout` intent late success on `expired` and `cancelled` (status unchanged, `lateSuccess`, refund created).
- Ledger:
  - every posting kind is balanced;
  - duplicate `idempotencyKey` is a no-op;
  - property test of random event sequences keeps Σ all balances = 0 and never gives `seller_pending` < 0 without a matching `seller_receivable`;
  - nightly recomputation equals the caches.
- Eligibility: level below 2, connected account restricted, no payout account, hold with and without `blocksCharges`, exposure cap, `provider_schedule` maturity rules, self-purchase by member and by phone.
- Release: completed order releases; order hold, shop hold and suspension block; partial refund reduces D′ and C′; early release split for level 3.
- Change hold: second account activation creates a 72-hour hold; "This was not me" reverts and escalates; 7-day cooldown.
- Refund breakdown: full refund returns the fee; partial refund never touches the fee; `refund.amountExceeds`; `refund.windowExpired` at 85 days.
- Gate record: enabling without evidence rows or without `PROTECTED_PAYMENT_ALLOWED` is refused; `provider_hold` without G3 is refused.

**Webhook and replay:**
- NotchPay payment, refund, transfer and account events with valid and invalid signatures (no signature value in logs).
- The same event id delivered twice: one `webhook-events` row, one posting.
- The same state change delivered under two different event ids (e.g. two `transfer.complete`): the transition table ignores the second, and the posting is skipped by idempotency key.
- Out of order: `transfer.complete` before `transfer.created`, `refund.complete` before `refund.created`, `payment.succeeded` after the callback settled.
- Processing failure retried by the job without double posting.
- Full replay of a recorded sandbox day of events against an empty database twice gives identical ledgers.

**Reconciliation:**
- Fixtures producing each mismatch kind: provider payment missing locally and auto-fixed, provider payment unfetchable, local refund missing at provider, amount mismatch, status mismatch, shop balance off by 1 XAF (creates hold), corrupted cache (`unbalanced_ledger`, cache corrected, transaction untouched).
- A second run over the same window creates no new mismatch.

**Route:**
- Payment-intent creation: non-buyer 403, unpayable order, `Idempotency-Key` reuse, attempt in progress, too many attempts, unsupported channel, provider down (`payment.providerUnavailable`, intent `failed`).
- Onboarding owner-only; payout account creation owner-only with manager 403.
- Moderation payouts route: moderator vs admin-only hold reasons, member conflict.

**Integration (NotchPay sandbox, staging):**
- MTN and Orange test numbers: success, decline, timeout, expiry at 30 minutes with a late approval (refund issued).
- Onboarding of an express account.
- Refund full and partial.
- Payout release (primary) or scheduled payout mirroring (fallback).
- A nightly run with zero mismatches.

**Clients:**
- Typecheck and biome on web and mobile.
- Manual pass: pay, leave the app to approve, return; fail then retry with the other operator; let a payment expire; seller setup from level 1 to payout account active; payout account change and "This was not me"; payouts screen amounts match the ledger for a test shop.

## Verification targets

- `bun run generate:types` in `packages/api`
- `bun run check-types` in `packages/api`, `packages/web`, `packages/mobile`
- `bunx vitest run --config ./vitest.config.mts` in `packages/api`
- `bun test` in `packages/mobile`
- `bunx biome check` on touched files
- Staging with the NotchPay sandbox and `PROTECTED_PAYMENT_ALLOWED=true`: the integration pass above, 7 consecutive nightly reconciliations without open mismatches, then production with the flag off until the gate record is complete, then on for Douala and Yaoundé.

## Questions to send before implementation

### NotchPay (in writing)

- N1 (G1): Which licence under CEMAC Regulation 04/18, or which licensed partner bank, covers collections into Sync connected accounts and their payouts? How are connected-account funds segregated (art. 53), and in whose name is the segregated account held?
- N2 (G3): Can funds from a destination charge stay in the connected account until the platform triggers the payout, with a `manual` payout schedule and a platform API call releasing a given amount? Is there a maximum hold duration?
- N3: Can the platform pause and resume payouts on a connected account by API (for fraud holds), and can it prevent an `express` account holder from changing the schedule?
- N4: Does Sync support an account-level rolling reserve (a percentage of each charge held for N days)?
- N5 (G4): On a refund of a destination charge with an application fee, which balance is debited: the connected account, the platform, or both pro rata? Is the application fee refunded automatically, partially, or not at all? What happens when the connected account balance is insufficient, and can the balance go negative?
- N6: Can the platform set or change the connected account's payout destination (MTN/Orange number) by API? Does an `account.updated` webhook fire when the account holder changes it?
- N7: Does NotchPay return the operator-registered holder name for an MTN or Orange number (name lookup) before a payout or at recipient creation?
- N8: Who bears the 2% collection fee on a destination charge with an application fee, and how is it reported (per transaction, in webhooks, in balance history)? Who bears the 1% payout transfer fee on connected-account payouts?
- N9: Is "Account Debits" available by API (endpoint, webhook, limits), and can it recover a refund shortfall from future collections?
- N10: What KYC does onboarding run on `express` accounts (documents, liveness, sanctions screening), and can BuyNSellem share its level-2 KYC result to avoid a second check?
- N11 (G5): The canonical API contract: `/accounts` or `/sync/accounts`; onboarding body fields; webhook signature header and algorithm over the raw body; event field (`event` or `type`) and exact event names for payments, refunds, transfers, accounts and debits; per-connected-account balance and transaction-history endpoints.
- N12: Can a direct mobile-money charge (`POST /payments/{reference}` with `channel` and phone) carry `destination` and `application_fee`, or is the hosted page required for split payments?
- N13: Refund window (90 days) and delay (5–7 business days) for MTN and Orange: are they the same on destination charges? Is there a transfer-based alternative after 90 days?
- N14: Sandbox availability for Sync with test MTN and Orange numbers, and whether sandbox webhooks cover all Sync events.

### Lawyer

- L1 (G2): Under Regulation 04/18, does a marketplace using a provider's destination charges and receiving only an application fee provide a payment service? Does it matter that the provider is absent from the DGTCFM list and operates through a partner bank?
- L2 (G2): Is receiving the commission inside the application fee at payment time, while it remains refundable to the buyer until delivery, holding client funds? Would taking commission later by account debit be safer?
- L3: May the buyer protection fee be retained when the buyer exercises the Law 2010/021 art. 20 withdrawal right after delivery, or on partial refunds, given Law 2011/012 art. 5 (liability-limiting clauses void)?
- L4 (G4): If BuyNSellem refunds a buyer from its own revenue and then recovers the amount from the seller by debiting the seller's connected account, is that money transmission, a guarantee requiring an insurance approval (CIMA code), or a lawful commercial guarantee? Does the order of operations (advance first, recover after) change the answer?
- L5: Are the clawback, set-off against future collections and rolling reserve clauses enforceable against sole-trader sellers, and what notice must the seller terms give?
- L6: VAT: confirm 19.25% (including the additional council tax) on commission invoiced to sellers and on the buyer protection fee invoiced to consumers; invoice mentions required; whether the 2026 finance law's real-time platform taxation requires transmitting these invoices or order data to the tax administration.
- L7: Retention periods for payment, ledger and invoice records (Law 2010/021 art. 32, OHADA accounting rules) and for payout account numbers after a shop closes.
