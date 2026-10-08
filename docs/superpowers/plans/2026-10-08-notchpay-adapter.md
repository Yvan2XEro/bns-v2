# NotchPay Marketplace Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the P5 protected-payment economy its first real provider: a `NotchPayMarketplaceProvider` that implements the landed `MarketplaceProvider` port strictly over NotchPay's API, registers through `registerMarketplaceProvider` only when its keys are configured, and passes `runMarketplaceContract` — the same suite the fake passes — deterministically in CI against recorded fixtures, and again (user-run) against the live sandbox. The adapter is the thing `adapterPresenceRefusal` has been waiting for; nothing here flips a flag: production enablement still requires the G1–G6 gate record, `PROTECTED_PAYMENT_ALLOWED=true`, and the user's own staging pass.

**Architecture: one adapter behind the existing port, nothing else moves.** Every service, route and job keeps calling `getMarketplaceProvider(settings)`; the fake keeps serving every non-production environment and every existing test. The adapter is reached only through the registry (a source scan pins it), speaks to NotchPay through an injectable transport — live `fetch` in production, a fail-closed replay of committed fixtures in CI, a recorder in the user's sandbox run — and reuses `lib/payments/notchpay.ts` (the client the user's reseller payouts already run on in production) for the webhook HMAC discipline, the status mapper and the wire idioms (`Authorization` public key, `X-Grant` private key, `Idempotency-Key` header, envelope unwrapping). The fixtures are the assumption ledger: every wire detail the public docs or the client code could not settle is hand-authored, tagged `ASSUMED(An)`, and verified by re-recording against the sandbox — a re-record that keeps the contract green is exactly the G5 evidence.

**Tech Stack:** Payload CMS 3.79 + MongoDB (`packages/api`, vitest via `bun run test:int` — never `bun test` there), `node:crypto` HMAC-SHA256, no new dependencies. No client (web/mobile) work: the adapter is invisible above the port.

**Spec:** `docs/superpowers/specs/2026-09-15-p5-protected-payment-design.md` — binding authority on adapter semantics, especially "Provider interface", gate G5 ("the adapter maps whatever the sandbox returns; the rest of P5 depends only on the normalised shapes"), and the N1–N14 / L1–L7 question lists (triaged below). Where the spec's interface sketch and the landed port differ (`parseWebhookEvent`, the event unions), **the landed port and `runMarketplaceContract` win** — the contract is this plan's central acceptance criterion.

This plan carries **16 assumed wire details**, tagged `ASSUMED(A1)`–`ASSUMED(A16)` in the ledger below. Each one is encoded in a fixture's `assumed` array; the recorder clears a tag only by observing the sandbox, and Task 9's evidence packer refuses to produce the G5 document while any tag remains.

## Global Constraints

Carried from the P5 plan's Global Constraints verbatim where applicable, plus the adapter's own; every task's requirements implicitly include this section.

- **Hexagonal, strictly — now with a concrete adapter to leak.** No service, route, job or client test imports `notchpayMarketplace.ts`; only `lib/payments/registerAdapters.ts` (and this plan's own specs and fixtures helpers) may. Task 7's source scan pins it. Everything else keeps reaching the provider through `getMarketplaceProvider(settings)`; the fake keeps serving `NODE_ENV !== "production"` and `PAYMENTS_PROVIDER=fake` unchanged — registering the adapter must not alter a single existing test's provider.
- **The flag stays off.** This plan changes no `AppSettings` default and files no gate row. `adapterPresenceRefusal` goes quiet in production once keys are configured (that is the point), but `missingGates` and `PROTECTED_PAYMENT_ALLOWED` still refuse enablement. Obtaining G1–G6 evidence is the user's (User gates section).
- **Money is integers in XAF.** Amounts pass through the adapter untouched — no unit conversion, no rounding. Destination charges send **fixed `application_fee` and `destination.amount`, never `application_fee_percent`** (the docs offer it; the P5 constraint forbids it so the ledger is exact).
- **Error taxonomy is the port's law** (`lib/payments/marketplace.ts` header): every call gives up after 15 s; timeout, network failure or 5xx → `ProviderUnavailableError(method)`; a 4xx the provider answers → `ProviderRequestError(method, status, message)`; an operation NotchPay cannot perform → `ProviderCapabilityError("notchpay", method)`; a bad or missing webhook signature → P0's `WebhookSignatureError`. The adapter never throws a bare `Error` out of a port method.
- **Idempotency everywhere money moves.** `Idempotency-Key` header on every mutating call that has a caller-supplied key (transfers already do this in `notchpay.ts`); refunds additionally enforce the key adapter-side (Review Focus 3) because NotchPay does not document refund idempotency. A replayed webhook body normalises to the same `providerEventId`, so P0's `webhook-events` dedupe holds.
- **Secrets never land in the repo.** `NOTCHPAY_PUBLIC_KEY`, `NOTCHPAY_PRIVATE_KEY`, `NOTCHPAY_HASH_KEY` come only from env (already threaded through all five compose files by P5). The recorder redacts `Authorization`/`X-Grant` before writing a fixture; recorded webhook bodies are re-signed at replay time with the fixture hash key constant, so no live signature or key is ever committed. Signature values are never logged (P0's rule, kept).
- **No network in CI.** The contract runs on the replay transport by default; the live/record pass exists only behind `NOTCHPAY_SANDBOX=record` and reports itself skipped otherwise. The replay transport fails closed: an unmatched request throws naming method and path — it never falls through to `fetch`.
- **Reuse the landed client, don't fork it.** `lib/payments/notchpay.ts` stays the boost/reseller transport, untouched at its call sites; this plan only exports what the adapter shares (`mapNotchPayStatus` is already exported; Task 1 exports the field readers, Task 5 extracts the signature check). `services/resellerPayouts.ts` keeps creating transfers through it; only its *webhooks* flow through the adapter once registered, so transfer events must preserve `reference` for the `RP-` dispatch in `processWebhookEvent`.
- **Ceilings (AGENTS.md), measured with the published commands on a quiet tree:** `check-types:tests` ≤ 105; `as never` in `packages/api/tests` ≤ 86; client casts ≤ 78; mobile advisory ≤ 35. None may rise.
- **Runners:** `packages/api` is vitest — `bun run test:int` or `bunx vitest run --config ./vitest.config.mts <file>`, never `bun test` there. No collection changes are expected; if one appears, `bun run generate:types` committed with it.
- **Commits one line, no attribution trailers** (the `.husky/commit-msg` hook strips and fails them; never `--no-verify`). Docs in English; comments sparse — only non-obvious reasons.

## Review Focus

The five failure modes no single task's tests would otherwise exercise, most likely first. Each line's pinning test is assigned to the owning task.

1. **A fixture that drifts from the sandbox must fail loudly, not pass quietly.** The replay transport refuses any request it has no fixture for (throw naming method + path, journal intact), and the recorder *overwrites* a fixture wholesale — it never merges, so a changed sandbox answer cannot half-survive. The same contract spec must pass on hand-authored fixtures today and on recorded truth after the user's re-record, without editing a test. → Task 1's fail-closed pin; Task 8's overwrite pin.
2. **The dual envelope must normalise to one event.** The same NotchPay fact arrives as `{ event: "payment.complete", … }` on today's live boost traffic and as `{ type: "payment.succeeded", … }` in the Sync docs. Both spellings must produce byte-identical `NormalisedEvent`s — same `providerEventId`, same `type: "payment/succeeded"` — or P0's `webhook-events` dedupe splits and the ledger posts twice. → Task 5's dual-spelling matrix.
3. **Refund idempotency must hold even if NotchPay ignores the header.** `createRefund` lists the payment's refunds first and matches `metadata.idempotency_key`: a replay returns the existing `refundId` with zero POSTs; the same key with a different amount throws 409 **before any wire write**. The `Idempotency-Key` header is sent too (`ASSUMED(A8)`), but correctness never depends on it. → Task 4's triple.
4. **The split-sum guard runs before money can move.** `applicationFee + destination.amount !== amount` is refused with `ProviderRequestError(…, 400)` and an **empty transport journal** — the contract's "refused before any money moves" clause is enforced in the adapter, not delegated to a provider that may not validate it. → Task 3's journal pin.
5. **Registration must not leak or displace.** With all three keys set: production serves the adapter, every other env still serves the shared fake (the existing registry spec's rule); with any key missing, nothing registers and `adapterPresenceRefusal` still refuses. A source scan proves `notchpayMarketplace` is imported only by `registerAdapters.ts`, `lib/payments` internals and this plan's test helpers. → Task 7's matrix + scan.

## Current state (verified 2026-10-08)

- **The port:** `packages/api/src/lib/payments/marketplace.ts` — `MarketplaceProvider` with 16 methods + `id`, the normalised unions (`NormalisedEvent` = payment/refund/transfer/account/debit), and the three error classes. `NormalisedEvent.type` is the normalised `{entity}/{status}`, not the provider's event name.
- **The law:** `tests/int/helpers/marketplaceContract.ts` — `runMarketplaceContract(makeProvider, driver)` with `MarketplaceContractDriver` (`activeAccount`, `completeOnboarding`, `settlePayment`, `settleTransfer`, `seedBalance`, optional `capabilityGap`). `tests/int/marketplace-contract.int.spec.ts` runs it against the fake and re-exports it for adapter specs. Clauses: account lifecycle through an onboarding link; unknown account → 404 `ProviderRequestError`; destination charge with fixed split, `verifyPayment` pending by **our** reference; inconsistent split refused before money moves; genuine webhook verifies and re-parses identically, tampered body or signature → `WebhookSignatureError`; refund idempotency (same key same refund, key reuse with new amount → 409); transfer statuses all normalised, events typed `transfer/{status}`, last event matches `getTransfer`; funded balance answered, unknown account 404; declared capability gap → `ProviderCapabilityError` naming provider and method.
- **The registry:** `lib/payments/marketplaceRegistry.ts` — `registerMarketplaceProvider(name, factory)` returns an unregister function; `getMarketplaceProvider` serves the shared fake outside production, the registered factory in production, `payment.providerUnavailable` (503) otherwise; `adapterPresenceRefusal` is the settings hook's refusal sentence. **Nothing registers an adapter today and no registration site exists** — Task 7 creates it.
- **The webhook spine:** `lib/paymentWebhookRoute.ts#handleMarketplaceWebhook` already verifies through the registry provider, stores to `webhook-events`, answers 200, queues `processWebhookEvent`; in production with no adapter it falls back to the legacy P0 NotchPay path so boosts keep settling. `processWebhookEvent` → `services/webhookEvents.ts` dispatches on the normalised `entity`; transfer references starting `RP-` route to `services/resellerPayouts.ts`.
- **The client (the user's own, in production):** `lib/payments/notchpay.ts` — `NotchPayProvider` with `createPayment` (`POST /payments`, envelope `{ transaction, authorization_url }`), `verifyPayment` (`GET /payments/{ref}`, `mapNotchPayStatus`), `createTransfer` (`POST /transfers` with `Authorization` + `X-Grant` + `Idempotency-Key`), `verifyWebhook` (HMAC-SHA256 of the raw body against `NOTCHPAY_HASH_KEY`, header `x-notch-signature`, 64-hex guard + `timingSafeEqual`), `parseNotchPayWebhookEvent` (field `event`, `data.merchant_reference`/`trxref`, `EVENT_STATUSES` for `payment.complete|failed|canceled|cancelled|expired`). `lib/payments/index.ts#getNotchPayProvider` builds it from `NOTCHPAY_PUBLIC_KEY`/`NOTCHPAY_BASE_URL`/`NOTCHPAY_HASH_KEY`/`NOTCHPAY_PRIVATE_KEY`. `services/resellerPayouts.ts#submitResellerPayout` calls `createTransfer` with `channel` from `PAYOUT_METHOD_CHANNELS`, reference `RP-…`, idempotency key `reseller-payout:{id}`.
- **The gate record:** `lib/paymentSettings.ts#missingGates` + `PROTECTED_PAYMENT_ALLOWED` + `collections/PaymentGateEvidence.ts` (admin-only upload, pdf/jpeg/png/webp ≤ 20 MB, P2 private storage) all landed in P5; `AppSettings.payments.gates` rows reference the uploads. `PAYMENT_PROVIDERS = ["notchpay"]`.
- **The fake:** `lib/payments/fakeMarketplace.ts` signs webhooks `x-fake-signature` (HMAC-SHA256), `script`/`advance` sequencing, zod-validated event bodies — the behavioural reference; its contract driver shape is what Task 6's recorded driver mirrors.
- **Compose:** `PAYMENTS_PROVIDER`, `NOTCHPAY_PRIVATE_KEY`, `PROTECTED_PAYMENT_ALLOWED` threaded through all five compose files, empty by default (P5 release record).
- **NotchPay public docs (developer.notchpay.co, read 2026-10-08):** auth = `Authorization` public key, `X-Grant` private key on refunds/transfers/balance. Connected accounts documented at **both** `POST /accounts` (Sync integration guide, onboarding body `{ callback }`) **and** `POST /sync/accounts` (account-management guide, onboarding body `{ redirect_url, refresh_url }`) — the G5 discrepancy the spec predicted. `GET /sync/accounts/{id}` → `account.requirements.currently_due`, `account.verification.status`. Destination charge: `POST /payments` + `application_fee` (fixed) + `destination: { account, amount }`; response `{ transaction: { id, reference: "trx.…", trxref, status }, authorization_url }`. Direct charge: `POST /payments/{reference}` with `{ channel: "cm.mtn", data: { account_number | phone } }` → 202 `processing`. Refunds: `POST /refunds` `{ payment, amount?, reason, metadata }` (X-Grant), statuses `pending|processing|complete|failed`, `GET /refunds/{id}`, `GET /payments/{id}/refunds`, webhooks `refund.created|complete|failed` with field `type`; 90-day limit; original fees not refunded. Webhook verification guide: HMAC-SHA256 over the raw body, header **`x-notch-signature`**, dedicated hash key (the Sync sample alone shows `notchpay-signature`). Sync events listed: `account.created|updated`, `account.application.deauthorized`, `payment.succeeded|failed`, `transfer.created|complete|failed`. Balance: `GET /balance`, `GET /balance/history?page&limit&type&date_start&date_end` (types `payment|transfer|refund|adjustment`) — platform-level; **no per-connected-account balance or history endpoint documented**. "Account Debits" named as a Sync feature with no endpoint documented.

## Wire contract — port method → NotchPay call

The single mapping the adapter implements. "doc" = answered by the public docs or by `notchpay.ts`'s working production code; `An` = assumed, see the ledger.

| Port method | Call | Authority |
|---|---|---|
| `createConnectedAccount` | `POST /sync/accounts` `{ type, business_profile: { name }, email, phone, metadata: { shop_id } }` → `account.id` | doc (both spellings) + A1 |
| `createOnboardingLink` | `POST /sync/accounts/{id}/onboarding` `{ redirect_url, refresh_url }` → `{ url }` | doc (both bodies) + A2 |
| `getConnectedAccount` | `GET /sync/accounts/{id}` → `NormalisedAccount` | doc + A3 (field names for enabled flags, schedule, holder name, status values) |
| `setPayoutSchedule` | `PUT /sync/accounts/{id}` `{ payout_schedule }` | A4 (undocumented; N2/N3) |
| `createDestinationCharge` | adapter-side sum guard, then `POST /payments` with fixed `application_fee` + `destination` → `transaction.reference`, `authorization_url?` | doc + A5 |
| `chargeMobileMoney` | `POST /payments/{ourReference}` `{ channel, data: { account_number } }` | doc + A6 (payer key) + A5 (split compat, N12) |
| `verifyPayment` | `GET /payments/{ourReference}` → `NormalisedPayment` | doc + A7 (by merchant reference) + A14 (fee/destination fields) |
| `createRefund` | pre-list `GET /payments/{ref}/refunds`, match `metadata.idempotency_key`; else `POST /refunds` `{ payment, amount, reason, metadata: { idempotency_key, payment_reference } }` + `Idempotency-Key` header | doc + A8 |
| `getRefund` | `GET /refunds/{id}`; `paymentReference` from `metadata.payment_reference`, fallback payment lookup | doc + A9 |
| `releasePayout` | `POST /sync/accounts/{id}/payouts` `{ amount, currency, reference }` → `transferId` | A10 (undocumented; N2/G3) |
| `getTransfer` | `GET /transfers/{id}` → `NormalisedTransfer` | doc (`notchpay.ts` wire) |
| `debitConnectedAccount` | **`ProviderCapabilityError("notchpay", "debitConnectedAccount")`** until N9 is answered | doc gap (feature named, no endpoint) |
| `listTransactions` | `GET /balance/history?page&limit=100&date_start&date_end(&account)`; refund/transfer rows enriched via `getRefund`/`getTransfer` so `reference` carries our key; payment rows status `succeeded` (balance history records settled movements) | doc + A12 |
| `getConnectedAccountBalance` | `GET /sync/accounts/{id}/balance` → `{ available, pending }` | A11 |
| `verifyWebhook` | HMAC-SHA256 over raw body, header `x-notch-signature` (fallback `notchpay-signature`), then `parseWebhookEvent` | doc + `notchpay.ts` + A16 |
| `parseWebhookEvent` | event-name table below, envelope field `type ?? event`, id `event.id` | doc + A13/A16 |

**Event-name table** (one table, both spellings — the spec's own instruction):

| NotchPay name | Normalised |
|---|---|
| `payment.complete`, `payment.succeeded` | `payment` / `succeeded` |
| `payment.failed` | `payment` / `failed` |
| `payment.canceled`, `payment.cancelled` | `payment` / `cancelled` |
| `payment.expired` | `payment` / `expired` |
| `refund.created` | `refund` / `pending` |
| `refund.complete` | `refund` / `succeeded` |
| `refund.failed` | `refund` / `failed` |
| `transfer.created` | `transfer` / `pending` |
| `transfer.sent`, `transfer.processing`, `transfer.reversed` | `transfer` / same (A15) |
| `transfer.complete` | `transfer` / `complete` |
| `transfer.failed` | `transfer` / `failed` |
| `account.created`, `account.updated` | `account` / status from `data` (A3) |
| `account.application.deauthorized` | `account` / `deauthorized` |
| anything else | `payment` entity, status `mapNotchPayStatus(data.status)` — byte-compatible with P0's legacy parser so boost events keep settling through the same URL |

## ASSUMED ledger — the 16 tags the sandbox must clear

Every tag lives in at least one fixture's `assumed` array; Task 9's packer refuses the G5 document while any remains. **Never silently guess beyond this list: a new assumption during implementation gets the next tag and joins a fixture.**

- **ASSUMED(A1)** — connected accounts are created at `POST /sync/accounts`; `POST /accounts` (also documented) is the fallback if the sandbox 404s.
- **ASSUMED(A2)** — the onboarding-link body is `{ redirect_url, refresh_url }` at `/sync/accounts/{id}/onboarding`; the alternative documented body is `{ callback }`.
- **ASSUMED(A3)** — the account object's field names for the enabled flags (`charges_enabled`, `payouts_enabled`), the payout schedule, the verified holder name (`kycName`), and the exact status strings mapped onto `ConnectedAccountStatus` (docs show only `requirements.currently_due` and `verification.status`).
- **ASSUMED(A4)** — the payout schedule is written with `PUT /sync/accounts/{id}` `{ payout_schedule: "manual" | … }` (undocumented; the answer to N2/N3 may replace or remove this call).
- **ASSUMED(A5)** — a payment carrying `destination` + `application_fee` still accepts direct channel processing (N12) and answers the standard `{ transaction, authorization_url }` envelope.
- **ASSUMED(A6)** — the payer number key in the process body is `data.account_number` (docs show both `account_number` and `phone`); the operator prompt text, when present, is in `message`/`action`.
- **ASSUMED(A7)** — `GET /payments/{reference}` resolves by our merchant reference (`trxref`), not only by the `trx.…` provider reference (today's boost code verifies by provider reference; the port requires ours).
- **ASSUMED(A8)** — `POST /refunds` honours the `Idempotency-Key` header the way `/transfers` does; adapter-side metadata matching makes correctness independent of it.
- **ASSUMED(A9)** — refund objects and `refund.*` webhooks expose `metadata` (echoed back) and `payment`; the payment's `merchant_reference` is recoverable for `RefundEvent.paymentReference` when metadata is absent (dashboard-created refunds).
- **ASSUMED(A10)** — a platform-triggered payout of a connected account's funds exists at `POST /sync/accounts/{id}/payouts` `{ amount, currency, reference }` and answers a transfer id tracked by `GET /transfers/{id}` (the heart of `provider_hold`; N2/G3 decides).
- **ASSUMED(A11)** — a per-connected-account balance exists at `GET /sync/accounts/{id}/balance` shaped like the documented platform `GET /balance`.
- **ASSUMED(A12)** — `GET /balance/history` accepts an `account` filter for connected-account activity; without it, reconciliation's per-account pass falls back to the platform history (window-complete but unscoped).
- **ASSUMED(A13)** — the webhook envelope carries its event id at `id` (today's code reads it; no doc shows one).
- **ASSUMED(A14)** — payment facts on a destination charge carry `destination.account` (→ `accountId`) and the collection fee (`fee`), in webhooks and on `GET /payments/{ref}` (N8's reporting half).
- **ASSUMED(A15)** — transfer lifecycles emit `transfer.sent`/`transfer.processing`/`transfer.reversed` names matching the documented statuses, and connected-account payouts carry `data.account`.
- **ASSUMED(A16)** — which envelope the Sync sandbox actually sends: field `type` with Sync names (docs) vs `event` with legacy names (today's live boost traffic), and header `x-notch-signature` (verification guide + working code) vs `notchpay-signature` (Sync sample). The adapter reads both; the record run pins which arrived.

## The N1–N14 / L1–L7 triage

**(a) Answered by the API docs or the client code** (cite; no task needed beyond encoding them):
- N11, the mechanics half: signature = HMAC-SHA256 over the raw body with the dedicated hash key, header `x-notch-signature` — `get-started/webhooks/verify` + the working `notchpay.ts#verifyWebhook`. Event names for payments/refunds/transfers/accounts — `sync/integration` + `accept-payments/refunds`. Both endpoint spellings and both onboarding bodies are *in the docs*, which is why the canonical choice stays A1/A2 rather than answered.
- N12, the wire half: direct charge processing is `POST /payments/{reference}` `{ channel, data }` — `accept-payments/charge`. (Split-compatibility is A5.)
- N13, the window half: 90-day refund limit and non-refunded collection fees — `accept-payments/refunds` Limitations. (Whether destination charges differ, and any post-90-day alternative: user, below.)
- N8, the reporting half: `GET /balance/history` itemises `payment|transfer|refund|adjustment` with amounts and references — `api-reference/balance`. (Who bears which fee on a split: user/sandbox.)
- Auth (`Authorization` + `X-Grant`), transfer wire shape, `Idempotency-Key` on transfers: `notchpay.ts` + `services/resellerPayouts.ts`, in production.

**(b) Assumed pending sandbox verification:** exactly the ledger, A1–A16. The implementer encodes each in a fixture; the user's record run (Task 8) verifies or refutes; a refuted assumption is a fixture + adapter fix, never a port or service change (G5's own rule).

**(c) Genuinely the user's / the lawyer's** — see User gates below; never implementation tasks here.

## User gates — the user's and the lawyer's, not this plan's

Collected, not decided. No task below waits on any of these; they gate *enablement*, which stays refused in code.

- **N1 (G1)** licence / partner bank under CEMAC 04/18, segregation of Sync balances — written answer filed as G1 evidence.
- **N2 (G3)** can destination-charge funds be held in the connected account until a platform-triggered payout (`manual` schedule)? Decides `releaseModel` (`provider_hold` vs `provider_schedule`) and confirms or kills A4/A10.
- **N3** pausing/resuming payouts by API; locking an `express` holder's schedule.
- **N4** account-level rolling reserve (fallback model's eligibility arm).
- **N5 (G4)** which balance a destination-charge refund debits, what happens to the application fee, negative balances — filed as G4 evidence; until then the clawback's `platform_advance` arm stays dependent on L4.
- **N6** platform-set payout destination by API + `account.updated` on holder changes (would extend `services/payoutAccounts.ts`, not the port).
- **N7** operator name lookup for MTN/Orange numbers (name-match hardening).
- **N9** Account Debits endpoint, webhook and limits — answering it yes replaces `debitConnectedAccount`'s `ProviderCapabilityError` with a wire call (one small follow-up task, fixtures + contract gap removal).
- **N10** KYC run on `express` onboarding; reuse of BuyNSellem's level-2 KYC.
- **N13** (policy half) refund window/delay on destination charges; post-90-day alternative.
- **N14** sandbox access for Sync with test MTN/Orange numbers and full webhook coverage — the *prerequisite for Task 8's record run*; the user obtains the sandbox keys.
- **L1–L7** the lawyer's list, verbatim from the spec (G2 opinion, commission-holding, fee retention, advance-and-recover, clawback enforceability, VAT confirmation, retention periods).
- **G1–G6 evidence** — obtaining every document is the user's; Task 9 only builds the G5 artefact from a green record run and proves the record flips.
- Carried from the P5 release record: the bilingual seller payment terms, and the 12 U-items — unchanged by this plan.

## File structure

New, `packages/api/`:
- `src/lib/payments/notchpayWire.ts` (+ Task 1 test) — `WireRequest`/`WireResponse`, `NotchPayTransport`, `liveTransport`, `TransportFailure`.
- `src/lib/payments/notchpayMarketplace.ts` — the adapter (Tasks 2–5 build it up; one file, sequential waves).
- `src/lib/payments/notchpayMarketplaceEvents.ts` — the event-name table + `parseNotchPayMarketplaceEvent` (pure).
- `src/lib/payments/registerAdapters.ts` — the only importer of the adapter outside `lib/payments` tests.
- `src/scripts/packNotchpayEvidence.ts` — the G5 evidence document builder.
- `src/scripts/webhookInbox.ts` — the sandbox webhook capture helper (Bun script, not a test).
- `tests/int/helpers/notchpayReplay.ts` — `ReplayTransport`, `RecordTransport`, fixture loading.
- `tests/int/helpers/notchpayContractDriver.ts` — the recorded `MarketplaceContractDriver` (+ the sandbox driver's shared parts).
- `tests/int/fixtures/notchpay/*.json` — the fixture set (hand-authored in Task 6, re-recorded by the user in Task 8).
- `tests/int/notchpay-adapter.int.spec.ts` (grows Tasks 2–5), `notchpay-marketplace-contract.int.spec.ts` (Task 6), `notchpay-registration.int.spec.ts` (Task 7), `notchpay-sandbox.live.int.spec.ts` (Task 8, env-gated), `notchpay-evidence.int.spec.ts` (Task 9), `notchpay-staging-rehearsal.int.spec.ts` (Task 10).

Modified: `src/lib/payments/notchpay.ts` (export the three field readers; extract `verifyNotchPaySignature` — behaviour identical, boost/reseller call sites untouched), `src/payload.config.ts` (one `registerConfiguredAdapters()` call), `docs/superpowers/releases/` (Task 10's record).

## Task dependency structure

- Wave 1: Task 1 (transport + fixture infrastructure).
- Waves 2–5, sequential (one adapter file): Task 2 (accounts), Task 3 (charges), Task 4 (refunds/transfers/balance/debit), Task 5 (webhooks).
- Wave 6: Task 6 (recorded driver + the contract in CI).
- Wave 7 (parallel): Task 7 (registration), Task 8 (live sandbox record mode).
- Wave 8: Task 9 (G5 evidence path).
- Wave 9: Task 10 (rehearsal + release record — the buildable half of the user's staging criterion).

Worktree-per-agent; tasks sharing `notchpayMarketplace.ts` are strictly sequential by wave.

## Wave 1 — the transport

### Task 1: `notchpayWire.ts` — live, replay, fail-closed

**Files:**
- Create: `packages/api/src/lib/payments/notchpayWire.ts`, `packages/api/tests/int/helpers/notchpayReplay.ts`.
- Modify: `packages/api/src/lib/payments/notchpay.ts` — add `export` to `toText`, `toAmount`, `toCurrency` (no other change).
- Test: `packages/api/tests/int/notchpay-wire.int.spec.ts` (**new**).

**Interfaces:**
- Produces, `notchpayWire.ts`:

```ts
export interface WireRequest {
	method: "GET" | "POST" | "PUT";
	path: string; // "/sync/accounts/acct_123/onboarding"
	query?: Record<string, string>;
	body?: unknown;
	idempotencyKey?: string;
}
export interface WireResponse {
	status: number;
	body: unknown; // parsed JSON, or null when unparseable
}
export type NotchPayTransport = (request: WireRequest) => Promise<WireResponse>;

/** Timeout or network failure; the adapter maps it to ProviderUnavailableError(method). */
export class TransportFailure extends Error {}

export function liveTransport(config: {
	baseUrl: string;
	publicKey: string;
	privateKey: string;
	timeoutMs?: number; // 15_000; a parameter only so the hang test stays fast
}): NotchPayTransport;
```

  `liveTransport` sends `Authorization` (public key), `X-Grant` (private key), `Content-Type`/`Accept: application/json`, `Idempotency-Key` when given, `AbortSignal.timeout(timeoutMs)`; a fetch rejection or abort throws `TransportFailure`; any HTTP response — 2xx, 4xx or 5xx — is returned as a `WireResponse` (taxonomy is the adapter's job, so replay and live are indistinguishable above the transport).
- Produces, `notchpayReplay.ts` (test helper, so vitest-only code never ships):

```ts
export interface NotchPayFixture {
	key: string; // "sync-account-create"
	request: { method: string; path: string; when?: string }; // path with {tokens}; when: "payment:{ref}=succeeded"
	response: { status: number; body: unknown }; // string values may hold "{token}" substitutions
	sets?: string; // state effect of a matched call: "payment:{ref}=pending" (a charge makes its payment verifiable)
	binds?: Record<string, string>; // captures from the request: { refundIdempotencyKey: "body.metadata.idempotency_key" }
	assumed?: string[]; // ["A1", "A2"] — cleared only by the recorder
}
export class ReplayTransport {
	constructor(fixtures: NotchPayFixture[]);
	readonly journal: WireRequest[]; // every request, matched or not
	setMode(key: string, value: string): void; // the driver's lever: "payment:PI-x" → "succeeded"
	transport(): NotchPayTransport;
}
export function loadNotchpayFixtures(): NotchPayFixture[]; // reads tests/int/fixtures/notchpay/*.json
```

  Matching: method + path pattern (`/payments/{ref}`), then `when` against the mode map; a token with no mode yet is `"initial"`, so e.g. `GET /payments/{ref}` serves the 404 fixture for a reference no charge created, and the charge fixture's `sets: "payment:{ref}=pending"` is what makes the same route answer pending afterwards — provider state advances through matched calls and `setMode`, exactly like the fake's `script`/`advance`. **No match → `throw new Error(\`no NotchPay fixture for ${method} ${path}\`)`** — Review Focus 1's fail-closed pin. Substitution: `{tokens}` bind from the matched path, from `binds` captures, and from the request body's own string fields, and the binding environment **persists across calls** (a later `/balance/history` response can carry the `{refundIdempotencyKey}` bound when `POST /refunds` matched; a rebind overwrites, which the contract's call order makes safe).
- Consumes: nothing; `RecordTransport` is Task 8's (it needs the live half first).

- [ ] **Step 1: failing tests** — `liveTransport` against a local `node:http` server: headers asserted whole-object (Authorization, X-Grant, Idempotency-Key present/absent, Accept); 4xx and 5xx returned as `WireResponse`, not thrown; a server that never answers with `timeoutMs: 50` throws `TransportFailure` (and defaults to 15 000 when omitted — assert the default constant by export); unparseable body → `body: null`. `ReplayTransport`: a fixture with `{ref}` tokens substitutes the caller's reference into the response; before any charge, `GET /payments/{ref}` serves the `initial`-mode 404 fixture, after a matched charge (`sets`) it serves pending, after `setMode(…, "succeeded")` succeeded; a `binds` capture from one call appears substituted in a later call's response; an unmatched request throws naming method and path and still lands in `journal`; `loadNotchpayFixtures` round-trips a temp fixture file.
- [ ] **Step 2–3: implement, green** — `bunx vitest run --config ./vitest.config.mts tests/int/notchpay-wire.int.spec.ts`; the full suite stays green (the `notchpay.ts` export change is additive).
- [ ] **Step 4: mutation** — make the replay matcher fall back to the first fixture on no match → the fail-closed case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): the NotchPay wire transport — live, replay, fail-closed`

## Wave 2 — the adapter: connected accounts

### Task 2: `NotchPayMarketplaceProvider` skeleton + the account methods

**Files:**
- Create: `packages/api/src/lib/payments/notchpayMarketplace.ts`.
- Test: `packages/api/tests/int/notchpay-adapter.int.spec.ts` (**new**, grows through Task 5).

**Interfaces:**
- Produces:

```ts
export interface NotchPayMarketplaceConfig {
	publicKey: string;
	privateKey: string;
	hashKey: string;
	baseUrl?: string; // default "https://api.notchpay.co"
	transport?: NotchPayTransport; // default liveTransport(config)
}
export class NotchPayMarketplaceProvider implements MarketplaceProvider {
	readonly id = "notchpay" as const;
	constructor(config: NotchPayMarketplaceConfig);
	// Tasks 2–5 fill the 16 methods; every wire hop goes through:
	private async call<T>(method: MarketplaceMethod, request: WireRequest, read: (body: unknown) => T): Promise<T>;
}
```

  `call` is the one place the taxonomy lives: `TransportFailure` → `ProviderUnavailableError(method)`; `status >= 500` → `ProviderUnavailableError(method, status)`; `status >= 400` → `ProviderRequestError(method, status, message)` with `message` from the body's `message` field (`toText`, no body echo — bodies can carry phone numbers); otherwise `read(body)`, and a `read` that cannot find its envelope throws `ProviderRequestError(method, 502, "unexpected NotchPay response shape")`.
- Produces, the account half (wire per the mapping table, tags A1–A4):
  - `createConnectedAccount({ shopId, name, email, phone, type })` → `POST /sync/accounts` with `business_profile: { name }`, `metadata: { shop_id: shopId }`; reads `account.id ?? data.account.id` (envelope tolerance mirrors `createTransfer`'s).
  - `createOnboardingLink(accountId, { returnUrl, refreshUrl })` → `POST /sync/accounts/{id}/onboarding` `{ redirect_url: returnUrl, refresh_url: refreshUrl }`; reads `url`.
  - `getConnectedAccount(accountId)` → `GET /sync/accounts/{id}`; `NormalisedAccount` via one exported table:

```ts
/** ASSUMED(A3): the sandbox's account status vocabulary. */
const ACCOUNT_STATUSES: Record<string, ConnectedAccountStatus> = {
	pending: "created",
	created: "created",
	onboarding: "onboarding",
	incomplete: "onboarding",
	restricted: "restricted",
	active: "active",
	disabled: "disabled",
	deauthorized: "deauthorized",
};
```

    `requirementsDue` = `requirements.currently_due ?? []` (strings only, filtered); `kycStatus` = `verification.status ?? null`; `kycName` = `verification.name ?? account.name ?? null` (A3); `chargesEnabled`/`payoutsEnabled` from `charges_enabled`/`payouts_enabled` coerced to boolean (A3); `payoutSchedule` from `payout_schedule` when it is one of the four port values, else `null`.
  - `setPayoutSchedule(accountId, schedule)` → `PUT /sync/accounts/{id}` `{ payout_schedule: schedule }` (A4), void.
- Consumes: Task 1's transport + replay; the port's types and errors.

- [ ] **Step 1: failing tests** (all through `ReplayTransport` with inline fixtures; the committed fixture set is Task 6's): create → the journal's one request asserted **whole-object** (method, path, body including `metadata.shop_id`); onboarding link echoes the https URL; `getConnectedAccount` fresh account → whole-object `NormalisedAccount` `{ status: "created", chargesEnabled: false, payoutsEnabled: false, requirementsDue: [...], … }`; after `setMode("account:{id}", "active")` → `active` with both flags true, schedule `manual`; unknown account fixture (404 body `{ message: "Account not found" }`) → `ProviderRequestError` matching `{ method: "getConnectedAccount", status: 404 }`; a 503 fixture → `ProviderUnavailableError`; a `TransportFailure` transport → `ProviderUnavailableError`; `ACCOUNT_STATUSES` totality: every mapped value is a `ConnectedAccountStatus` (`Record` pins it at compile time; assert the key count so additions are deliberate).
- [ ] **Step 2–3: implement, green.**
- [ ] **Step 4: mutation** — let `call` throw the raw body message for 5xx instead of `ProviderUnavailableError` → the 503 case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): the NotchPay marketplace adapter — connected accounts over the sync API`

## Wave 3 — the adapter: charges

### Task 3: destination charge, mobile-money processing, verifyPayment

**Files:**
- Modify: `packages/api/src/lib/payments/notchpayMarketplace.ts`.
- Test: extend `packages/api/tests/int/notchpay-adapter.int.spec.ts`.

**Interfaces:**
- Produces:
  - `createDestinationCharge(input)` — **first**, before any wire call: `if (input.applicationFee + input.destination.amount !== input.amount) throw new ProviderRequestError("createDestinationCharge", 400, "split does not sum to amount")` (Review Focus 4). Then `POST /payments` `{ amount, currency, customer, description, reference, callback: callbackUrl, application_fee, destination: { account, amount } }` — fixed amounts, no `application_fee_percent` key ever present; reads `providerReference = toText(transaction.reference) || input.reference`, `checkoutUrl = toText(authorization_url) || undefined`.
  - `chargeMobileMoney(reference, { channel, phone })` → `POST /payments/{reference}` `{ channel, data: { account_number: phone } }` (A6); `status = mapNotchPayStatus(toText(transaction.status))`, `action = toText(body.action) || toText(body.message) || undefined`.
  - `verifyPayment(reference)` → `GET /payments/{reference}` (A7); `NormalisedPayment` = the legacy mapping (`merchant_reference`/`trxref`, `mapNotchPayStatus`, amount, currency, `providerTransactionId`) **plus** `failureCode` from one table over `transaction.failure_reason ?? transaction.status` (`declined|insufficient_funds|timeout|limit_exceeded|invalid_number` by substring, else `provider_error` when failed, else `null`), `fee = toAmount(transaction.fee)` (A14), `accountId = toText(transaction.destination?.account) || null` (A14).
- Consumes: Tasks 1–2; `mapNotchPayStatus`, `toText`, `toAmount`, `toCurrency` from `notchpay.ts`.

- [ ] **Step 1: failing tests:** happy destination charge — journal request whole-object (the body carries `application_fee` and `destination.amount` as given, **and has no `application_fee_percent` property** — assert `"application_fee_percent" in body === false`); split mismatch → `ProviderRequestError { method: "createDestinationCharge", status: 400 }` **and `journal` length 0** (the pin); `chargeMobileMoney` → `{ status: "pending", action: "Payment processing initiated" }` from the documented 202 envelope; `verifyPayment` pending → whole-object `NormalisedPayment` with `accountId` from the destination fixture; after mode flip → `succeeded`; a failed payment fixture with `failure_reason: "insufficient balance"` → `failureCode: "insufficient_funds"`; unknown reference → 404 `ProviderRequestError { method: "verifyPayment" }`.
- [ ] **Step 2–3: implement, green.**
- [ ] **Step 4: mutation** — move the sum guard after the POST → the journal-length-0 case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): NotchPay destination charges, direct mobile-money processing and verify`

## Wave 4 — the adapter: refunds, transfers, balance, the debit gap

### Task 4: the money-out half

**Files:**
- Modify: `packages/api/src/lib/payments/notchpayMarketplace.ts`.
- Test: extend `packages/api/tests/int/notchpay-adapter.int.spec.ts`.

**Interfaces:**
- Produces:
  - `createRefund({ paymentReference, amount, reason, idempotencyKey })` — Review Focus 3's shape:
    1. `GET /payments/{paymentReference}/refunds` (documented); among `refunds`, find `metadata.idempotency_key === idempotencyKey`.
    2. Found with the same `amount` → return `{ refundId, status: REFUND_STATUSES[status] }`, **no POST**.
    3. Found with a different `amount` → `ProviderRequestError("createRefund", 409, "idempotency key reused with a different amount")`, no POST.
    4. Else `POST /refunds` `{ payment: paymentReference, amount, reason, metadata: { idempotency_key: idempotencyKey, payment_reference: paymentReference } }` with `idempotencyKey` on the wire header (A8); read `refund.id` + mapped status.

```ts
const REFUND_STATUSES: Record<string, NormalisedRefundStatus> = {
	pending: "pending",
	processing: "processing",
	complete: "succeeded",
	completed: "succeeded",
	failed: "failed",
};
```

  - `getRefund(refundId)` → `GET /refunds/{id}`; `paymentReference = toText(metadata.payment_reference)`, and when empty (dashboard-created) one follow-up `GET /payments/{refund.payment}` for its `trxref` (A9); `idempotencyKey = toText(metadata.idempotency_key) || null`; `failureReason` from `failure_reason`/`message` when failed.
  - `releasePayout(accountId, { amount, currency, reference })` → `POST /sync/accounts/{id}/payouts` (A10) with the reference on the wire header as idempotency key too; reads `transfer.id ?? payout.id` → `{ transferId }`.
  - `getTransfer(transferId)` → `GET /transfers/{id}`; `NormalisedTransfer` with `TRANSFER_STATUSES` (`pending|sent|processing|complete|failed|reversed` identity-mapped, anything else → `ProviderRequestError(…, 502)` — a status outside the port's vocabulary must never leak), `accountId = toText(transfer.account) || ""` (A15), `reference = toText(transfer.reference) || null`, `fee = toAmount(transfer.fee)`.
  - `getConnectedAccountBalance(accountId)` → `GET /sync/accounts/{id}/balance` (A11); reads `{ available, pending }` as integers (per-currency object → the `XAF` member, the launch market's own currency convention; a missing member is 0).
  - `listTransactions({ from, to, page, accountId })` → `GET /balance/history` with `page`, `limit: 100`, `date_start`/`date_end` (UTC dates), `account: accountId` when given (A12); maps `items`: `type: "payment"` → entity `payment` status `succeeded`; `type: "refund"` → enrich via `getRefund(item.reference)` so `reference` is the idempotency key and `status` real; `type: "transfer"` → enrich via `getTransfer`; `type: "adjustment"` → entity `debit`, status `succeeded`. Amounts absolute (history signs outflows negative), `occurredAt` from `created_at`.
  - `debitConnectedAccount()` → `throw new ProviderCapabilityError("notchpay", "debitConnectedAccount")` — the documented-feature-without-an-endpoint; N9's written answer converts this to a wire call in a follow-up, and until then the matching setting cannot be enabled (the port's own rule).
- Consumes: Tasks 1–3.

- [ ] **Step 1: failing tests:** the idempotency triple — same key twice → same `refundId`, journal shows exactly one POST across both calls; same key new amount → 409 and **still** one POST in the journal; new key → second refund id; `getRefund` with metadata → whole-object `NormalisedRefund` (no payment lookup in the journal); `getRefund` without metadata → the fallback payment lookup appears in the journal and `paymentReference` comes from `trxref`; `releasePayout` → `{ transferId }` with the request's idempotency header asserted; `getTransfer` for each of the six statuses (table-driven) + an out-of-vocabulary status → 502 `ProviderRequestError`; balance happy + unknown account 404; `listTransactions` one page with all four item types → whole-array `NormalisedTransaction[]` (refund row's `reference` is the idempotency key); `debitConnectedAccount` → `ProviderCapabilityError` with message exactly `notchpay cannot debitConnectedAccount`.
- [ ] **Step 2–3: implement, green.**
- [ ] **Step 4: mutation** — skip the pre-list and rely on the header alone → the replay case (same key twice) red, because the replay sandbox, like a header-ignoring provider, mints a second refund. Restore.
- [ ] **Step 5: commit** — `feat(payments): NotchPay refunds with adapter-enforced idempotency, payouts, balance, the debit gap`

## Wave 5 — the adapter: webhooks

### Task 5: verifyWebhook, parseWebhookEvent, the one event table

**Files:**
- Create: `packages/api/src/lib/payments/notchpayMarketplaceEvents.ts`.
- Modify: `packages/api/src/lib/payments/notchpay.ts` — extract the HMAC check into an exported pure function, body of `verifyWebhook` unchanged in behaviour:

```ts
export function verifyNotchPaySignature(
	rawBody: string,
	headers: Record<string, string | undefined>,
	hashKey: string,
): void; // throws WebhookSignatureError; reads x-notch-signature, falls back to notchpay-signature (A16)
```

- Modify: `packages/api/src/lib/payments/notchpayMarketplace.ts` — `verifyWebhook` = `verifyNotchPaySignature(rawBody, headers, this.hashKey)` then `JSON.parse` (parse failure → `WebhookSignatureError`, the legacy rule) then `parseNotchPayMarketplaceEvent`; `parseWebhookEvent` = `parseNotchPayMarketplaceEvent` (pure, so `processWebhookEvent` re-parses stored bodies without config, the account-deletion precedent).
- Test: extend `packages/api/tests/int/notchpay-adapter.int.spec.ts`; legacy specs (`boost-*`) must stay green — the extraction is behaviour-preserving.

**Interfaces:**
- Produces, `notchpayMarketplaceEvents.ts`: the event-name table from the Wire contract section as one `Record`, and:

```ts
export function parseNotchPayMarketplaceEvent(raw: unknown): NormalisedEvent;
```

  Envelope: `name = toText(event.type) || toText(event.event)` (A16); `providerEventId = toText(event.id)` (A13); `data = event.data ?? {}`. Common fields: `reference = toText(data.merchant_reference) || toText(data.trxref)`, `amount`, `currency`, `providerTransactionId = toText(data.reference) || null`. Per entity: payment → `accountId` from `data.destination?.account` (A14), `fee`, `failureCode` (Task 3's table), `type: "payment/{status}"`; refund → `refundId = toText(data.id)`, `paymentReference = toText(data.metadata?.payment_reference) || toText(data.merchant_reference)` (A9), `accountId`, `fee`; transfer → `transferId`, `accountId = toText(data.account)` (A15), `fee`, `failureReason`; account → `accountId = toText(data.id)`, status from the name or `ACCOUNT_STATUSES[toText(data.status)]`; the `anything else` row degrades to a payment event exactly as P0's parser reads it, so the boost URL's traffic keeps settling unchanged.
  Every event's `type` is the normalised `{entity}/{status}` (the port's rule; the contract asserts it for transfers).
- Consumes: Tasks 2–4's status tables (imported, not re-declared); `toText`/`toAmount`/`toCurrency`.

- [ ] **Step 1: failing tests:** **the dual-spelling matrix** (Review Focus 2) — for each of payment succeeded/failed, refund pending/succeeded/failed, transfer pending/complete/failed, account deauthorized: the legacy spelling (`event` + legacy name where one exists, e.g. `payment.complete`) and the Sync spelling (`type` + Sync name) of the same fact produce **`toEqual`-identical** `NormalisedEvent`s, `providerEventId` included; `verifyWebhook` accepts a body signed with the configured hash key under `x-notch-signature` and under `notchpay-signature` (one at a time), rejects a tampered body and a tampered signature with `WebhookSignatureError`, rejects non-JSON; **legacy parity pin** — a real boost `payment.complete` body parses through `parseNotchPayMarketplaceEvent` and `parseNotchPayWebhookEvent` to the same `reference`/`status`/`amount`/`currency`/`providerEventId`/`providerTransactionId` (`type` differs by design: normalised vs raw); an unknown name (`customer.created`) → payment entity, status `pending`, empty reference, nothing thrown; the event table's key count asserted (a new name is a deliberate diff).
- [ ] **Step 2–3: implement, green** — including the untouched boost webhook specs.
- [ ] **Step 4: mutation** — read only `event.event`, never `type` → the Sync half of every matrix row red. Restore.
- [ ] **Step 5: commit** — `feat(payments): NotchPay webhook verification and the one event-normalisation table`

## Wave 6 — the contract, recorded

### Task 6: the recorded driver, the fixture set, `runMarketplaceContract` green in CI

**Files:**
- Create: `packages/api/tests/int/helpers/notchpayContractDriver.ts`, `packages/api/tests/int/fixtures/notchpay/*.json` (the hand-authored set), `packages/api/tests/int/notchpay-marketplace-contract.int.spec.ts`.

**Interfaces:**
- Produces: `FIXTURE_HASH_KEY = "np_test_hash_fixture"` (a constant, not a secret — it signs replayed webhooks so the tamper clauses are real), `makeReplayProvider(): { provider: NotchPayMarketplaceProvider; replay: ReplayTransport }` building the adapter with `transport: replay.transport()`, `hashKey: FIXTURE_HASH_KEY`, dummy keys; and `notchpayRecordedDriver: MarketplaceContractDriver`:
  - `activeAccount` — `createConnectedAccount` through the provider, then `setMode("account:{id}", "active")`;
  - `completeOnboarding` — `setMode("account:{id}", "active")` (the onboarding page's outcome, fast-forwarded);
  - `settlePayment(provider, reference)` — `setMode("payment:{ref}", "succeeded")`, then emit the recorded `payment.succeeded` webhook template with `{ref}`/amount substituted and sign it: `{ rawBody, headers: { "x-notch-signature": hmacSha256Hex(FIXTURE_HASH_KEY, rawBody) } }`;
  - `settleTransfer` — `setMode("transfer:{id}", "complete")`, emit `transfer.sent` then `transfer.complete` (fee 50) webhooks in order;
  - `seedBalance` — `setMode("balance:{accountId}", "funded")`, return the fixture's `{ available: 41_500, pending: 7_200 }`;
  - `capabilityGap` — `{ method: "debitConnectedAccount", call: … }`, mirroring the fake driver (the gap is real until N9).
- Produces: the committed fixture files covering every route Tasks 2–5 call, each carrying its `assumed` tags; the state wiring that makes every contract clause reachable without test edits — the charge fixture `sets` its payment to pending (so the contract's verify-pending clause holds with no driver gesture), the account-create fixture `sets` created, the refund fixture `binds` its idempotency key so the `/balance/history` fixture lists exactly that refund row; webhook templates in both envelope spellings where both exist (the contract uses one; Task 5's matrix uses both).
- Produces, the spec:

```ts
import { runMarketplaceContract } from "./marketplace-contract.int.spec";
runMarketplaceContract(() => makeReplayProvider().provider, notchpayRecordedDriver);
```

  plus a **fixture-manifest spec** in the same file: every `assumed` tag across all fixtures is one of `A1`–`A16`; the set of tags present is asserted by exact value (today: all 16) with a comment saying the recorder shrinks it and the assertion is updated from the record run's output — so a tag can neither rot nor appear unledgered.
- Consumes: Tasks 1–5; the contract helper (re-exported by the fake's spec, its stated purpose).

- [ ] **Step 1: run the contract red** against the empty fixture dir — every clause fails on the fail-closed transport, which enumerates exactly the fixtures to author.
- [ ] **Step 2: author the fixtures** from the Wire contract table (tag each assumption), **green** — `bunx vitest run --config ./vitest.config.mts tests/int/notchpay-marketplace-contract.int.spec.ts`, then the whole suite (`bun run test:int`): every pre-existing spec still runs on the fake, counts unchanged except the new files.
- [ ] **Step 3: mutation** — drop `transfer.sent` from the driver's settle sequence → the transfer clause's per-event assertions red (events length vs webhooks length). Restore.
- [ ] **Step 4: mutation** — change one fixture's `assumed` tag to `A99` → the manifest spec red naming it. Restore.
- [ ] **Step 5: commit** — `feat(payments): the NotchPay adapter passes the marketplace contract on recorded fixtures`

## Wave 7 — registration, and the live sandbox

### Task 7: `registerAdapters.ts` — the adapter reaches production through the registry alone

**Files:**
- Create: `packages/api/src/lib/payments/registerAdapters.ts`.
- Modify: `packages/api/src/payload.config.ts` — after the imports, one top-level `registerConfiguredAdapters();`.
- Test: `packages/api/tests/int/notchpay-registration.int.spec.ts` (**new**).

**Interfaces:**
- Produces:

```ts
const CONFIG_KEYS = ["NOTCHPAY_PUBLIC_KEY", "NOTCHPAY_PRIVATE_KEY", "NOTCHPAY_HASH_KEY"] as const;

export function notchpayConfigured(env: PaymentEnv = process.env): boolean;

/** Registers every adapter whose env is complete; idempotent; returns the undo. */
export function registerConfiguredAdapters(env: PaymentEnv = process.env): () => void;
```

  Registration happens **only when all three keys are present** — otherwise `adapterPresenceRefusal` must keep refusing, which is the safety the registry's `hasMarketplaceProvider` builds on. The factory handed to `registerMarketplaceProvider("notchpay", …)` builds from the *runtime* env the registry passes (the registry's own convention), memoised per `(publicKey, privateKey, hashKey, baseUrl)` tuple so the webhook route verifies against the same instance across calls; keys missing at factory time → `ServiceError(ERROR_CODES.paymentProviderUnavailable, 503)`.
- Consumes: the registry, `notchpayMarketplace.ts` (**this file and the plan's tests are its only importers** — Review Focus 5).

- [ ] **Step 1: failing tests** (the registry spec's `setEnv` + unregister discipline): keys absent → `registerConfiguredAdapters` registers nothing and `adapterPresenceRefusal(enabling, { NODE_ENV: "production" })` still returns the refusal sentence; all keys + `NODE_ENV: "production"` → `getMarketplaceProvider(settings)` is a `NotchPayMarketplaceProvider` with `id === "notchpay"`, and the same instance twice (memo); all keys + `NODE_ENV: "development"` → still `sharedFakeMarketplace()` (the displacement pin); `PAYMENTS_PROVIDER=fake` + keys + production → the fake (staging's explicit override survives); undo unregisters (refusal returns); **webhook route integration** — with the adapter registered and a production env, `handleMarketplaceWebhook` given a fixture webhook signed with the env's hash key answers 200 and stores a `webhook-events` row with `provider: "notchpay"`, a tampered one answers 400 and stores nothing (counts asserted); **the source scan** — walk `packages/api/src` and assert the modules importing `"./notchpayMarketplace"`/`"../payments/notchpayMarketplace"` are exactly `["lib/payments/registerAdapters.ts"]` (the P5 single-writer scan idiom).
- [ ] **Step 2–3: implement, green** — full suite: registering at config load must not change which provider any existing spec sees (`NODE_ENV=test` serves the fake regardless).
- [ ] **Step 4: mutation** — register even with a missing key → the presence-refusal case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): register the NotchPay adapter from env config, production-only through the registry`

### Task 8: the live sandbox pass — record mode, user-run, skipped in CI

**Files:**
- Create: `packages/api/tests/int/notchpay-sandbox.live.int.spec.ts`, `packages/api/src/scripts/webhookInbox.ts`.
- Modify: `packages/api/tests/int/helpers/notchpayReplay.ts` — add `RecordTransport`.

**Interfaces:**
- Produces, `RecordTransport`: wraps `liveTransport`, and for every call writes/overwrites (never merges — Review Focus 1) the matching fixture file: request tokenised (the dynamic reference/account/refund ids become `{tokens}`), response body stored verbatim minus any `Authorization`/`X-Grant` echo, `assumed` array **cleared** for that fixture. A post-run summary lists cleared and still-assumed tags — the input to Task 6's manifest assertion update and Task 9's packer.
- Produces, `webhookInbox.ts` (a Bun script — scripts may use Bun, tests stay vitest): `Bun.serve` on `PORT` appending each delivery `{ rawBody, headers, receivedAt }` as one JSON line to `NOTCHPAY_WEBHOOK_INBOX`; the user points a tunnel (any of ngrok/cloudflared) at it and registers the tunnel URL as the sandbox webhook endpoint.
- Produces, the spec — gated:

```ts
const live = process.env.NOTCHPAY_SANDBOX === "record";
describe.runIf(live)("NotchPay sandbox (record mode)", () => { … });
if (!live) it.skip("NotchPay sandbox pass — set NOTCHPAY_SANDBOX=record with sandbox keys to run", () => {});
```

  Inside: `runMarketplaceContract` with a provider built on `RecordTransport` from `NOTCHPAY_*` env (sandbox keys, N14), and a sandbox driver sharing `notchpayContractDriver.ts`'s shape: `settlePayment` processes the charge against a NotchPay **test number** (`get-started/testing`) and then polls the inbox file for the payment's webhook (timeout 120 s); `settleTransfer`/`completeOnboarding`/`seedBalance` likewise poll or perform the documented sandbox gesture, each failing with an instruction naming the manual step if the sandbox cannot automate it (onboarding may need a human click — the spec then pauses on the inbox until the account webhook arrives). Webhooks recorded into the fixture set as templates, bodies re-tokenised, signatures **dropped** (replay re-signs with `FIXTURE_HASH_KEY`).
- Consumes: Tasks 1–7. **Executing this spec is the user's** (their sandbox keys, their tunnel); this task only makes the run a single command:

```
NOTCHPAY_SANDBOX=record NOTCHPAY_PUBLIC_KEY=… NOTCHPAY_PRIVATE_KEY=… NOTCHPAY_HASH_KEY=… \
NOTCHPAY_WEBHOOK_INBOX=/tmp/np-inbox.jsonl \
bunx vitest run --config ./vitest.config.mts tests/int/notchpay-sandbox.live.int.spec.ts
```

- [ ] **Step 1: failing tests** for the buildable parts, no network: `RecordTransport` against a stub transport writes a fixture with tokens substituted back out, clears its `assumed`, redacts an `Authorization` echo in a response body, and **overwrites** an existing fixture file wholesale (write a divergent fixture first, assert the stale field is gone — the overwrite pin); the gate — without `NOTCHPAY_SANDBOX=record` the live describe reports skipped (assert via vitest's result, or by the exported `live` flag's falsiness under test env); the inbox script's parser round-trips a captured line.
- [ ] **Step 2–3: implement, green; full suite unchanged** (one skipped test added).
- [ ] **Step 4: mutation** — make `RecordTransport` merge instead of overwrite → the stale-field case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): sandbox record mode — the user's live contract pass rewrites the fixture truth`

## Wave 8 — the evidence path

### Task 9: G5 evidence packaging, and the gate record provably flips

**Files:**
- Create: `packages/api/src/scripts/packNotchpayEvidence.ts` (register as `pack:notchpay-evidence` in `packages/api/package.json` scripts).
- Test: `packages/api/tests/int/notchpay-evidence.int.spec.ts` (**new**).

**Interfaces:**
- Produces: `buildNotchpayEvidence({ fixturesDir, vitestJsonPath, now }): { refusal: string | null; document?: TextPdfDocument }` (pure, exported for the spec) + a thin CLI that writes `notchpay-sandbox-evidence.pdf` via the `lib/textPdf.ts` idiom. The document: run date, sandbox base URL, redacted key id (last 4), the contract suite's pass counts from the vitest JSON reporter output, and the A1–A16 table — each tag `cleared` (absent from every fixture) or `still assumed`. **Refusals** (exit 1, no document): any fixture still carrying an `assumed` tag; any failed or skipped contract test in the JSON. A G5 document can only come out of a genuine, complete record run; the staff then upload it to `payment-gate-evidence` and file the G5 row — the upload and the row are the user's gesture, the artefact is this script's.
- Produces, the flip proof (the "gate record flipping" wiring, asserted end to end in the spec): in a production env with the adapter registered (Task 7's helper) and `PROTECTED_PAYMENT_ALLOWED=true`, an `AppSettings.payments` change enabling the CM market with gate rows G1, G2, G4, G5, G6 (each referencing a seeded `payment-gate-evidence` upload) **saves**; with `releaseModel: provider_hold` it additionally requires G3 (refused without, saved with); removing the G5 row → refused and the refusal names G5 (`missingGates`); unregistering the adapter → refused with `adapterPresenceRefusal`'s sentence. Nothing in this task changes `paymentSettings.ts` — it proves what P5 built now has a real adapter to accept.
- Consumes: Tasks 6–8's fixture/tag conventions; P5's `missingGates`, `PaymentGateEvidence`, `adapterPresenceRefusal`.

- [ ] **Step 1: failing tests:** a fabricated green manifest (no assumed tags) + a green vitest JSON → a document whose text contains all sixteen tag ids each marked cleared (assert by counting `cleared` lines = 16); one lingering `A10` → `refusal` naming `A10`, no document; one failed test in the JSON → refusal naming the test; the flip matrix above, each branch by exact refusal content or saved value.
- [ ] **Step 2–3: implement, green.**
- [ ] **Step 4: mutation** — count only failed tests, ignore skipped → the skipped-test refusal case red. Restore.
- [ ] **Step 5: commit** — `feat(payments): the G5 evidence packer — a sandbox pass becomes a filable gate document`

## Wave 9 — rehearsal and record

### Task 10: the staging rehearsal (buildable) and the release record — the user's criterion stays the user's

Mirrors P5's Task 30 split exactly: this task builds everything that can be proven on a quiet tree; the live half is enumerated, owned by the user, and is **not** an exit criterion for merging this plan.

**Files:**
- Create: `packages/api/tests/int/notchpay-staging-rehearsal.int.spec.ts`, `docs/superpowers/releases/2026-10-XX-notchpay-adapter-release.md` (dated at execution).

**Interfaces:**
- Produces, the rehearsal spec — the P5 `staging-rehearsal.int.spec.ts` idiom pointed at the adapter: production env override + Task 7 registration over a `ReplayTransport`, then one recorded NotchPay day driven through the **real spine, not the port directly**: `handleMarketplaceWebhook` receives the recorded signed `payment.succeeded` for a seeded checkout intent → `webhook-events` row → `processWebhookEvent` → intent settled, `charge` posted; the recorded `refund.created`/`refund.complete` pair drives a seeded refund to `succeeded` with its postings; the recorded `transfer.sent`/`transfer.complete` pair completes a seeded `PO-` payout **and** a recorded `RP-` transfer event routes to `services/resellerPayouts.ts` (the dispatch Global Constraints pinned); then **the whole day replayed a second time produces byte-identical ledger balances and no new rows** (P5's determinism pin, now with the real parser in the loop).
- Produces, the release record, drafted with: suite and ceiling numbers at close; what registers where (env matrix); the fixture/tag state (16 assumed at merge); the deferred `debitConnectedAccount` gap (N9); and **the user's staging criterion, verbatim obligations**:
  1. Obtain Sync sandbox access and keys (N14) and run Task 8's record command until the contract is green on recorded truth and the A-tag table is empty; update Task 6's manifest assertion from the summary; commit the re-recorded fixtures.
  2. Run `pack:notchpay-evidence`, upload the document, file the G5 row.
  3. Staging with `NODE_ENV=production`, sandbox `NOTCHPAY_*` keys, `PROTECTED_PAYMENT_ALLOWED=true`, sandbox-evidence gate rows: the P5 integration pass (test MTN/Orange numbers: success, decline, timeout, late approval refund; express onboarding; full and partial refund; payout release) and **7 consecutive clean cron-driven `reconcileLedger` nights** — the P5 release record's own exit bar, unchanged.
  4. Send N1–N10/N13 to NotchPay and L1–L7 to the lawyer (User gates section); file G1, G2, G3, G4, G6 as the answers land.
  5. Production: flag on only when `missingGates` is empty and the user says go — Douala and Yaoundé first, per the spec.
- Consumes: everything above; P5's rehearsal scaffolding and ledger assertions.

- [ ] **Step 1: failing rehearsal spec** as described — seed through the landed P5 services (the existing rehearsal's helpers), assert settled intent status, exact posted balances after day one, `resellerPayouts` journal for the `RP-` event, and the second-replay identity (whole-object balance map `toEqual`, row counts equal).
- [ ] **Step 2: green, then the full verification targets:** `bun run test:int` (count recorded in the release record), `bun run check-types` + `check-types:tests` ≤ 105, `bunx biome check` on touched files, `as never` ceilings held, client suites untouched and green.
- [ ] **Step 3: mutation** — drop the `RP-` branch from the rehearsal's seeded day → its routing assertion red. Restore.
- [ ] **Step 4: write the release record** with the measured numbers and the user-criterion list above.
- [ ] **Step 5: commit** — `feat(payments): the NotchPay adapter rehearsal and release record — staging criterion handed to the user`

## Spec coverage

Provider interface → Tasks 2–5 (every port method has an owning task: accounts/schedule 2; charges/verify 3; refunds/release/transfer/balance/transactions/debit 4; webhooks/parse 5); the contract as acceptance → Task 6; G5's "adapter maps whatever the sandbox returns" → the fixture ledger + Task 8; registration/`adapterPresenceRefusal` → Task 7; gates and evidence → Task 9 (code path) + User gates (obtainment); the spec's webhook-URL behaviour → unchanged (landed in P5), exercised end-to-end in Task 10; N/L questions → triaged above, (c) never tasked. Deliberately out: enabling anything, `services/payoutAccounts.ts` recipient push (N6), the debit wire call (N9), bank payouts — each parked exactly where the spec parked it.

## Conflicts found while planning

- The spec's interface sketch omits `parseWebhookEvent` and predates the landed unions; the port file and `runMarketplaceContract` are the authority (stated in the header).
- The docs themselves carry the G5 contradictions the spec predicted (`/accounts` vs `/sync/accounts`, `callback` vs `redirect_url`, `type` vs `event`, `x-notch-signature` vs `notchpay-signature`, `phone` vs `account_number`): resolved as A1/A2/A6/A16 — the adapter reads both where reading both is safe, picks one where it must, and the record run arbitrates.
- The docs offer `application_fee_percent`; the P5 Global Constraint forbids it — never sent, pinned by Task 3's absent-property assertion.
- `services/resellerPayouts.ts` keeps the legacy client for creating transfers (working production code; converting it to the port is P8's business if ever) — only its webhooks change path, covered by Task 10's `RP-` pin.
- `verifyPayment` by our reference (the port) vs by provider reference (today's boost code): A7; if the sandbox refuses merchant-reference lookup, the fix is adapter-internal (resolve via the stored `providerTransactionId` the charge response returned) — the port does not move.
