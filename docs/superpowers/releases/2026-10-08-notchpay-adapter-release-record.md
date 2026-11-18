# NotchPay marketplace adapter release record

Branch `feat/notchpay-adapter`, closed 2026-10-08 (plan
`docs/superpowers/plans/2026-10-08-notchpay-adapter.md`, Tasks 1-10). It
follows the P5 record (`2026-10-03-p5-release-record.md`) and keeps its split:
everything provable on a quiet tree is built and measured here; the live half
is enumerated below and is the user's, not an exit criterion for merging.

## What ships

- **The wire** (`lib/payments/notchpayWire.ts`): one transport type with a
  live implementation (15 s timeout, 5xx and network failures become
  `ProviderUnavailableError`) and a replay implementation that fails closed -
  an unmatched request throws naming method and path, it never reaches
  `fetch`.
- **The adapter** (`lib/payments/notchpayMarketplace.ts`, event table in
  `notchpayMarketplaceEvents.ts`): all 16 `MarketplaceProvider` methods except
  one declared gap. Destination charges send a fixed `application_fee` and
  `destination.amount` (never `application_fee_percent`), the split-sum guard
  runs before any wire write, refund idempotency is enforced adapter-side,
  webhooks read both envelope spellings into one normalised event.
- **Registration** (`lib/payments/registerAdapters.ts`, one call in
  `payload.config.ts`): env-driven and production-only through the registry.
- **Record mode** (`tests/int/helpers/notchpaySandbox.ts`,
  `notchpay-sandbox.live.int.spec.ts`, `src/scripts/webhookInbox.ts`): the
  user's live pass rewrites the fixtures and `manifest/verified.json`.
- **The G5 packer** (`src/scripts/packNotchpayEvidence.ts`,
  `bun run pack:notchpay-evidence`): turns a complete green record run into a
  filable gate document and refuses on anything less.
- **The adapter rehearsal**
  (`tests/int/notchpay-staging-rehearsal.int.spec.ts`, this task): the P5
  rehearsal's lifecycle with the fake replaced by the adapter.

### The rehearsal

Production env, the adapter registered over a `ReplayTransport` (recorded
fixtures, zero network), then one day driven through the real routes and
services with no provider passed to any service: onboarding, the signed
account webhook, a mobile-money checkout, the signed `payment.succeeded`
(`handleMarketplaceWebhook` -> `webhook-events` -> `processWebhookEvent`),
accept/ship/deliver, the completion sweep, the payout hold expiry, the payout
batch, the signed `transfer.sent` and `transfer.complete`. An `RP-` transfer
event rides the same route and lands on `reseller-payouts`, leaving the `PO-`
payout untouched. It asserts the same whole-object final ledger the P5
rehearsal pins (commission, protection fee net of VAT, VAT payable, provider
position equal to the application fee, every transit bucket at zero), then
replays the whole recorded day: every delivery is a stored duplicate, row
counts per collection and the balance map are identical, and
`ledgerIntegrity` holds.

The P5 rehearsal's seven reconciliation nights are deliberately not repeated:
against recorded fixtures the provider-side balance is the fixture's, so the
nights would test the fixture, not the economy. They are the user's real
nights (gate 3 below).

Mutation evidence: dropping one amount from the `payout_complete` posting
turned the whole-object ledger pin red; forcing the `RP-` branch of
`dispatchTransfer` off turned the routing assertion red. Both restored.

A side finding fixed on the way: two specs that mock `marketplaceRegistry`
without its real exports (`checkout-payment`, `connected-accounts`) broke once
Task 7's `payload.config.ts` call reached them transitively. They now spread
`importOriginal`.

## Registration matrix

| Environment | Provider served |
| --- | --- |
| `NODE_ENV` not production | shared `FakeMarketplaceProvider` |
| production, `PAYMENTS_PROVIDER=fake` | shared fake |
| production, `NOTCHPAY_PUBLIC_KEY`, `NOTCHPAY_PRIVATE_KEY`, `NOTCHPAY_HASH_KEY` all set | NotchPay adapter (memoised per key set; optional `NOTCHPAY_BASE_URL`) |
| production, any key missing | nothing registered: 503 `payment.providerUnavailable`, `adapterPresenceRefusal` still refuses |

The legacy boost and reseller client (`lib/payments/notchpay.ts`) is
untouched at its call sites. `verifyNotchPaySignature` now also accepts the
`notchpay-signature` header, which widens the legacy boost route's accepted
header set (A16).

## Gates at close

- `packages/api` `bun run test:int`: **302 files (301 run, 1 skipped), 4321
  passed, 12 skipped, 0 failures**. The skips are the env-gated live sandbox
  spec. The adapter, contract (fake 21 + recorded 17), registration, wire,
  record, evidence and reseller suites pass in isolation too (180 passed, 12
  skipped).
- Root `bun run check-types`: green.
- `check-types:tests` (packages/api): **100** - held at the ceiling.
- `as never` in `packages/api/tests`: **86** - held.
- Client suites, client casts and mobile advisory: untouched by this branch.

## The assumption ledger: A1-A16, all still ASSUMED

No sandbox access existed while this was built, so every wire detail not
answered by the public docs or by `notchpay.ts`'s production code is an
assumption encoded in a fixture's `assumed` array. `manifest/verified.json`
is empty; the manifest spec asserts open + verified = A1..A16. None is
cleared until the user's record run.

| Tag | Assumption |
| --- | --- |
| A1 | accounts are created at `POST /sync/accounts` (`POST /accounts` is the fallback) |
| A2 | onboarding link body is `{ redirect_url, refresh_url }` (alternative: `{ callback }`) |
| A3 | account object field names: enabled flags, schedule, holder name, status strings |
| A4 | payout schedule written with `PUT /sync/accounts/{id}` `{ payout_schedule }` |
| A5 | a destination + `application_fee` payment still accepts direct channel processing |
| A6 | payer number key in the process body is `data.account_number` |
| A7 | `GET /payments/{reference}` resolves by our merchant reference |
| A8 | `POST /refunds` honours `Idempotency-Key` (correctness does not depend on it) |
| A9 | refunds and `refund.*` webhooks echo `metadata` and `payment` |
| A10 | platform-triggered payout at `POST /sync/accounts/{id}/payouts`, tracked by `GET /transfers/{id}` |
| A11 | per-account balance at `GET /sync/accounts/{id}/balance` |
| A12 | `GET /balance/history` accepts an `account` filter |
| A13 | webhook envelope carries its event id at `id` |
| A14 | payment facts carry `destination.account` and the collection `fee` |
| A15 | transfer lifecycle names (`sent`/`processing`/`reversed`) and `data.account` |
| A16 | envelope field `type` vs `event`, header `x-notch-signature` vs `notchpay-signature` |

A refuted assumption is a fixture and adapter fix, never a port or service
change (G5's own rule).

## Declared gap

`debitConnectedAccount` throws `ProviderCapabilityError("notchpay",
"debitConnectedAccount")` until N9 is answered. The clawback's platform debit
therefore has no wire call; the contract pins the gap. Answering N9 yes is one
small follow-up task (fixtures, the call, the gap clause removed).

## What stays refused meanwhile

Nothing here enables anything. `AppSettings` defaults are unchanged, no gate
row is filed. Registering the adapter makes `adapterPresenceRefusal` go quiet
in production once keys are set, but enablement is still refused by
`missingGates` (G1, G2, G4, G5, G6, plus G3 under `provider_hold`) and by
`PROTECTED_PAYMENT_ALLOWED`. The packer refuses to produce the G5 document
while any A-tag is open or unledgered. Production keeps
`protectedPayment.enabled = false`.

## The user's gates, in order

1. **Sandbox access (N14).** Obtain Sync sandbox keys with test MTN/Orange
   numbers and full webhook coverage from NotchPay. Needed env:
   `NOTCHPAY_PUBLIC_KEY`, `NOTCHPAY_PRIVATE_KEY`, `NOTCHPAY_HASH_KEY`,
   `NOTCHPAY_TEST_CHANNEL`, `NOTCHPAY_TEST_PHONE` (the channel and number
   come from NotchPay's get-started/testing page; optional
   `NOTCHPAY_BASE_URL`). A tunnel (ngrok or cloudflared) to the webhook
   inbox, registered as the sandbox webhook endpoint. Record mode refuses a
   live-looking key.
2. **The record run**, from `packages/api`:
   ```
   PORT=8787 NOTCHPAY_WEBHOOK_INBOX=/tmp/np-inbox.jsonl bun src/scripts/webhookInbox.ts
   cloudflared tunnel --url http://localhost:8787   # register the URL in the sandbox dashboard

   NOTCHPAY_SANDBOX=record NOTCHPAY_PUBLIC_KEY=... NOTCHPAY_PRIVATE_KEY=... \
   NOTCHPAY_HASH_KEY=... NOTCHPAY_WEBHOOK_INBOX=/tmp/np-inbox.jsonl \
   NOTCHPAY_TEST_CHANNEL=... NOTCHPAY_TEST_PHONE=... \
   bunx vitest run --config ./vitest.config.mts tests/int/notchpay-sandbox.live.int.spec.ts
   ```
   The run waits (up to 10 minutes, with a named-step timeout message) on two
   manual gestures: completing onboarding twice (the contract's account and
   the shared active account) and funding the account with test funds.
   Payment and payout webhooks are polled from the inbox (120 s). It
   overwrites fixtures wholesale and writes `manifest/verified.json`.
3. **Re-run the contract green on recorded truth**: `bunx biome check --write
   tests/int/fixtures`, then `bunx vitest run --config ./vitest.config.mts
   tests/int/notchpay-marketplace-contract.int.spec.ts` (zero network). The
   manifest assertion follows `verified.json` and needs no hand edit; any
   adapter fix a refuted assumption demands is adapter-internal. Commit the
   re-recorded fixtures. Repeat steps 2-3 until the A-tag table is empty.
4. **The G5 packer**: `bunx vitest run --config ./vitest.config.mts
   --reporter=json --outputFile=<run.json> tests/int/notchpay-marketplace-contract.int.spec.ts`,
   then `bun run pack:notchpay-evidence <run.json> [out.pdf]`. Upload the
   document to `payment-gate-evidence` (admin) and file the **G5** row; the
   upload and the row are the user's gesture.
5. **The remaining evidence rows**: send N1-N10 and N13 to NotchPay and L1-L7
   to the lawyer; file **G1, G2, G3, G4, G6** as answers land (below).
6. **Staging**, as P5's record defines it: `NODE_ENV=production`, sandbox
   `NOTCHPAY_*` keys, `PROTECTED_PAYMENT_ALLOWED=true`, the sandbox-evidence
   gate rows filed. Run the P5 integration pass against the real sandbox
   (test MTN/Orange numbers: success, decline, timeout, late approval refund;
   express onboarding; full and partial refund; payout release) and **seven
   consecutive clean cron-driven `reconcileLedger` nights** - the P5 exit
   bar, unchanged.
7. **Production**: the flag goes on only when `missingGates` is empty and the
   user says go - Douala and Yaoundé first, per the spec.

The P5 obligations stand unchanged: bilingual seller payment terms, and
U-1..U-12 in `2026-10-03-p5-release-record.md`.

## Questions that remain the user's and the lawyer's

Nothing below blocks a merge; each gates enablement.

- **N1 (G1)**: licence / partner bank under CEMAC 04/18; segregation of Sync
  balances. Written answer filed as G1.
- **N2 (G3)**: can destination-charge funds be held in the connected account
  until a platform-triggered payout (`manual` schedule)? Decides
  `releaseModel` and confirms or kills A4/A10.
- **N3**: pausing/resuming payouts by API; locking an `express` holder's
  schedule.
- **N4**: account-level rolling reserve (the fallback model's eligibility arm).
- **N5 (G4)**: which balance a destination-charge refund debits, what happens
  to the application fee, negative balances. Until answered the clawback's
  `platform_advance` arm depends on L4.
- **N6**: platform-set payout destination by API and `account.updated` on
  holder changes (would extend `services/payoutAccounts.ts`, not the port).
- **N7**: operator name lookup for MTN/Orange numbers.
- **N9**: Account Debits endpoint, webhook and limits (the declared gap).
- **N10**: KYC run on `express` onboarding; reuse of level-2 KYC.
- **N13 (policy half)**: refund window on destination charges; post-90-day
  alternative.
- **N14**: sandbox access - the prerequisite for step 2.
- **L1-L7**: the lawyer's list, verbatim from the spec (G2 opinion,
  commission-holding, fee retention, advance-and-recover, clawback
  enforceability, VAT confirmation, retention periods).
- **G1-G6 evidence**: obtaining every document is the user's; the packer only
  builds the G5 artefact.

N8, N11, N12 and the mechanics halves of N13 are answered by the public docs
or the production client and are encoded, not asked.

## Known accepted residuals

- The record run is by design untested here: sandbox response shapes beyond
  the fixture skeletons fail closed with "no NotchPay fixture", and the
  sandbox gestures (test number approval, funding) are manual with polling.
- The replay transport's dynamic ids ride last-wins `binds` and fixture
  amounts are constants: correct for one-charge flows, not interleaved ones.
- The registration pin in `notchpay-registration.int.spec.ts` is a source
  scan of `payload.config.ts` (booting the config under vitest is too heavy).
- A booted config registers the live adapter whenever `.env` carries the
  three keys, so specs that need a registry-clean start must register or
  unregister explicitly (the rehearsal registers its replay adapter over it).

## Gates at close (re-verified after the review fix round)

API 301 files / 4324 passed / 0 failed (12 skipped: the env-gated live
sandbox spec). Ceilings: check-types:tests 100/100, api `as never` 86/86.
Final review APPROVED (0 blocking); its two should-fixes landed and pinned
(every key sniffed for live grants, each with its own refusal test; the G5
packer refuses a vitest JSON that does not come from the contract spec) and
the bare-Error note closed with a typed refusal.
