# P0 Foundations Design

Date: 2026-09-15
Parent: `2026-09-15-business-layer-design.md`

## Goal

Make the existing platform safe to build commerce on. Fix the defects already in production that are incompatible with real orders, and introduce the payment primitives every later phase depends on. No new user-facing commerce feature ships in P0.

## Scope

1. Payment intents and webhook events replace ad-hoc boost payment handling.
2. Boost purchase hardening: ownership, pricing, amount verification, idempotency, reconciliation.
3. Seller phone numbers stop being public.
4. Reviews become attributable and resistant to abuse.
5. MongoDB runs as a single-node replica set so multi-document transactions are available.
6. Payment records survive account deletion, stripped of personal data.
7. Search filter escaping and Meilisearch configuration consistency.
8. Web dead ends: the `/support` link and dead conversation client code.

## Out of scope

- Private file storage (moves to P2, the first phase that stores private documents).
- Verification levels and the meaning of `verified` (P2).
- Conversation and message retention on account deletion (P3/P4, when shop inboxes and orders exist).
- Anything related to shops (P1).

## Current state (verified 2026-09-15)

- `boost-payments` stores listing, user, amount, duration, status, provider, provider reference and payment URL. Any authenticated user can create one through the REST API (`access.create: authenticated`).
- `POST /api/public/boost` never checks that the caller owns the listing. Prices are hardcoded (`7: 500`, `14: 900`, `30: 1500` XAF) and duplicated in `web/src/components/listing/boost-dialog.tsx`.
- `activateBoostPayment` skips only when the payment is completed and the boost still active. It does not compare amount or currency with what the provider reports, uses no transaction, and recomputes `boostedUntil` from now on every activation.
- `webhook/notchpay/route.ts` verifies the HMAC signature but logs both the received and the expected signature on mismatch. It stores no event id, swallows processing errors and always returns 200, so the provider never retries. `markBoostFailed` sets `failed` even on a payment already completed.
- `NotchPayProvider.verifyWebhook` throws; HMAC verification lives in the route instead. `callback/route.ts` activates boosts from a GET redirect by calling `verifyPayment`.
- `StripeProvider.verifyWebhook` returns only reference and status: no event id, amount or currency.
- `users.phone` has no field-level read access and `users` is readable by anyone, so `/api/users` exposes every phone number. Web and mobile listing pages read `seller.phone` from the populated listing. The phone verification fields (`pendingPhone`, `phoneVerifiedAt`, code hash…) already have `read: () => false`.
- `reviews.reviewer` is required but never set server-side. Mobile sends it from the client (forgeable); web omits it (creation most likely fails). Nothing prevents self-reviews or duplicates.
- MongoDB runs as a standalone `mongo:7` node with root authentication and no `--replSet`. `@payloadcms/db-mongodb` 3.79 turns transactions off at connect time when the connection string has no `replicaSet` option (`connect.js`: `if (!client.options.replicaSet) transactionOptions = false`), so every multi-document write today is non-atomic.
- `deleteUserRelatedData` hard-deletes the user's boost payments.
- `api/public/search/route.ts` interpolates `category` and `location` into the Meilisearch filter without escaping, although `quoteFilterValue` exists in the same file for attribute filters.
- The API reads `MEILI_HOST` / `MEILI_MASTER_KEY`; the search indexer reads `MEILISEARCH_HOST` / `MEILISEARCH_API_KEY`. `docker-compose.yml` sets both pairs to the same values.
- `web/src/app/profile/me/page.tsx` links to `/support`, which does not exist. `web/src/lib/api.ts` defines `conversationsApi` against `/api/public/conversations/*` routes that do not exist.

## Design

### 1. Payment intents

New collection `payment-intents`: the single record of every attempt to move money, whatever it pays for.

| Field | Type | Notes |
|---|---|---|
| `purpose` | select `boost` | extended later with `commission` (P4), `checkout` (P5) and `reseller_charge` (P8) |
| `targetType` / `targetId` | select `boost-payment` / text | what the payment pays for |
| `customer` | relationship users | required |
| `amount` | number, integer | in the currency's smallest unit; XAF has no minor unit, so this equals the XAF amount |
| `currency` | text | ISO 4217, required, `XAF` today |
| `provider` | select `notchpay`, `stripe` | |
| `providerReference` | text, indexed | provider's transaction or session id |
| `reference` | text, unique | our reference sent to the provider: `PI-{id}` |
| `status` | select | `created`, `pending`, `succeeded`, `failed`, `cancelled`, `expired` |
| `statusHistory` | array | `{ status, source, at }`; `source` is `webhook`, `callback`, `reconcile` or `system` |
| `idempotencyKey` | text, unique | supplied by the client or derived server-side |
| `checkoutUrl` | text | hosted checkout URL when relevant |
| `expiresAt` | date | pending intents older than this become `expired` |
| `settledAmount` / `settledCurrency` | number / text | what the provider actually reported |

Access: read by the customer and staff; create, update and delete closed (`() => false`). Only `services/payments.ts` writes, with `overrideAccess`.

Status is monotonic, enforced in one place by a transition table:

- `created → pending | failed | cancelled`
- `pending → succeeded | failed | cancelled | expired`
- `succeeded`, `failed`, `cancelled`, `expired` are terminal. A later `failed` or `cancelled` event for a `succeeded` intent is recorded in `statusHistory` but never changes `status`.

A provider event reporting success moves the intent to `succeeded` only if `settledAmount === amount` and `settledCurrency === currency`. A mismatch leaves the intent `pending`, records the event and raises an error log for investigation.

### 2. Webhook events

New collection `webhook-events`:

| Field | Type | Notes |
|---|---|---|
| `provider` | select `notchpay`, `stripe` | extended by P2 (`didit`, `smileid`) and P7 (`yango`, `campost`) |
| `providerEventId` | text | unique together with `provider` |
| `type` | text | e.g. `payment.complete`, `checkout.session.completed` |
| `payloadHash` | text | SHA-256 of the raw body |
| `raw` | json | the verified event body |
| `receivedAt` / `processedAt` | date | |
| `attempts` | number | |
| `lastError` | text | |

Access: staff read only; writes closed except through the service.

Webhook route behaviour, identical for every provider:

1. Verify the signature. Failure → 400, logging only that verification failed, never the signature values.
2. Insert the event. A duplicate `(provider, providerEventId)` → 200 without further work.
3. If the insert itself fails → 500, so the provider retries.
4. Return 200 and queue a Payload job `processWebhookEvent` with the event id.

The job normalises the event through the provider, loads the intent by `reference`, applies the status transition and runs the purpose handler (boost activation). It retries up to five times with backoff, storing `attempts` and `lastError`.

The NotchPay GET callback no longer activates anything by itself. It calls the same settlement path with `source: callback` after verifying through `GET /payments/{reference}`, then redirects as today. Settlement is idempotent, so the callback and the webhook can both arrive in either order.

### 3. Provider interface

`PaymentProvider` gains:

- `verifyWebhook(rawBody, headers)` returning `{ providerEventId, type, reference, status, amount, currency, providerTransactionId }`. The HMAC check moves from the NotchPay route into `NotchPayProvider`, using `timingSafeEqual`.
- `verifyPayment(reference)` returning the same normalised shape. It already exists on NotchPay; Stripe retrieves the Checkout Session.

Stripe continues to be used for card payments only. XAF is a zero-decimal currency in Stripe, so `unit_amount` equals `amount`.

### 4. Boost purchases

`boost-payments` keeps its slug, because released app versions read it. It becomes the record of what was bought and links to its payment:

- New field `paymentIntent` (relationship, required on new records).
- `status` stays and mirrors the intent: `pending` until `succeeded`, then `completed`, or `failed` for any other terminal intent status. Only the service writes it.
- `access.create` closes (`() => false`). Records are created only by the purchase route through the service.
- `paymentReference` and `paymentUrl` stay populated for old clients and are no longer read by the server.

Boost pricing moves to a single server-side source `lib/boostPricing.ts` (`{ days, amount, currency }[]`), exposed through `GET /api/public/config`. The web dialog reads it instead of hardcoding.

`POST /api/public/boost`:

1. Authenticated caller.
2. Listing exists, `listing.seller === caller`, listing status is `published`. Otherwise 403 or 409 with shared error codes.
3. Duration exists in the pricing table.
4. Create the boost payment and its intent in one transaction, call the provider, store the checkout URL and provider reference on the intent.

Boost activation, called by settlement when the intent becomes `succeeded`, runs in one transaction:

- If the boost payment is already `completed`, do nothing.
- Otherwise set `boostedUntil = max(now, current boostedUntil) + days`, so a second purchase extends rather than resets, and mark the boost payment `completed`.

### 5. Reconciliation

Job `reconcilePendingPayments`, every 15 minutes:

- For intents `pending` for more than 10 minutes, call `provider.verifyPayment` and settle with `source: reconcile`.
- Intents pending beyond `expiresAt` (default 24 hours after creation) move to `expired`.

This covers a missed webhook and a buyer who closes the browser before the callback.

### 6. Migration of existing boost payments

One Payload migration (`src/migrations`), idempotent:

- For each `boost-payments` record without `paymentIntent`, create an intent: `purpose: boost`, `amount`, `currency: XAF`, `provider` from `paymentProvider`, `providerReference` from `paymentReference`, `reference: BOOST-{id}` (the reference the provider already knows).
- Status mapping: `completed → succeeded`, `failed → failed`, `refunded → succeeded` (flagged in `statusHistory`), `pending` older than 24 hours → `expired`, other `pending → pending`.
- The settlement service resolves both `PI-{id}` and legacy `BOOST-{id}` references.

### 7. Seller phone privacy

- `users.phone` gets field access `read: self or staff`. The public user document no longer contains it.
- New collection `contact-reveals`: `listing`, `seller`, `viewer`, `createdAt`. Staff read only; service writes only.
- New route `POST /api/listings/{id}/contact-phone`:
  - requires authentication;
  - listing must be `published`, and its seller not suspended;
  - rate limit per viewer in Redis, counting every call whether or not it creates a new `contact-reveals` row: 20 calls per hour and 60 per day, returning 429 with error code `generic.rateLimited`;
  - records a `contact-reveals` row (one per viewer and listing per 24 hours) and returns `{ phone }`, or 404 if the seller has no phone.
- Web and mobile `PhoneReveal` fetch the number on tap instead of reading `seller.phone`. A signed-out user tapping it is sent to sign-in.
- Released app versions that read `seller.phone` will no longer show the phone row, because both clients render it only when the value is present. Chat remains available.

### 8. Reviews

In a `beforeChange` hook on create:

- `reviewer` is always set from `req.user`; any client value is ignored.
- Self-review → 400 `review.self`.
- A second review of the same user by the same reviewer → 409 `review.duplicate`, backed by a unique compound index on `(reviewer, reviewedUser)`.
- An interaction is required: a conversation containing both users, or a `contact-reveals` row where the reviewer revealed the reviewed user's phone. Otherwise → 403 `review.noInteraction`. P4 adds a delivered order (status `delivered` or `completed`) as a qualifying interaction and marks those reviews as verified purchases.
- Existing reviews are kept. A migration logs duplicates and self-reviews for staff review; it deletes nothing.
- Mobile stops sending `reviewer`. The web form works unchanged once the server sets it.

### 9. MongoDB replica set

Run MongoDB as a single-node replica set:

- `mongod --replSet rs0 --keyFile /data/keyfile/mongo-keyfile --bind_ip_all`. A key file is mandatory for a replica set with authentication.
- The key file is created once on the host: 756 random base64 bytes, mode `400`, owner `999:999`, mounted read-only.
- One-time `rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongodb:27017" }] })`.
- `DATABASE_URI` gains `replicaSet=rs0`.
- The healthcheck also asserts `rs.status().ok`.

Runbook, executed in a maintenance window:

1. `mongodump` of the production database, copied off the host.
2. Deploy the compose change with the key file mounted, restart `mongodb`, run `rs.initiate`.
3. Restart `api`, `chat-service` and `search-indexer`.
4. Run a transaction probe: create and abort a transaction touching two collections, and assert that nothing was written.
5. Run `verify-media.sh`, a search query and a boost purchase in the NotchPay sandbox.

Behaviour change to test before production: Payload wraps every operation in a transaction as soon as `DATABASE_URI` carries `replicaSet=rs0`. The replica set alone changes nothing for Payload — the URI parameter is the switch. The full API test suite plus a staging soak (create and edit listings, moderation actions, account deletion) must pass with the parameter set first.

Rollback has two levels:

- Transactions only: remove `replicaSet=rs0` from `DATABASE_URI` and restart the API services. MongoDB keeps running as a replica set.
- Full: also restart `mongodb` without `--replSet`. Data files stay compatible.

New code in P0 that performs several writes (boost payment plus intent creation, boost activation) uses an explicit Payload transaction by passing a shared `req`.

### 10. Payment records on account deletion

`deleteUserRelatedData` stops deleting `boost-payments` and never deletes `payment-intents` or `webhook-events`. Instead, in the same operation:

- `payment-intents.customer` and `boost-payments.user` are set to null, and a new field `customerDeletedAt` is set.
- `webhook-events.raw` for those intents is replaced by a redacted copy without customer email, name and phone. `payloadHash` is kept.
- Amount, currency, provider references, status history and dates are kept as transaction data (Law 2010/021 art. 32).

Everything else in the current cascade is unchanged in P0.

### 11. Search fixes

- `category` and `location` filters go through `quoteFilterValue`, like attribute filters.
- The indexer reads `MEILI_HOST` / `MEILI_MASTER_KEY`, falling back to the old names for one release. `docker-compose.yml` keeps a single pair.

### 12. Web dead ends

- The verification banner on `profile/me` links to `/contact` with a prefilled subject, until P2 replaces it with the verification flow.
- Remove `conversationsApi` from `web/src/lib/api.ts` after confirming no import uses it. If one does, point it to the existing Payload REST routes the web messages page already uses.

## Error codes

Added to `lib/errors.ts` with English fallbacks and translations in both clients:

- `payment.providerUnavailable`
- `payment.amountMismatch` (logged only, never shown to users)
- `boost.notOwner`
- `boost.listingNotPublished`
- `boost.invalidDuration`
- `review.self`
- `review.duplicate`
- `review.noInteraction`
- `contact.phoneUnavailable`

## Testing

- **Unit:** intent transition table (every allowed and forbidden transition, including `succeeded → failed` ignored); amount and currency mismatch keeps the intent pending; settlement idempotency (webhook then callback, callback then webhook, duplicate webhook); boost extension arithmetic; review rules (self, duplicate, no interaction, interaction via conversation, interaction via reveal); contact-phone rate limit; account-deletion anonymisation.
- **Route:** NotchPay webhook with a valid signature, invalid signature (and assert no signature value in logs), duplicate event id, and a processing failure producing a retryable job; Stripe webhook via `constructEvent` fixtures; boost purchase with a non-owner (403) and an unpublished listing (409).
- **Migration:** run twice on a fixture database; the second run changes nothing.
- **Replica set:** the probe script in CI, using a MongoDB service container started with `--replSet`.
- **Clients:** typecheck and biome on web and mobile; manual check of phone reveal signed in and signed out on both.

## Verification targets

- `bun run generate:types` in `packages/api`
- `bun run check-types` in `packages/api`, `packages/web`, `packages/mobile`, `packages/search-indexer`
- `bunx vitest run --config ./vitest.config.mts` in `packages/api`
- `bunx biome check` on touched files
- Staging: runbook steps 4 and 5 on a replica-set staging database before production
