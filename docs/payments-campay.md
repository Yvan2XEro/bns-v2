# CamPay

CamPay (Cameroon mobile money: MTN, Orange) collects the money BuyNSellem
earns itself, next to NotchPay:

| Payment | Where it starts |
|---|---|
| Boost of a listing | `POST /api/public/boost` (mobile money; card stays Stripe) |
| Commission invoice | `POST /api/commission-invoices/{id}/pay` |
| Resale charge | `POST /api/reseller-charges/{id}/pay` |

Protected payment (a buyer paying a seller) does **not** use CamPay. CamPay
has no seller sub-accounts, no split payment and no refund API, so
BuyNSellem would have to collect the buyer's money itself and transfer it to
the seller: holding third-party funds, which CEMAC Regulation 04/18 reserves
to licensed institutions (`platform_collects` in
`docs/superpowers/specs/2026-09-15-p5-protected-payment-design.md`).

## Choosing the provider

Admin → **App settings → Payments to BuyNSellem**:

- **Primary provider**: NotchPay or CamPay.
- **Fall back to the other provider** (on by default): when the primary is
  not configured or refuses to open the payment, the other one opens it.

Only a provider whose keys are set on the API is tried. Each payment is then
settled by the provider that opened it (`payment-intents.provider`): its
webhook, its return page, and the reconciliation job.

## Setting it up

1. In the CamPay dashboard (www.campay.net), on the BuyNSellem app:
   - **APP KEYS**: copy the permanent token, or the API username and password;
   - **Webhook key**: copy it;
   - **Callback URL**: `https://api.buynsellem.com/api/public/payments/webhook/campay`
     (GET or POST, both are accepted).
2. On the API (`CAMPAY_*`, see `.env.example`):
   ```
   CAMPAY_BASE_URL=https://www.campay.net
   CAMPAY_PERMANENT_TOKEN=…            # or CAMPAY_USERNAME + CAMPAY_PASSWORD
   CAMPAY_WEBHOOK_KEY=…
   ```
   Without the webhook key CamPay is not offered at all: its callbacks would
   all be refused. `make check` fails on a half configuration and on
   `api.campay.net`, a host that does not exist.
3. In the admin, choose CamPay as primary (or keep NotchPay, with CamPay as
   the fallback).

Sandbox: `CAMPAY_BASE_URL=https://demo.campay.net`, with CamPay's test
numbers (`237677777777` MTN success, `237677777770` MTN failure,
`237699999999` Orange success, `237699999990` Orange failure).

## How a payment goes

1. The API creates the payment intent (`PI-{id}`), asks CamPay for a payment
   link (`POST /api/get_payment_link/`, our reference as
   `external_reference`), and sends the payer there.
2. The payer picks MTN or Orange and confirms with their PIN.
3. CamPay calls the callback URL. The API checks the `signature` JWT (HS256,
   webhook key), then **reads the transaction back from CamPay** and stores
   and settles that record, never the callback's own fields. The payer's
   phone, name and e-mail are not stored.
4. The payer's browser comes back to the return page (boosts:
   `/api/public/boost/callback`, invoices: `/api/public/payments/campay/return`),
   which also reads the payment from CamPay and settles it, then redirects to
   the listing or to `/seller/payments` (`/seller/resale`).

CamPay sends a callback once and never retries it. A payment whose callback
was lost is settled by the reconciliation job, which polls CamPay for every
intent still pending.

Amounts are whole XAF; CamPay handles no other currency.

Code: `packages/api/src/lib/payments/campay.ts` (client),
`lib/platformPayments.ts` (choice and failover), `services/campayReturn.ts`.
