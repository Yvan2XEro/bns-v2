# P0 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the platform safe to build commerce on: payment intents and webhook events behind boost purchases, private seller phone numbers, attributable reviews, retained payment records, search escaping, web dead ends removed, and MongoDB running as a replica set so transactions exist.

**Architecture:** Two new append-only records (`payment-intents`, `webhook-events`) are written only by `services/payments.ts` and `services/webhookEvents.ts`. Providers normalise every report into one shape; a single settlement function applies a monotonic transition table and runs the purpose handler (boost activation) inside an explicit Payload transaction. Webhooks are stored first and processed by a retried Payload job; a scheduled job reconciles what webhooks missed. Phone numbers leave the public user document and are handed out by a rate-limited, recorded route.

**Tech Stack:** Payload CMS 3.79 (`@payloadcms/db-mongodb`), Next.js 16 route handlers, MongoDB 7, Redis (`redis` v4 client), Stripe 22, NotchPay REST, Vitest 4 (API), `bun test` (mobile, search-indexer), Next.js + next-intl (web), Expo SDK 57 + i18next (mobile).

**Spec:** `docs/superpowers/specs/2026-09-15-p0-foundations-design.md` (parent: `docs/superpowers/specs/2026-09-15-business-layer-design.md`). Read both before starting.

## Global Constraints

- Amounts are integers in the currency's smallest unit; XAF has no minor unit, so `amount` equals the XAF amount. `currency` is ISO 4217, upper case, `XAF` today.
- Intent statuses: `created`, `pending`, `succeeded`, `failed`, `cancelled`, `expired`. Allowed: `created → pending | failed | cancelled`; `pending → succeeded | failed | cancelled | expired`. The four others are terminal.
- `statusHistory.source` values: `webhook`, `callback`, `reconcile`, `system`.
- Success moves an intent to `succeeded` only if `settledAmount === amount` and `settledCurrency === currency`.
- Error codes, verbatim: `payment.providerUnavailable`, `payment.amountMismatch` (logged only), `boost.notOwner`, `boost.listingNotPublished`, `boost.invalidDuration`, `review.self`, `review.duplicate`, `review.noInteraction`, `contact.phoneUnavailable`. Rate limiting reuses `generic.rateLimited`.
- Contact-phone rate limit per viewer: 20 calls per hour and 60 per day, every call counted, 429 with `generic.rateLimited`. One `contact-reveals` row per viewer and listing per 24 hours.
- Boost prices: 7 days 500 XAF, 14 days 900 XAF, 30 days 1500 XAF, one server-side source `lib/boostPricing.ts`.
- Reconciliation every 15 minutes; checks intents pending for more than 10 minutes; `expiresAt` defaults to 24 hours after creation.
- `processWebhookEvent` retries up to 5 times with backoff.
- `boost-payments` keeps its slug; `paymentReference` and `paymentUrl` stay populated for released app versions.
- Webhook routes never log signature values, received or expected.
- Every environment variable used by a service is declared in `docker-compose.yml` (and mirrored in `docker-compose.local.yml` and `deployments/docker-compose/docker-compose.yml`, the file CI deploys).
- Commit messages carry no `Co-Authored-By` or other tooling trailer.
- No throwaway helper scripts in the repo; one-off helpers go to `/tmp` as `.sh`.
- Comments only where the reason is non-obvious. Repo docs and code comments in English.

## Working conventions

- Branch: `git switch -c feat/p0-foundations` from `dev` before Task 1. Tasks 2 to 9 change the boost flow in steps and must ship in the same release; do not deploy between them.
- API tests live in `packages/api/tests/int/*.int.spec.ts`. Run one file from `packages/api`:
  `bunx vitest run --config ./vitest.config.mts tests/int/<file>`
- These files fail at HEAD on timeouts or imports and are not regressions: `api.int.spec.ts`, `boost-callback-route.int.spec.ts`, `listings-before-change.int.spec.ts`, `public-categories-route.int.spec.ts`, `public-search-route.int.spec.ts`. The cause of the timeouts is `vi.mock("payload", async (importOriginal) => …)`: loading the real `payload` module takes more than the 10 s test timeout. New route tests therefore mock `payload` with a plain factory (`vi.mock("payload", () => ({ getPayload: getPayloadMock }))`) and never call `importOriginal`.
- New API test files start with `// @vitest-environment node` (the config default is jsdom, which is wrong for `node:crypto`, `stripe` and `Response`).
- Regenerate Payload types after any collection or job change, from `packages/api`:
  `DATABASE_URI=mongodb://127.0.0.1:27017/unused PAYLOAD_SECRET=unused bun run generate:types`
- Type checks: `bun run check-types` in `packages/api`, `packages/web`, `packages/search-indexer`; `bunx tsc --noEmit` in `packages/mobile` (errors from the stale `.expo/types/router.d.ts` pre-exist and are ignored).
- Lint: from the repo root, `bunx biome check --write <files touched by the task>`.
- Mobile tests: `bun test <file>` in `packages/mobile`. Search indexer tests: `bun test` in `packages/search-indexer`.

## File map

API (`packages/api/src`):

| File | Responsibility |
|---|---|
| `lib/errors.ts` (modify) | Nine new shared error codes and English fallbacks |
| `lib/payments/types.ts` (rewrite) | `ProviderName`, `ProviderPaymentStatus`, `NormalizedPayment`, `NormalizedWebhookEvent`, `WebhookSignatureError`, `PaymentProvider` |
| `lib/payments/notchpay.ts` (modify) | HMAC webhook verification, event parsing, normalised `verifyPayment` |
| `lib/payments/stripe.ts` (modify) | Normalised webhook events and `verifyPayment` via Checkout Session retrieval |
| `lib/payments/index.ts` (modify) | `getProvider` only; passes `NOTCHPAY_HASH_KEY` |
| `lib/relationId.ts` (create) | Relationship value to id string |
| `lib/transactions.ts` (create) | `withTransaction(payload, fn)` |
| `lib/paymentTransitions.ts` (create) | Transition table, `canTransition`, `transitionPath` |
| `lib/boostPricing.ts` (create) | `BOOST_PRICING`, `findBoostPrice` |
| `lib/rateLimit.ts` (create) | Fixed-window counters, Redis or in-memory store |
| `lib/redact.ts` (create) | `redactPersonalData` for stored webhook bodies |
| `lib/paymentWebhookRoute.ts` (create) | Shared webhook route behaviour (verify, store, queue) |
| `access/staff.ts` (create) | `staffOnly`, `nobody`, `selfOrStaffField` |
| `collections/PaymentIntents.ts`, `WebhookEvents.ts`, `ContactReveals.ts` (create) | New collections |
| `collections/BoostPayments.ts`, `Users.ts`, `Reviews.ts` (modify) | Closed create, `paymentIntent`, phone read access, review hook |
| `services/payments.ts` (create) | Intent creation, lookup, `applyStatus`, `settlePayment` |
| `services/paymentPurposes.ts` (create) | Purpose handlers keyed by `purpose` |
| `services/boostActivation.ts` (create) | `computeBoostedUntil`, `activateBoostPayment`, `failBoostPayment` |
| `services/boostPurchase.ts` (create) | `startBoostPurchase`, `BoostPurchaseError`, `buildCallbackUrl` |
| `services/webhookEvents.ts` (create) | `recordWebhookEvent`, `processWebhookEvent` |
| `services/paymentReconciliation.ts` (create) | `reconcilePendingPayments` |
| `services/paymentBackfill.ts` (create) | Idempotent legacy boost payment backfill |
| `services/contactReveal.ts` (create) | `revealContactPhone`, `ContactRevealError` |
| `services/reviewRules.ts` (create) | `assertReviewAllowed`, `haveInteracted`, `ReviewRuleError` |
| `services/reviewAudit.ts` (create) | `auditLegacyReviews` |
| `services/accountDeletion.ts` (modify) | Retain and anonymise payment records |
| `hooks/reviews.ts` (modify) | `enforceReviewRules` beforeChange hook |
| `jobs/processWebhookEvent.ts`, `jobs/reconcilePendingPayments.ts` (create) | Payload tasks |
| `migrations/*.ts` (create) | Payload migrations and their index |
| `scripts/transactionProbe.ts` (create) | CI probe proving transactions are live |
| `app/(frontend)/api/public/boost/**` (modify) | Purchase, callback, webhooks rewired |
| `app/(frontend)/api/listings/[id]/contact-phone/route.ts` (create) | Phone reveal route |
| `app/(frontend)/api/public/search/route.ts`, `config/route.ts` (modify) | Filter escaping, boost pricing |

Clients and infra: `packages/web/src/lib/{apiError,api}.ts`, `hooks/use-app-config.tsx`, `app/layout.tsx`, `components/listing/{phone-reveal,boost-dialog,review-form}.tsx`, `app/listing/[id]/page.tsx`, `app/profile/me/page.tsx`, `app/contact/page.tsx`, `messages/{en,fr}.json`; `packages/mobile/src/lib/apiError.ts`, `src/components/PhoneReveal.tsx`, `app/listing/[id].tsx`, `app/profile/[userId].tsx`, `src/locales/{en,fr}.json`; `packages/search-indexer/src/meilisearch.ts`; `docker-compose.yml`, `docker-compose.local.yml`, `deployments/docker-compose/docker-compose.yml`, `.env.example`, `deployments/docker-compose/.env.example`, `.gitignore`, `.github/workflows/ci.yml`.

---

### Task 1: Shared error codes in the API and both clients

**Files:**
- Modify: `packages/api/src/lib/errors.ts`
- Modify: `packages/web/src/lib/apiError.ts`
- Modify: `packages/mobile/src/lib/apiError.ts`
- Modify: `packages/web/messages/en.json`, `packages/web/messages/fr.json`
- Modify: `packages/mobile/src/locales/en.json`, `packages/mobile/src/locales/fr.json`
- Test: `packages/api/tests/int/error-codes.int.spec.ts` (create)
- Test: `packages/mobile/src/lib/apiError.test.ts` (create)

**Interfaces:**
- Produces (API `ERROR_CODES` keys used by every later task): `paymentProviderUnavailable`, `paymentAmountMismatch`, `boostNotOwner`, `boostListingNotPublished`, `boostInvalidDuration`, `reviewSelf`, `reviewDuplicate`, `reviewNoInteraction`, `contactPhoneUnavailable`.
- Produces (clients): `normalizeApiError` returns `errors[0].data.code` when it is a known code. Payload passes an `APIError`'s `data` through to `errors[0].data`, which is how the review hook (Task 13) delivers its code.

- [ ] **Step 1: Write the failing API test**

```ts
// packages/api/tests/int/error-codes.int.spec.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	ERROR_CODES,
	errorResponse,
	fallbackMessage,
} from "../../src/lib/errors";

const P0_CODES = {
	paymentProviderUnavailable: "payment.providerUnavailable",
	paymentAmountMismatch: "payment.amountMismatch",
	boostNotOwner: "boost.notOwner",
	boostListingNotPublished: "boost.listingNotPublished",
	boostInvalidDuration: "boost.invalidDuration",
	reviewSelf: "review.self",
	reviewDuplicate: "review.duplicate",
	reviewNoInteraction: "review.noInteraction",
	contactPhoneUnavailable: "contact.phoneUnavailable",
} as const;

describe("P0 error codes", () => {
	it.each(Object.entries(P0_CODES))("defines %s as %s", (key, code) => {
		expect(ERROR_CODES[key as keyof typeof ERROR_CODES]).toBe(code);
	});

	it.each(Object.values(P0_CODES))("gives %s its own fallback", (code) => {
		expect(fallbackMessage(code)).not.toBe(
			fallbackMessage(ERROR_CODES.unknown),
		);
	});

	it("builds the shared response shape", async () => {
		const response = errorResponse(ERROR_CODES.boostNotOwner, 403);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			code: "boost.notOwner",
			message: "You can only boost your own listings.",
		});
	});
});
```

- [ ] **Step 2: Write the failing mobile test**

```ts
// packages/mobile/src/lib/apiError.test.ts
import { describe, expect, test } from "bun:test";
import { normalizeApiError } from "./apiError";

describe("normalizeApiError", () => {
	test("reads the code a Payload APIError carries in data", () => {
		expect(
			normalizeApiError(409, {
				errors: [
					{
						name: "APIError",
						message: "You have already reviewed this user.",
						data: { code: "review.duplicate" },
					},
				],
			}),
		).toEqual({
			code: "review.duplicate",
			message: "You have already reviewed this user.",
		});
	});

	test("ignores a data code it does not know", () => {
		expect(
			normalizeApiError(409, {
				errors: [{ message: "Nope", data: { code: "made.up" } }],
			}).code,
		).toBe("generic.validation");
	});

	test("still reads our own route contract first", () => {
		expect(
			normalizeApiError(429, {
				code: "generic.rateLimited",
				message: "Too many attempts. Please wait a moment.",
			}).code,
		).toBe("generic.rateLimited");
	});
});
```

- [ ] **Step 3: Run both and watch them fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/error-codes.int.spec.ts`
Expected: FAIL, `expected undefined to be 'payment.providerUnavailable'`.

Run: `cd packages/mobile && bun test src/lib/apiError.test.ts`
Expected: FAIL on the first test (`code` is `generic.validation`).

- [ ] **Step 4: Add the codes to the API**

In `packages/api/src/lib/errors.ts`, add to `ERROR_CODES` after the moderation block:

```ts
	// Payments and boosts
	paymentProviderUnavailable: "payment.providerUnavailable",
	// Logged when a provider reports another amount or currency; never sent to a client.
	paymentAmountMismatch: "payment.amountMismatch",
	boostNotOwner: "boost.notOwner",
	boostListingNotPublished: "boost.listingNotPublished",
	boostInvalidDuration: "boost.invalidDuration",

	// Reviews
	reviewSelf: "review.self",
	reviewDuplicate: "review.duplicate",
	reviewNoInteraction: "review.noInteraction",

	// Seller contact
	contactPhoneUnavailable: "contact.phoneUnavailable",
```

and to `FALLBACKS`:

```ts
	[ERROR_CODES.paymentProviderUnavailable]:
		"Payment is unavailable right now. Please try again later.",
	[ERROR_CODES.paymentAmountMismatch]: "The payment could not be confirmed.",
	[ERROR_CODES.boostNotOwner]: "You can only boost your own listings.",
	[ERROR_CODES.boostListingNotPublished]:
		"Only published listings can be boosted.",
	[ERROR_CODES.boostInvalidDuration]: "This boost duration is not available.",
	[ERROR_CODES.reviewSelf]: "You cannot review yourself.",
	[ERROR_CODES.reviewDuplicate]: "You have already reviewed this user.",
	[ERROR_CODES.reviewNoInteraction]:
		"You can review a user only after contacting them.",
	[ERROR_CODES.contactPhoneUnavailable]:
		"This seller has not shared a phone number.",
```

- [ ] **Step 5: Add the client-facing codes to web and mobile**

In both `packages/web/src/lib/apiError.ts` and `packages/mobile/src/lib/apiError.ts`, add to `ERROR_CODES` (after `contactIncomplete`):

```ts
	contactPhoneUnavailable: "contact.phoneUnavailable",

	paymentProviderUnavailable: "payment.providerUnavailable",
	boostNotOwner: "boost.notOwner",
	boostListingNotPublished: "boost.listingNotPublished",
	boostInvalidDuration: "boost.invalidDuration",

	reviewSelf: "review.self",
	reviewDuplicate: "review.duplicate",
	reviewNoInteraction: "review.noInteraction",
```

and to `FALLBACKS` the same English sentences as the API for these eight codes (`payment.amountMismatch` is never sent to a client and is not added).

Still in both files, in `normalizeApiError`, replace the start of case (2):

```ts
	if (Array.isArray(b.errors) && b.errors.length > 0) {
		const first = b.errors[0] as {
			data?: { code?: unknown; errors?: Array<{ message?: unknown }> };
			message?: unknown;
		};

		// Our collection hooks throw APIError with `data.code`; Payload passes
		// `data` through untouched, so the code survives the REST layer.
		const dataCode = first?.data?.code;
		if (typeof dataCode === "string" && dataCode in FALLBACKS) {
			return { code: dataCode, message: fallbackFor(dataCode) };
		}
```

(the rest of case (2), from `const nested = first?.data?.errors;`, is unchanged).

- [ ] **Step 6: Add the translations**

Web `messages/en.json`, inside `"ApiErrors"`: add `"phoneUnavailable": "This seller has not shared a phone number."` to the existing `"contact"` object, and add these objects:

```json
"payment": {
	"providerUnavailable": "Payment is unavailable right now. Please try again later."
},
"boost": {
	"notOwner": "You can only boost your own listings.",
	"listingNotPublished": "Only published listings can be boosted.",
	"invalidDuration": "This boost duration is not available."
},
"review": {
	"self": "You cannot review yourself.",
	"duplicate": "You have already reviewed this user.",
	"noInteraction": "You can review a user only after contacting them."
}
```

Web `messages/fr.json`, inside `"ApiErrors"`: `"contact"` gains `"phoneUnavailable": "Ce vendeur n'a pas partagé de numéro de téléphone."`, plus:

```json
"payment": {
	"providerUnavailable": "Le paiement est indisponible pour le moment. Réessayez plus tard."
},
"boost": {
	"notOwner": "Vous ne pouvez booster que vos propres annonces.",
	"listingNotPublished": "Seules les annonces publiées peuvent être boostées.",
	"invalidDuration": "Cette durée de boost n'est pas disponible."
},
"review": {
	"self": "Vous ne pouvez pas vous évaluer vous-même.",
	"duplicate": "Vous avez déjà évalué cet utilisateur.",
	"noInteraction": "Vous pouvez évaluer un utilisateur seulement après l'avoir contacté."
}
```

Mobile `src/locales/en.json` and `fr.json`: the same keys, same wording, under `"apiErrors"`.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/error-codes.int.spec.ts` — Expected: PASS (19 tests).
Run: `cd packages/mobile && bun test src/lib/apiError.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 8: Typecheck and lint**

Run: `cd packages/api && bun run check-types`, `cd packages/web && bun run check-types`, `cd packages/mobile && bunx tsc --noEmit` — Expected: no new errors.
Run from the root: `bunx biome check --write packages/api/src/lib/errors.ts packages/api/tests/int/error-codes.int.spec.ts packages/web/src/lib/apiError.ts packages/mobile/src/lib/apiError.ts packages/mobile/src/lib/apiError.test.ts packages/web/messages packages/mobile/src/locales`

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/lib/errors.ts packages/api/tests/int/error-codes.int.spec.ts packages/web/src/lib/apiError.ts packages/web/messages packages/mobile/src/lib/apiError.ts packages/mobile/src/lib/apiError.test.ts packages/mobile/src/locales
git commit -m "feat: add P0 payment, boost, review and contact error codes"
```

---

### Task 2: Provider interface with normalised events

**Files:**
- Rewrite: `packages/api/src/lib/payments/types.ts`
- Modify: `packages/api/src/lib/payments/notchpay.ts`
- Modify: `packages/api/src/lib/payments/stripe.ts`
- Modify: `packages/api/src/lib/payments/index.ts`
- Modify: `packages/api/src/app/(frontend)/api/public/boost/webhook/stripe/route.ts`
- Modify: `packages/api/src/app/(frontend)/api/public/boost/callback/route.ts`
- Modify: `packages/api/tests/int/boost-callback-route.int.spec.ts`
- Test: `packages/api/tests/int/payment-providers.int.spec.ts` (create)

**Interfaces:**
- Produces:
  - `type ProviderName = "notchpay" | "stripe"`
  - `type ProviderPaymentStatus = "pending" | "succeeded" | "failed" | "cancelled" | "expired"`
  - `interface NormalizedPayment { reference: string; status: ProviderPaymentStatus; amount: number | null; currency: string | null; providerTransactionId: string | null }`
  - `interface NormalizedWebhookEvent extends NormalizedPayment { providerEventId: string; type: string }`
  - `class WebhookSignatureError extends Error`
  - `interface PaymentProvider { readonly id: ProviderName; createPayment(params): Promise<CreatePaymentResult>; verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<NormalizedWebhookEvent>; parseWebhookEvent(raw: unknown): NormalizedWebhookEvent; verifyPayment(providerReference: string): Promise<NormalizedPayment> }`
  - `getProvider(name: ProviderName): PaymentProvider` (unchanged signature)

`reference` is always our reference (`PI-{id}`, or `BOOST-{id}` for legacy payments); `providerTransactionId` is the provider's id (`trx.…`, `cs_…`). `parseWebhookEvent` exists so the processing job can re-normalise a stored, already verified body without the signature.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/api/tests/int/payment-providers.int.spec.ts
// @vitest-environment node
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotchPayProvider } from "../../src/lib/payments/notchpay";
import { StripeProvider } from "../../src/lib/payments/stripe";
import { WebhookSignatureError } from "../../src/lib/payments/types";

const HASH_KEY = "notch-hash-key";
const notchpay = () =>
	new NotchPayProvider("pk_test", "https://notchpay.test", HASH_KEY);
const notchEvent = (event: string, status: string) =>
	JSON.stringify({
		id: "evt_n1",
		event,
		data: {
			merchant_reference: "PI-abc",
			trxref: "PI-abc",
			reference: "trx.123",
			amount: 900,
			currency: "XAF",
			status,
		},
	});
const sign = (body: string, key = HASH_KEY) =>
	createHmac("sha256", key).update(body).digest("hex");

describe("NotchPayProvider.verifyWebhook", () => {
	const body = notchEvent("payment.complete", "complete");

	it("returns the normalised event for a valid signature", async () => {
		await expect(
			notchpay().verifyWebhook(body, { "x-notch-signature": sign(body) }),
		).resolves.toEqual({
			providerEventId: "evt_n1",
			type: "payment.complete",
			reference: "PI-abc",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "trx.123",
		});
	});

	it("rejects a signature made with another key", async () => {
		await expect(
			notchpay().verifyWebhook(body, {
				"x-notch-signature": sign(body, "other"),
			}),
		).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("rejects a missing or malformed signature", async () => {
		await expect(notchpay().verifyWebhook(body, {})).rejects.toBeInstanceOf(
			WebhookSignatureError,
		);
		await expect(
			notchpay().verifyWebhook(body, { "x-notch-signature": "zz" }),
		).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("refuses to run without a hash key", async () => {
		await expect(
			new NotchPayProvider("pk_test").verifyWebhook(body, {
				"x-notch-signature": sign(body),
			}),
		).rejects.toThrow("NOTCHPAY_HASH_KEY");
	});

	it.each([
		["payment.failed", "failed", "failed"],
		["payment.canceled", "canceled", "cancelled"],
		["payment.expired", "expired", "expired"],
	])("maps %s to %s", (type, status, expected) => {
		expect(
			notchpay().parseWebhookEvent(JSON.parse(notchEvent(type, status)))
				.status,
		).toBe(expected);
	});
});

describe("NotchPayProvider.verifyPayment", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("normalises the transaction NotchPay returns", async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				transaction: {
					reference: "trx.123",
					merchant_reference: "PI-abc",
					amount: 900,
					currency: "xaf",
					status: "complete",
				},
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(notchpay().verifyPayment("trx.123")).resolves.toEqual({
			reference: "PI-abc",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "trx.123",
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"https://notchpay.test/payments/trx.123",
			expect.anything(),
		);
	});

	it("throws when NotchPay answers with an error status", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 503 })),
		);
		await expect(notchpay().verifyPayment("trx.123")).rejects.toThrow("503");
	});
});

describe("StripeProvider", () => {
	const SECRET = "whsec_test_secret";
	const stripe = () => new StripeProvider("sk_test_123", SECRET);
	const session = (overrides: Record<string, unknown> = {}) => ({
		id: "evt_s1",
		object: "event",
		type: "checkout.session.completed",
		data: {
			object: {
				id: "cs_1",
				object: "checkout.session",
				amount_total: 900,
				currency: "xaf",
				payment_status: "paid",
				status: "complete",
				metadata: { reference: "PI-abc" },
				...overrides,
			},
		},
	});

	it("verifies a signed Checkout event", async () => {
		const body = JSON.stringify(session());
		const header = Stripe.webhooks.generateTestHeaderString({
			payload: body,
			secret: SECRET,
		});
		await expect(
			stripe().verifyWebhook(body, { "stripe-signature": header }),
		).resolves.toEqual({
			providerEventId: "evt_s1",
			type: "checkout.session.completed",
			reference: "PI-abc",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "cs_1",
		});
	});

	it("rejects an event signed with another secret", async () => {
		const body = JSON.stringify(session());
		const header = Stripe.webhooks.generateTestHeaderString({
			payload: body,
			secret: "whsec_other",
		});
		await expect(
			stripe().verifyWebhook(body, { "stripe-signature": header }),
		).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("reads an unpaid completed session as pending", () => {
		expect(
			stripe().parseWebhookEvent(session({ payment_status: "unpaid" }))
				.status,
		).toBe("pending");
	});

	it("reads an expired session as expired", () => {
		const event = { ...session(), type: "checkout.session.expired" };
		expect(stripe().parseWebhookEvent(event).status).toBe("expired");
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/payment-providers.int.spec.ts`
Expected: FAIL, `WebhookSignatureError` is not exported and NotchPay `verifyWebhook` throws "NotchPay ne supporte pas…".

- [ ] **Step 3: Rewrite the provider types**

```ts
// packages/api/src/lib/payments/types.ts
export type ProviderName = "notchpay" | "stripe";

export interface CreatePaymentParams {
	/** Our reference, sent to the provider: `PI-{intentId}`. */
	reference: string;
	amount: number;
	currency: string;
	description: string;
	callbackUrl: string;
	returnUrl?: string;
	customer: {
		email: string;
		name?: string;
		phone?: string;
	};
}

export interface CreatePaymentResult {
	checkoutUrl?: string;
	clientSecret?: string;
	providerReference: string;
}

export type ProviderPaymentStatus =
	| "pending"
	| "succeeded"
	| "failed"
	| "cancelled"
	| "expired";

export interface NormalizedPayment {
	/** Our reference: `PI-{id}`, or `BOOST-{id}` for payments created before P0. */
	reference: string;
	status: ProviderPaymentStatus;
	/** Smallest currency unit, as the provider reports it. */
	amount: number | null;
	currency: string | null;
	providerTransactionId: string | null;
}

export interface NormalizedWebhookEvent extends NormalizedPayment {
	providerEventId: string;
	type: string;
}

/** Thrown only for a bad or missing signature; routes answer 400 to it. */
export class WebhookSignatureError extends Error {
	constructor() {
		super("Webhook signature verification failed");
		this.name = "WebhookSignatureError";
	}
}

export interface PaymentProvider {
	readonly id: ProviderName;
	createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
	verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<NormalizedWebhookEvent>;
	/** Re-reads a body that was already verified and stored. */
	parseWebhookEvent(raw: unknown): NormalizedWebhookEvent;
	verifyPayment(providerReference: string): Promise<NormalizedPayment>;
}
```

- [ ] **Step 4: Implement NotchPay**

Replace everything in `packages/api/src/lib/payments/notchpay.ts` except the body of `createPayment`, which stays as it is:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import {
	type CreatePaymentParams,
	type CreatePaymentResult,
	type NormalizedPayment,
	type NormalizedWebhookEvent,
	type PaymentProvider,
	type ProviderPaymentStatus,
	WebhookSignatureError,
} from "./types";

const EVENT_STATUSES: Record<string, ProviderPaymentStatus> = {
	"payment.complete": "succeeded",
	"payment.failed": "failed",
	"payment.canceled": "cancelled",
	"payment.cancelled": "cancelled",
	"payment.expired": "expired",
};

export function mapNotchPayStatus(value: string): ProviderPaymentStatus {
	const lower = value.toLowerCase();
	if (["complete", "completed", "approved", "success"].includes(lower))
		return "succeeded";
	if (["failed", "error"].includes(lower)) return "failed";
	if (lower === "expired") return "expired";
	if (["cancelled", "canceled"].includes(lower)) return "cancelled";
	return "pending";
}

const toText = (value: unknown): string =>
	typeof value === "string" ? value : "";

const toAmount = (value: unknown): number | null => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (
		typeof value === "string" &&
		value.trim() !== "" &&
		Number.isFinite(Number(value))
	)
		return Number(value);
	return null;
};

const toCurrency = (value: unknown): string | null =>
	typeof value === "string" && value ? value.toUpperCase() : null;

export class NotchPayProvider implements PaymentProvider {
	readonly id = "notchpay" as const;

	constructor(
		private readonly publicKey: string,
		private readonly baseUrl = "https://api.notchpay.co",
		private readonly hashKey?: string,
	) {}

	async createPayment(
		params: CreatePaymentParams,
	): Promise<CreatePaymentResult> {
		// unchanged body
	}

	async verifyPayment(providerReference: string): Promise<NormalizedPayment> {
		const res = await fetch(
			`${this.baseUrl}/payments/${encodeURIComponent(providerReference)}`,
			{
				headers: { Authorization: this.publicKey, Accept: "application/json" },
			},
		);
		if (!res.ok) {
			throw new Error(`NotchPay verify (${res.status})`);
		}

		const data = (await res.json()) as Record<string, unknown>;
		const trx = (data.transaction ?? data) as Record<string, unknown>;
		return {
			reference: toText(trx.merchant_reference) || toText(trx.trxref),
			status: mapNotchPayStatus(toText(trx.status)),
			amount: toAmount(trx.amount),
			currency: toCurrency(trx.currency),
			providerTransactionId: toText(trx.reference) || providerReference,
		};
	}

	async verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<NormalizedWebhookEvent> {
		if (!this.hashKey) {
			throw new Error("NotchPay webhook: NOTCHPAY_HASH_KEY is not configured");
		}

		// A SHA-256 HMAC is exactly 64 hex characters, which also guarantees
		// equal buffer lengths for timingSafeEqual.
		const signature = headers["x-notch-signature"] ?? "";
		if (!/^[0-9a-f]{64}$/i.test(signature)) throw new WebhookSignatureError();

		const expected = createHmac("sha256", this.hashKey)
			.update(rawBody)
			.digest();
		if (!timingSafeEqual(Buffer.from(signature, "hex"), expected)) {
			throw new WebhookSignatureError();
		}

		let raw: unknown;
		try {
			raw = JSON.parse(rawBody);
		} catch {
			throw new WebhookSignatureError();
		}
		return this.parseWebhookEvent(raw);
	}

	parseWebhookEvent(raw: unknown): NormalizedWebhookEvent {
		const event = (raw ?? {}) as {
			id?: unknown;
			event?: unknown;
			data?: Record<string, unknown>;
		};
		const data = event.data ?? {};
		const type = toText(event.event);
		return {
			providerEventId: toText(event.id),
			type,
			reference: toText(data.merchant_reference) || toText(data.trxref),
			status: EVENT_STATUSES[type] ?? mapNotchPayStatus(toText(data.status)),
			amount: toAmount(data.amount),
			currency: toCurrency(data.currency),
			providerTransactionId: toText(data.reference) || null,
		};
	}
}
```

- [ ] **Step 5: Implement Stripe**

In `packages/api/src/lib/payments/stripe.ts`, keep the constructor and `createPayment`; change the imports, `id`, and replace `verifyWebhook`:

```ts
import Stripe from "stripe";
import {
	type CreatePaymentParams,
	type CreatePaymentResult,
	type NormalizedPayment,
	type NormalizedWebhookEvent,
	type PaymentProvider,
	type ProviderPaymentStatus,
	WebhookSignatureError,
} from "./types";

export function stripeSessionStatus(
	type: string,
	session: Pick<Stripe.Checkout.Session, "payment_status" | "status">,
): ProviderPaymentStatus {
	if (type === "checkout.session.expired" || session.status === "expired")
		return "expired";
	if (type === "checkout.session.async_payment_failed") return "failed";
	if (type === "checkout.session.async_payment_succeeded") return "succeeded";
	return session.payment_status === "paid" ? "succeeded" : "pending";
}

export class StripeProvider implements PaymentProvider {
	readonly id = "stripe" as const;

	// constructor and createPayment unchanged

	async verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<NormalizedWebhookEvent> {
		const signature = headers["stripe-signature"];
		if (!signature) throw new WebhookSignatureError();

		let event: Stripe.Event;
		try {
			event = this.stripe.webhooks.constructEvent(
				rawBody,
				signature,
				this.webhookSecret,
			);
		} catch {
			throw new WebhookSignatureError();
		}
		return this.parseWebhookEvent(event);
	}

	parseWebhookEvent(raw: unknown): NormalizedWebhookEvent {
		const event = raw as { id: string; type: string; data?: { object?: unknown } };
		const session = event.type.startsWith("checkout.session.")
			? (event.data?.object as Stripe.Checkout.Session)
			: null;
		return {
			providerEventId: event.id,
			type: event.type,
			reference: session?.metadata?.reference ?? "",
			status: session ? stripeSessionStatus(event.type, session) : "pending",
			amount: session?.amount_total ?? null,
			currency: session?.currency ? session.currency.toUpperCase() : null,
			providerTransactionId: session?.id ?? null,
		};
	}

	async verifyPayment(providerReference: string): Promise<NormalizedPayment> {
		const session =
			await this.stripe.checkout.sessions.retrieve(providerReference);
		return {
			reference: session.metadata?.reference ?? "",
			status: stripeSessionStatus("", session),
			amount: session.amount_total ?? null,
			currency: session.currency ? session.currency.toUpperCase() : null,
			providerTransactionId: session.id,
		};
	}
}
```

- [ ] **Step 6: Update the provider index**

In `packages/api/src/lib/payments/index.ts`: delete the local `export type ProviderName`, pass the hash key in both constructors (`new NotchPayProvider(publicKey, process.env.NOTCHPAY_BASE_URL ?? "https://api.notchpay.co", process.env.NOTCHPAY_HASH_KEY)`), import `ProviderName` from `./types`, and replace the export block with:

```ts
export { NotchPayProvider, StripeProvider };
export type {
	CreatePaymentParams,
	CreatePaymentResult,
	NormalizedPayment,
	NormalizedWebhookEvent,
	PaymentProvider,
	ProviderName,
	ProviderPaymentStatus,
} from "./types";
export { WebhookSignatureError } from "./types";
```

(`getNotchPayProvider` stays until Task 8 removes it.)

- [ ] **Step 7: Keep the existing callers working**

`boost/webhook/stripe/route.ts`: replace the two status checks with

```ts
		if (event.status === "succeeded") {
			await activateBoost(event.reference);
		} else if (
			event.status === "failed" ||
			event.status === "cancelled" ||
			event.status === "expired"
		) {
```

`boost/callback/route.ts`: replace the NotchPay branch body's first lines with

```ts
				const notchpay = getNotchPayProvider();
				const verified = await notchpay.verifyPayment(reference);

				if (verified.status === "succeeded") {
```

and `} else if (paymentStatus === "pending") {` with `} else if (verified.status === "pending") {`.

`tests/int/boost-callback-route.int.spec.ts`: replace both `verifyPaymentMock.mockResolvedValue("completed");` with

```ts
		verifyPaymentMock.mockResolvedValue({
			reference: "",
			status: "succeeded",
			amount: 900,
			currency: "XAF",
			providerTransactionId: "trx.123456",
		});
```

- [ ] **Step 8: Run the tests**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/payment-providers.int.spec.ts` — Expected: PASS (13 tests).
Run: `bunx vitest run --config ./vitest.config.mts tests/int/boost-payments.int.spec.ts` — Expected: PASS (unchanged).

- [ ] **Step 9: Typecheck, lint, commit**

Run: `cd packages/api && bun run check-types` — Expected: no errors.
Run from root: `bunx biome check --write packages/api/src/lib/payments packages/api/src/app/\(frontend\)/api/public/boost packages/api/tests/int/payment-providers.int.spec.ts packages/api/tests/int/boost-callback-route.int.spec.ts`

```bash
git add packages/api/src/lib/payments packages/api/src/app/\(frontend\)/api/public/boost packages/api/tests/int/payment-providers.int.spec.ts packages/api/tests/int/boost-callback-route.int.spec.ts
git commit -m "feat(api): normalise provider payment reports and verify NotchPay webhooks in the provider"
```

---

### Task 3: `payment-intents` and `webhook-events` collections, closed boost-payment creation

**Files:**
- Create: `packages/api/src/access/staff.ts`
- Create: `packages/api/src/collections/PaymentIntents.ts`
- Create: `packages/api/src/collections/WebhookEvents.ts`
- Modify: `packages/api/src/collections/BoostPayments.ts`
- Modify: `packages/api/src/payload.config.ts`
- Modify (generated): `packages/api/src/payload-types.ts`
- Test: `packages/api/tests/int/payment-access.int.spec.ts` (create)

**Interfaces:**
- Produces: collections `payment-intents` (generated type `PaymentIntent`) and `webhook-events` (`WebhookEvent`); `staffOnly: Access`, `nobody: Access`, `selfOrStaffField: FieldAccess` from `access/staff.ts`; `boost-payments` gains `paymentIntent` and `customerDeletedAt`, `user` becomes optional at schema level.
- `payment-intents.reference` is unique but not required, so it can be set right after creation to `PI-{id}` (Mongo indexes it sparse). `customer` is optional at schema level because account deletion nulls it (Task 15); the service always sets it on creation.
- `webhook-events` has an extra `reference` text field (our reference from the event) so account deletion can find the events of a customer's intents.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/tests/int/payment-access.int.spec.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { selfOrStaffField } from "../../src/access/staff";
import { BoostPayments } from "../../src/collections/BoostPayments";
import { PaymentIntents } from "../../src/collections/PaymentIntents";
import { WebhookEvents } from "../../src/collections/WebhookEvents";

const USER = { id: "u-1", role: "user" };
const MOD = { id: "m-1", role: "moderator" };
const ADMIN = { id: "a-1", role: "admin" };
const run = (fn: any, user: unknown, extra: Record<string, unknown> = {}) =>
	fn({ req: { user }, ...extra });

describe("payment-intents access", () => {
	it("shows a customer only their own intents", () => {
		expect(run(PaymentIntents.access?.read, USER)).toEqual({
			customer: { equals: "u-1" },
		});
	});

	it("lets staff read every intent and hides them from guests", () => {
		expect(run(PaymentIntents.access?.read, MOD)).toBe(true);
		expect(run(PaymentIntents.access?.read, null)).toBe(false);
	});

	it.each(["create", "update", "delete"] as const)(
		"closes %s even to admins",
		(operation) => {
			expect(run(PaymentIntents.access?.[operation], ADMIN)).toBe(false);
		},
	);
});

describe("webhook-events access", () => {
	it("is readable by staff only", () => {
		expect(run(WebhookEvents.access?.read, USER)).toBe(false);
		expect(run(WebhookEvents.access?.read, MOD)).toBe(true);
	});

	it("is unique per provider event", () => {
		expect(WebhookEvents.indexes).toContainEqual({
			fields: ["provider", "providerEventId"],
			unique: true,
		});
	});
});

describe("boost-payments access", () => {
	it("no longer lets any signed-in user create a record", () => {
		expect(run(BoostPayments.access?.create, USER)).toBe(false);
		expect(run(BoostPayments.access?.create, ADMIN)).toBe(false);
	});
});

describe("selfOrStaffField", () => {
	it("lets a user read their own field", () => {
		expect(run(selfOrStaffField, USER, { id: "u-1" })).toBe(true);
		expect(run(selfOrStaffField, USER, { doc: { id: "u-1" } })).toBe(true);
	});

	it("hides it from anyone else except staff", () => {
		expect(run(selfOrStaffField, USER, { id: "u-2" })).toBe(false);
		expect(run(selfOrStaffField, null, { id: "u-2" })).toBe(false);
		expect(run(selfOrStaffField, MOD, { id: "u-2" })).toBe(true);
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/payment-access.int.spec.ts`
Expected: FAIL, cannot resolve `../../src/access/staff`.

- [ ] **Step 3: Write the access helpers**

```ts
// packages/api/src/access/staff.ts
import type { Access, FieldAccess } from "payload";
import { isModerator } from "./roles";

export const staffOnly: Access = ({ req: { user } }) =>
	isModerator(user as { role?: string } | null);

/** For records only a service may write, with overrideAccess. */
export const nobody: Access = () => false;

export const selfOrStaffField: FieldAccess = ({ req: { user }, id, doc }) => {
	if (!user) return false;
	if (isModerator(user as { role?: string })) return true;
	const targetId = id ?? (doc as { id?: unknown } | undefined)?.id;
	return targetId !== undefined && String(targetId) === String(user.id);
};
```

- [ ] **Step 4: Write the collections**

```ts
// packages/api/src/collections/PaymentIntents.ts
import type { CollectionConfig } from "payload";
import { isModerator } from "../access/roles";
import { nobody } from "../access/staff";

const STATUS_OPTIONS = [
	{ label: "Created", value: "created" },
	{ label: "Pending", value: "pending" },
	{ label: "Succeeded", value: "succeeded" },
	{ label: "Failed", value: "failed" },
	{ label: "Cancelled", value: "cancelled" },
	{ label: "Expired", value: "expired" },
];

const PROVIDER_OPTIONS = [
	{ label: "NotchPay", value: "notchpay" },
	{ label: "Stripe", value: "stripe" },
];

/**
 * The single record of every attempt to move money. Only services/payments.ts
 * writes it, with overrideAccess; status changes go through its transition table.
 */
export const PaymentIntents: CollectionConfig = {
	slug: "payment-intents",
	admin: {
		useAsTitle: "reference",
		defaultColumns: [
			"reference",
			"purpose",
			"amount",
			"currency",
			"status",
			"createdAt",
		],
	},
	access: {
		read: ({ req: { user } }) => {
			if (!user) return false;
			if (isModerator(user as { role?: string })) return true;
			return { customer: { equals: user.id } };
		},
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{
			name: "purpose",
			type: "select",
			required: true,
			options: [{ label: "Boost", value: "boost" }],
		},
		{
			name: "targetType",
			type: "select",
			required: true,
			options: [{ label: "Boost payment", value: "boost-payment" }],
		},
		{ name: "targetId", type: "text", required: true, index: true },
		{ name: "customer", type: "relationship", relationTo: "users", index: true },
		{ name: "customerDeletedAt", type: "date" },
		{
			name: "amount",
			type: "number",
			required: true,
			validate: (value: unknown) =>
				(typeof value === "number" && Number.isInteger(value) && value >= 0) ||
				"Amount must be a whole number in the currency's smallest unit",
		},
		{ name: "currency", type: "text", required: true },
		{ name: "provider", type: "select", required: true, options: PROVIDER_OPTIONS },
		{ name: "providerReference", type: "text", index: true },
		{ name: "reference", type: "text", unique: true },
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "created",
			index: true,
			options: STATUS_OPTIONS,
		},
		{
			name: "statusHistory",
			type: "array",
			fields: [
				{ name: "status", type: "select", required: true, options: STATUS_OPTIONS },
				{
					name: "source",
					type: "select",
					required: true,
					options: [
						{ label: "Webhook", value: "webhook" },
						{ label: "Callback", value: "callback" },
						{ label: "Reconciliation", value: "reconcile" },
						{ label: "System", value: "system" },
					],
				},
				{ name: "at", type: "date", required: true },
				{ name: "note", type: "text" },
			],
		},
		{ name: "idempotencyKey", type: "text", required: true, unique: true },
		{ name: "checkoutUrl", type: "text" },
		{ name: "expiresAt", type: "date", index: true },
		{ name: "settledAmount", type: "number" },
		{ name: "settledCurrency", type: "text" },
	],
	timestamps: true,
};
```

```ts
// packages/api/src/collections/WebhookEvents.ts
import type { CollectionConfig } from "payload";
import { nobody, staffOnly } from "../access/staff";

/** Every verified provider event, stored once before it is processed. */
export const WebhookEvents: CollectionConfig = {
	slug: "webhook-events",
	admin: {
		useAsTitle: "providerEventId",
		defaultColumns: ["provider", "type", "reference", "receivedAt", "processedAt", "attempts"],
	},
	access: {
		read: staffOnly,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	indexes: [{ fields: ["provider", "providerEventId"], unique: true }],
	fields: [
		{
			name: "provider",
			type: "select",
			required: true,
			options: [
				{ label: "NotchPay", value: "notchpay" },
				{ label: "Stripe", value: "stripe" },
			],
		},
		{ name: "providerEventId", type: "text", required: true },
		{ name: "type", type: "text" },
		{ name: "reference", type: "text", index: true },
		{ name: "payloadHash", type: "text", required: true },
		{ name: "raw", type: "json" },
		{ name: "receivedAt", type: "date", required: true },
		{ name: "processedAt", type: "date" },
		{ name: "attempts", type: "number", defaultValue: 0 },
		{ name: "lastError", type: "text" },
	],
	timestamps: true,
};
```

- [ ] **Step 5: Change `boost-payments`**

In `packages/api/src/collections/BoostPayments.ts`:
- replace `import { authenticated } from "../access/authenticated";` with `import { nobody } from "../access/staff";` and `create: authenticated,` with `create: nobody,` (records are created only by the purchase service);
- in the `user` field, replace `required: true,` with `required: false,` and add the comment `// Nulled when the customer deletes their account; the record is kept.` above the field;
- append these fields after `paymentUrl`:

```ts
		{
			name: "paymentIntent",
			type: "relationship",
			relationTo: "payment-intents",
			admin: { readOnly: true },
		},
		{
			name: "customerDeletedAt",
			type: "date",
			admin: { readOnly: true },
		},
```

- [ ] **Step 6: Register the collections and regenerate types**

In `packages/api/src/payload.config.ts` import `PaymentIntents` and `WebhookEvents` and add them after `BoostPayments` in `collections`.

Run: `cd packages/api && DATABASE_URI=mongodb://127.0.0.1:27017/unused PAYLOAD_SECRET=unused bun run generate:types`
Expected: `src/payload-types.ts` now declares `PaymentIntent` and `WebhookEvent`, and `BoostPayment` has `paymentIntent?` and an optional `user`.

- [ ] **Step 7: Run the test, typecheck, lint**

Run: `bunx vitest run --config ./vitest.config.mts tests/int/payment-access.int.spec.ts` — Expected: PASS (10 tests).
Run: `bun run check-types` in `packages/api` and `packages/web` (web imports `payload-types`) — Expected: no errors.
Run from root: `bunx biome check --write packages/api/src/access/staff.ts packages/api/src/collections packages/api/src/payload.config.ts packages/api/tests/int/payment-access.int.spec.ts`

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/access/staff.ts packages/api/src/collections packages/api/src/payload.config.ts packages/api/src/payload-types.ts packages/api/tests/int/payment-access.int.spec.ts
git commit -m "feat(api): add payment intents and webhook events, close boost payment creation"
```

---
### Task 4: Transition table and settlement service

**Files:**
- Create: `packages/api/src/lib/relationId.ts`
- Create: `packages/api/src/lib/transactions.ts`
- Create: `packages/api/src/lib/paymentTransitions.ts`
- Create: `packages/api/src/services/boostActivation.ts`
- Create: `packages/api/src/services/paymentPurposes.ts`
- Create: `packages/api/src/services/payments.ts`
- Create: `packages/api/tests/int/helpers/fakePayload.ts`
- Test: `packages/api/tests/int/payment-transitions.int.spec.ts` (create)
- Test: `packages/api/tests/int/payment-settlement.int.spec.ts` (create)

**Interfaces:**
- Consumes: `PaymentIntent`, `BoostPayment`, `Listing` from `src/payload-types.ts` (Task 3); `NormalizedPayment`, `ProviderName` from `lib/payments` (Task 2); `ERROR_CODES.paymentAmountMismatch` (Task 1).
- Produces:
  - `relationId(value: unknown): string | null`
  - `type TxReq = Partial<PayloadRequest>`; `withTransaction<T>(payload: Payload, fn: (req: TxReq) => Promise<T>): Promise<T>`
  - `type IntentStatus = PaymentIntent["status"]`; `canTransition(from, to): boolean`; `isTerminal(status): boolean`; `transitionPath(from, to): IntentStatus[]`
  - `computeBoostedUntil(current: string | null | undefined, now: Date, days: number): string`
  - `activateBoostPayment(payload, boostPaymentId: string, req?: TxReq, now?: Date): Promise<{ activated: boolean; boostedUntil: string | null }>`
  - `failBoostPayment(payload, boostPaymentId: string, req?: TxReq): Promise<void>`
  - `PURPOSE_HANDLERS: Record<PaymentIntent["purpose"], { onSucceeded, onFailed }>`
  - In `services/payments.ts`: `INTENT_TTL_MS`, `type IntentDoc = PaymentIntent`, `type StatusSource`, `createPaymentIntent(payload, input: CreateIntentInput, req?: TxReq): Promise<IntentDoc>`, `findIntentByIdempotencyKey(payload, key: string): Promise<IntentDoc | null>`, `findIntentByReference(payload, { reference?, providerReference? }): Promise<IntentDoc | null>`, `markIntentPending(payload, intentId, { providerReference, checkoutUrl, now? }): Promise<IntentDoc>`, `applyStatus(payload, intentId, report: StatusReport): Promise<AppliedOutcome>`, `settlePayment(payload, input: SettleInput): Promise<SettleOutcome>`
  - `type SettleOutcome = { outcome: "unknown_reference" } | AppliedOutcome`; `type AppliedOutcome = { outcome: "applied" | "unchanged" | "ignored" | "amount_mismatch"; intent: IntentDoc }`
  - Test helper `fakePayload(seed, { uniques? })` returning `FakePayload` (store, logger spies, `jobs.queue` spy, `auth` spy).

Decisions encoded here: an intent still `created` that receives a provider report walks through `pending` (both steps recorded), because the webhook can race the response of our own provider call. A success reported for an intent already `failed`, `cancelled` or `expired` is recorded in history, logged as an error for staff, and never changes the status. A report with a missing amount counts as a mismatch. A repeated `succeeded` report re-runs the purpose handler, which is idempotent, so a crash between the two writes of a non-transactional deployment heals on the next report.

- [ ] **Step 1: Write the in-memory Payload fake**

```ts
// packages/api/tests/int/helpers/fakePayload.ts
import type { Payload } from "payload";
import { vi } from "vitest";

export type Doc = Record<string, any>;

const time = (value: unknown) => new Date(value as string).getTime();

function matches(doc: Doc, where: any): boolean {
	if (!where) return true;
	return Object.entries(where).every(([field, cond]: [string, any]) => {
		if (field === "and") return cond.every((w: any) => matches(doc, w));
		if (field === "or") return cond.some((w: any) => matches(doc, w));
		const value = doc[field];
		const values = Array.isArray(value) ? value.map(String) : [String(value)];
		if ("equals" in cond) return values.includes(String(cond.equals));
		if ("in" in cond)
			return cond.in.map(String).some((c: string) => values.includes(c));
		if ("exists" in cond) {
			const present = value !== undefined && value !== null;
			return cond.exists ? present : !present;
		}
		if ("less_than" in cond)
			return value != null && time(value) < time(cond.less_than);
		if ("less_than_equal" in cond)
			return value != null && time(value) <= time(cond.less_than_equal);
		if ("greater_than" in cond)
			return value != null && time(value) > time(cond.greater_than);
		return true;
	});
}

/**
 * In-memory stand-in for the Payload local API: just the methods the services
 * call. `uniques` declares compound unique keys per collection and makes
 * `create`/`update` fail like Mongo's E11000.
 */
export function fakePayload(
	seed: Record<string, Doc[]> = {},
	options: { uniques?: Record<string, string[][]> } = {},
) {
	const store: Record<string, Doc[]> = {};
	for (const [collection, docs] of Object.entries(seed)) {
		store[collection] = docs.map((doc) => structuredClone(doc));
	}
	let seq = 0;
	const col = (collection: string) => {
		store[collection] ??= [];
		return store[collection];
	};
	const byId = (collection: string, id: unknown) =>
		col(collection).find((doc) => String(doc.id) === String(id));
	const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

	const checkUnique = (collection: string, candidate: Doc) => {
		for (const fields of options.uniques?.[collection] ?? []) {
			if (fields.some((f) => candidate[f] === undefined || candidate[f] === null))
				continue;
			const clash = col(collection).some(
				(doc) =>
					doc.id !== candidate.id &&
					fields.every((f) => String(doc[f]) === String(candidate[f])),
			);
			if (clash) {
				throw Object.assign(new Error(`E11000 duplicate key in ${collection}`), {
					code: 11000,
				});
			}
		}
	};

	const payload = {
		store,
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		jobs: { queue: vi.fn(async () => ({ id: `job-${++seq}` })) },
		auth: vi.fn(async () => ({ user: null })),
		async findByID({ collection, id }: any) {
			const doc = byId(collection, id);
			if (!doc) throw notFound();
			return structuredClone(doc);
		},
		async find({ collection, where, limit }: any) {
			let docs = col(collection).filter((doc) => matches(doc, where));
			const totalDocs = docs.length;
			if (typeof limit === "number" && limit > 0) docs = docs.slice(0, limit);
			return {
				docs: docs.map((doc) => structuredClone(doc)),
				totalDocs,
				hasNextPage: false,
				nextPage: null,
			};
		},
		async create({ collection, data }: any) {
			const now = new Date().toISOString();
			const doc = {
				id: `${collection}-${++seq}`,
				createdAt: now,
				updatedAt: now,
				...structuredClone(data),
			};
			checkUnique(collection, doc);
			col(collection).push(doc);
			return structuredClone(doc);
		},
		async update({ collection, id, data }: any) {
			const doc = byId(collection, id);
			if (!doc) throw notFound();
			const next = {
				...doc,
				...structuredClone(data),
				updatedAt: new Date().toISOString(),
			};
			checkUnique(collection, next);
			Object.assign(doc, next);
			return structuredClone(doc);
		},
		async delete({ collection, id }: any) {
			const list = col(collection);
			const index = list.findIndex((doc) => String(doc.id) === String(id));
			if (index < 0) throw notFound();
			return list.splice(index, 1)[0];
		},
	};

	return payload as unknown as Payload & typeof payload;
}

export type FakePayload = ReturnType<typeof fakePayload>;
```

- [ ] **Step 2: Write the failing transition test**

```ts
// packages/api/tests/int/payment-transitions.int.spec.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	canTransition,
	isTerminal,
	transitionPath,
} from "../../src/lib/paymentTransitions";

const STATUSES = [
	"created",
	"pending",
	"succeeded",
	"failed",
	"cancelled",
	"expired",
] as const;

const ALLOWED = new Set([
	"created>pending",
	"created>failed",
	"created>cancelled",
	"pending>succeeded",
	"pending>failed",
	"pending>cancelled",
	"pending>expired",
]);

describe("intent transition table", () => {
	const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const));

	it.each(pairs)("%s -> %s", (from, to) => {
		expect(canTransition(from, to)).toBe(ALLOWED.has(`${from}>${to}`));
	});

	it("treats the four end states as terminal", () => {
		expect(STATUSES.filter(isTerminal)).toEqual([
			"succeeded",
			"failed",
			"cancelled",
			"expired",
		]);
	});

	it("never lets a later failure undo a success", () => {
		expect(transitionPath("succeeded", "failed")).toEqual([]);
		expect(transitionPath("succeeded", "cancelled")).toEqual([]);
	});

	it("walks a created intent through pending when the provider reports first", () => {
		expect(transitionPath("created", "succeeded")).toEqual(["pending", "succeeded"]);
		expect(transitionPath("created", "expired")).toEqual(["pending", "expired"]);
		expect(transitionPath("created", "failed")).toEqual(["failed"]);
	});

	it("has nothing to do for a repeated status", () => {
		expect(transitionPath("pending", "pending")).toEqual([]);
	});
});
```

- [ ] **Step 3: Write the failing settlement test**

```ts
// packages/api/tests/int/payment-settlement.int.spec.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	activateBoostPayment,
	computeBoostedUntil,
} from "../../src/services/boostActivation";
import { applyStatus, settlePayment } from "../../src/services/payments";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T10:00:00.000Z");
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

function world(
	intent: Record<string, unknown> = {},
	listing: Record<string, unknown> = {},
) {
	return fakePayload({
		listings: [
			{ id: "l-1", seller: "u-1", status: "published", boostedUntil: null, ...listing },
		],
		"boost-payments": [
			{
				id: "bp-1",
				listing: "l-1",
				user: "u-1",
				amount: 900,
				duration: "14",
				status: "pending",
				paymentProvider: "notchpay",
				paymentIntent: "pi-1",
			},
		],
		"payment-intents": [
			{
				id: "pi-1",
				purpose: "boost",
				targetType: "boost-payment",
				targetId: "bp-1",
				customer: "u-1",
				amount: 900,
				currency: "XAF",
				provider: "notchpay",
				providerReference: "trx.1",
				reference: "PI-pi-1",
				status: "pending",
				statusHistory: [],
				idempotencyKey: "k-1",
				...intent,
			},
		],
	});
}

const paid = {
	reference: "PI-pi-1",
	status: "succeeded" as const,
	amount: 900,
	currency: "XAF",
	providerTransactionId: "trx.1",
};
const intentOf = (p: FakePayload) => p.store["payment-intents"][0];
const boostOf = (p: FakePayload) => p.store["boost-payments"][0];
const listingOf = (p: FakePayload) => p.store.listings[0];

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("settlePayment", () => {
	it("settles a matching success and boosts the listing", async () => {
		const payload = world();
		const result = await settlePayment(payload, { ...paid, source: "webhook" });

		expect(result.outcome).toBe("applied");
		expect(intentOf(payload)).toMatchObject({
			status: "succeeded",
			settledAmount: 900,
			settledCurrency: "XAF",
		});
		expect(intentOf(payload).statusHistory.at(-1)).toMatchObject({
			status: "succeeded",
			source: "webhook",
		});
		expect(boostOf(payload).status).toBe("completed");
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
	});

	it.each([
		["amount", { amount: 800 }],
		["currency", { currency: "EUR" }],
		["missing amount", { amount: null }],
	])("keeps the intent pending on a %s mismatch", async (_label, change) => {
		const payload = world();
		const result = await settlePayment(payload, {
			...paid,
			...change,
			source: "webhook",
		});

		expect(result.outcome).toBe("amount_mismatch");
		expect(intentOf(payload).status).toBe("pending");
		expect(intentOf(payload).statusHistory.at(-1)).toMatchObject({
			status: "succeeded",
			note: "payment.amountMismatch",
		});
		expect(boostOf(payload).status).toBe("pending");
		expect(listingOf(payload).boostedUntil).toBeNull();
		expect(payload.logger.error).toHaveBeenCalled();
	});

	it("ignores a duplicate webhook", async () => {
		const payload = world();
		await settlePayment(payload, { ...paid, source: "webhook" });
		const boosted = listingOf(payload).boostedUntil;
		const historyLength = intentOf(payload).statusHistory.length;

		const again = await settlePayment(payload, { ...paid, source: "webhook" });

		expect(again.outcome).toBe("unchanged");
		expect(listingOf(payload).boostedUntil).toBe(boosted);
		expect(intentOf(payload).statusHistory).toHaveLength(historyLength);
	});

	it.each([
		["webhook then callback", "webhook", "callback"],
		["callback then webhook", "callback", "webhook"],
	] as const)("reaches the same state for %s", async (_label, first, second) => {
		const payload = world();
		await settlePayment(payload, { ...paid, source: first });
		await settlePayment(payload, { ...paid, source: second });

		expect(intentOf(payload).status).toBe("succeeded");
		expect(
			intentOf(payload).statusHistory.filter(
				(entry: { status: string }) => entry.status === "succeeded",
			),
		).toHaveLength(1);
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
	});

	it("records but ignores a failure after a success", async () => {
		const payload = world();
		await settlePayment(payload, { ...paid, source: "webhook" });
		const result = await settlePayment(payload, {
			...paid,
			status: "failed",
			source: "webhook",
		});

		expect(result.outcome).toBe("ignored");
		expect(intentOf(payload).status).toBe("succeeded");
		expect(intentOf(payload).statusHistory.at(-1)).toMatchObject({
			status: "failed",
			note: "ignored: intent is succeeded",
		});
		expect(boostOf(payload).status).toBe("completed");
	});

	it("fails the boost payment when the intent fails", async () => {
		const payload = world();
		await settlePayment(payload, { ...paid, status: "failed", source: "webhook" });

		expect(intentOf(payload).status).toBe("failed");
		expect(boostOf(payload).status).toBe("failed");
	});

	it("walks a created intent through pending", async () => {
		const payload = world({ status: "created" });
		await settlePayment(payload, { ...paid, source: "webhook" });

		expect(
			intentOf(payload).statusHistory.map((e: { status: string }) => e.status),
		).toEqual(["pending", "succeeded"]);
	});

	it("resolves a legacy BOOST- reference", async () => {
		const payload = world({ id: "pi-9", reference: "BOOST-bp-1" });
		const result = await settlePayment(payload, {
			...paid,
			reference: "BOOST-bp-1",
			source: "webhook",
		});
		expect(result.outcome).toBe("applied");
	});

	it("falls back to the provider transaction id", async () => {
		const payload = world();
		const result = await settlePayment(payload, {
			...paid,
			reference: "",
			source: "callback",
		});
		expect(result.outcome).toBe("applied");
	});

	it("reports an unknown reference without writing anything", async () => {
		const payload = world();
		const result = await settlePayment(payload, {
			...paid,
			reference: "PI-nope",
			providerTransactionId: "trx.nope",
			source: "webhook",
		});
		expect(result.outcome).toBe("unknown_reference");
		expect(intentOf(payload).status).toBe("pending");
	});
});

describe("applyStatus", () => {
	it("expires a pending intent and fails its boost payment", async () => {
		const payload = world();
		const result = await applyStatus(payload, "pi-1", {
			status: "expired",
			source: "reconcile",
		});
		expect(result.outcome).toBe("applied");
		expect(boostOf(payload).status).toBe("failed");
	});
});

describe("boost activation", () => {
	it("extends a boost that is still running", async () => {
		const payload = world({}, { boostedUntil: at(3 * DAY) });
		await settlePayment(payload, { ...paid, source: "webhook" });
		expect(listingOf(payload).boostedUntil).toBe(at(17 * DAY));
	});

	it("starts from now when the previous boost is over", () => {
		expect(computeBoostedUntil(at(-DAY), NOW, 7)).toBe(at(7 * DAY));
		expect(computeBoostedUntil(null, NOW, 7)).toBe(at(7 * DAY));
		expect(computeBoostedUntil("not a date", NOW, 7)).toBe(at(7 * DAY));
	});

	it("does nothing for a completed boost payment", async () => {
		const payload = world();
		expect((await activateBoostPayment(payload, "bp-1")).activated).toBe(true);
		expect((await activateBoostPayment(payload, "bp-1")).activated).toBe(false);
		expect(listingOf(payload).boostedUntil).toBe(at(14 * DAY));
	});
});
```

- [ ] **Step 4: Run both and watch them fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/payment-transitions.int.spec.ts tests/int/payment-settlement.int.spec.ts`
Expected: FAIL, cannot resolve `../../src/lib/paymentTransitions` and `../../src/services/boostActivation`.

- [ ] **Step 5: Write the small libraries**

```ts
// packages/api/src/lib/relationId.ts
export function relationId(value: unknown): string | null {
	if (typeof value === "string" && value) return value;
	if (typeof value === "number") return String(value);
	if (value && typeof value === "object" && "id" in value) {
		const { id } = value as { id?: unknown };
		if (typeof id === "string" && id) return id;
		if (typeof id === "number") return String(id);
	}
	return null;
}
```

```ts
// packages/api/src/lib/transactions.ts
import type { Payload, PayloadRequest } from "payload";

export type TxReq = Partial<PayloadRequest>;

/**
 * Runs `fn` in one Payload transaction; every local API call inside must pass
 * the `req` it receives. Without `replicaSet` in DATABASE_URI the adapter
 * returns no transaction id and the writes run unwrapped.
 */
export async function withTransaction<T>(
	payload: Payload,
	fn: (req: TxReq) => Promise<T>,
): Promise<T> {
	const transactionID = (await payload.db?.beginTransaction?.()) ?? undefined;
	const req: TxReq = { payload, transactionID };
	try {
		const result = await fn(req);
		if (transactionID) await payload.db.commitTransaction(transactionID);
		return result;
	} catch (error) {
		if (transactionID) await payload.db.rollbackTransaction(transactionID);
		throw error;
	}
}
```

```ts
// packages/api/src/lib/paymentTransitions.ts
import type { PaymentIntent } from "../payload-types";

export type IntentStatus = PaymentIntent["status"];

const ALLOWED: Record<IntentStatus, readonly IntentStatus[]> = {
	created: ["pending", "failed", "cancelled"],
	pending: ["succeeded", "failed", "cancelled", "expired"],
	succeeded: [],
	failed: [],
	cancelled: [],
	expired: [],
};

export function canTransition(from: IntentStatus, to: IntentStatus): boolean {
	return ALLOWED[from].includes(to);
}

export function isTerminal(status: IntentStatus): boolean {
	return ALLOWED[status].length === 0;
}

/** The statuses to record to reach `to`; empty when the report must not move the intent. */
export function transitionPath(
	from: IntentStatus,
	to: IntentStatus,
): IntentStatus[] {
	if (from === to) return [];
	if (canTransition(from, to)) return [to];
	if (from === "created" && canTransition("pending", to)) return ["pending", to];
	return [];
}
```

- [ ] **Step 6: Write boost activation and the purpose handlers**

```ts
// packages/api/src/services/boostActivation.ts
import type { Payload } from "payload";
import { relationId } from "../lib/relationId";
import type { TxReq } from "../lib/transactions";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A second purchase extends a running boost instead of resetting it. */
export function computeBoostedUntil(
	current: string | null | undefined,
	now: Date,
	days: number,
): string {
	const currentTime = current ? new Date(current).getTime() : Number.NaN;
	const base =
		Number.isFinite(currentTime) && currentTime > now.getTime()
			? currentTime
			: now.getTime();
	return new Date(base + days * DAY_MS).toISOString();
}

export async function activateBoostPayment(
	payload: Payload,
	boostPaymentId: string,
	req?: TxReq,
	now: Date = new Date(),
): Promise<{ activated: boolean; boostedUntil: string | null }> {
	const boost = await payload.findByID({
		collection: "boost-payments",
		id: boostPaymentId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (boost.status === "completed") return { activated: false, boostedUntil: null };

	const listingId = relationId(boost.listing);
	if (!listingId) throw new Error(`Boost payment ${boostPaymentId} has no listing`);

	const listing = await payload.findByID({
		collection: "listings",
		id: listingId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const days = Number.parseInt(String(boost.duration), 10);
	const boostedUntil = computeBoostedUntil(listing.boostedUntil, now, days);

	await payload.update({
		collection: "listings",
		id: listingId,
		data: { boostedUntil },
		depth: 0,
		overrideAccess: true,
		req,
	});
	await payload.update({
		collection: "boost-payments",
		id: boostPaymentId,
		data: { status: "completed" },
		depth: 0,
		overrideAccess: true,
		req,
	});
	return { activated: true, boostedUntil };
}

/** Only a pending purchase can fail; a completed one is never downgraded. */
export async function failBoostPayment(
	payload: Payload,
	boostPaymentId: string,
	req?: TxReq,
): Promise<void> {
	const boost = await payload.findByID({
		collection: "boost-payments",
		id: boostPaymentId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (boost.status !== "pending") return;
	await payload.update({
		collection: "boost-payments",
		id: boostPaymentId,
		data: { status: "failed" },
		depth: 0,
		overrideAccess: true,
		req,
	});
}
```

```ts
// packages/api/src/services/paymentPurposes.ts
import type { Payload } from "payload";
import type { TxReq } from "../lib/transactions";
import type { PaymentIntent } from "../payload-types";
import { activateBoostPayment, failBoostPayment } from "./boostActivation";

export interface PurposeHandler {
	onSucceeded(payload: Payload, intent: PaymentIntent, req: TxReq): Promise<void>;
	onFailed(payload: Payload, intent: PaymentIntent, req: TxReq): Promise<void>;
}

export const PURPOSE_HANDLERS: Record<PaymentIntent["purpose"], PurposeHandler> = {
	boost: {
		onSucceeded: async (payload, intent, req) => {
			await activateBoostPayment(payload, intent.targetId, req);
		},
		onFailed: async (payload, intent, req) => {
			await failBoostPayment(payload, intent.targetId, req);
		},
	},
};
```

- [ ] **Step 7: Write the payments service**

```ts
// packages/api/src/services/payments.ts
import type { Payload } from "payload";
import { ERROR_CODES } from "../lib/errors";
import type { NormalizedPayment, ProviderName } from "../lib/payments/types";
import { type IntentStatus, transitionPath } from "../lib/paymentTransitions";
import { type TxReq, withTransaction } from "../lib/transactions";
import type { PaymentIntent } from "../payload-types";
import { PURPOSE_HANDLERS } from "./paymentPurposes";

export const INTENT_TTL_MS = 24 * 60 * 60 * 1000;

export type IntentDoc = PaymentIntent;
type HistoryEntry = NonNullable<PaymentIntent["statusHistory"]>[number];
export type StatusSource = HistoryEntry["source"];

export interface CreateIntentInput {
	purpose: PaymentIntent["purpose"];
	targetType: PaymentIntent["targetType"];
	targetId: string;
	customerId: string;
	amount: number;
	currency: string;
	provider: ProviderName;
	idempotencyKey: string;
	now?: Date;
}

export interface StatusReport {
	status: IntentStatus;
	source: StatusSource;
	at?: Date;
	amount?: number | null;
	currency?: string | null;
	note?: string;
}

export interface SettleInput extends NormalizedPayment {
	source: StatusSource;
	at?: Date;
}

export type AppliedOutcome = {
	outcome: "applied" | "unchanged" | "ignored" | "amount_mismatch";
	intent: IntentDoc;
};
export type SettleOutcome = { outcome: "unknown_reference" } | AppliedOutcome;

const COLLECTION = "payment-intents" as const;

async function loadIntent(
	payload: Payload,
	id: string,
	req?: TxReq,
): Promise<IntentDoc> {
	return payload.findByID({
		collection: COLLECTION,
		id,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

async function saveIntent(
	payload: Payload,
	id: string,
	data: Partial<PaymentIntent>,
	req?: TxReq,
): Promise<IntentDoc> {
	return payload.update({
		collection: COLLECTION,
		id,
		data,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

async function findOne(
	payload: Payload,
	field: "reference" | "providerReference" | "idempotencyKey",
	value: string,
): Promise<IntentDoc | null> {
	const result = await payload.find({
		collection: COLLECTION,
		where: { [field]: { equals: value } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	return result.docs[0] ?? null;
}

export async function createPaymentIntent(
	payload: Payload,
	input: CreateIntentInput,
	req?: TxReq,
): Promise<IntentDoc> {
	if (!Number.isInteger(input.amount) || input.amount <= 0) {
		throw new Error("Payment amount must be a positive integer");
	}
	const now = input.now ?? new Date();
	const created = await payload.create({
		collection: COLLECTION,
		depth: 0,
		overrideAccess: true,
		req,
		data: {
			purpose: input.purpose,
			targetType: input.targetType,
			targetId: input.targetId,
			customer: input.customerId,
			amount: input.amount,
			currency: input.currency,
			provider: input.provider,
			idempotencyKey: input.idempotencyKey,
			status: "created",
			statusHistory: [{ status: "created", source: "system", at: now.toISOString() }],
			expiresAt: new Date(now.getTime() + INTENT_TTL_MS).toISOString(),
		},
	});
	// The reference embeds the id, so it can only be written once the id exists.
	return saveIntent(payload, String(created.id), { reference: `PI-${created.id}` }, req);
}

export function findIntentByIdempotencyKey(
	payload: Payload,
	key: string,
): Promise<IntentDoc | null> {
	return findOne(payload, "idempotencyKey", key);
}

/** Resolves `PI-{id}`, legacy `BOOST-{id}`, then the provider's own id. */
export async function findIntentByReference(
	payload: Payload,
	{ reference, providerReference }: { reference?: string | null; providerReference?: string | null },
): Promise<IntentDoc | null> {
	if (reference?.startsWith("PI-")) {
		const byId = await loadIntent(payload, reference.slice(3)).catch(() => null);
		if (byId) return byId;
	}
	if (reference) {
		const byReference = await findOne(payload, "reference", reference);
		if (byReference) return byReference;
	}
	if (providerReference) return findOne(payload, "providerReference", providerReference);
	return null;
}

export function markIntentPending(
	payload: Payload,
	intentId: string,
	details: { providerReference: string; checkoutUrl: string | null; now?: Date },
): Promise<IntentDoc> {
	return withTransaction(payload, async (req) => {
		const intent = await loadIntent(payload, intentId, req);
		const data: Partial<PaymentIntent> = {
			providerReference: details.providerReference,
			checkoutUrl: details.checkoutUrl,
		};
		// A fast webhook may already have settled the intent; keep its status.
		if (transitionPath(intent.status, "pending").length > 0) {
			data.status = "pending";
			data.statusHistory = [
				...(intent.statusHistory ?? []),
				{
					status: "pending",
					source: "system",
					at: (details.now ?? new Date()).toISOString(),
				},
			];
		}
		return saveIntent(payload, intentId, data, req);
	});
}

export function applyStatus(
	payload: Payload,
	intentId: string,
	report: StatusReport,
): Promise<AppliedOutcome> {
	return withTransaction(payload, async (req) => {
		const intent = await loadIntent(payload, intentId, req);
		const at = (report.at ?? new Date()).toISOString();
		const history: HistoryEntry[] = [...(intent.statusHistory ?? [])];
		const target = report.status;
		const handler = PURPOSE_HANDLERS[intent.purpose];

		if (target === "succeeded" && intent.status !== "succeeded") {
			const currency = report.currency?.toUpperCase() ?? null;
			if (report.amount !== intent.amount || currency !== intent.currency) {
				payload.logger.error({
					msg: "[payments] provider amount does not match the intent",
					code: ERROR_CODES.paymentAmountMismatch,
					intentId,
					expected: { amount: intent.amount, currency: intent.currency },
					reported: { amount: report.amount ?? null, currency },
				});
				history.push({
					status: "succeeded",
					source: report.source,
					at,
					note: ERROR_CODES.paymentAmountMismatch,
				});
				const updated = await saveIntent(
					payload,
					intentId,
					{
						statusHistory: history,
						settledAmount: report.amount ?? null,
						settledCurrency: currency,
					},
					req,
				);
				return { outcome: "amount_mismatch", intent: updated };
			}
		}

		if (intent.status === target) {
			if (target === "succeeded") await handler.onSucceeded(payload, intent, req);
			return { outcome: "unchanged", intent };
		}

		const path = transitionPath(intent.status, target);
		if (path.length === 0) {
			if (target === "succeeded") {
				payload.logger.error({
					msg: "[payments] provider reports a success on a closed intent",
					intentId,
					status: intent.status,
				});
			}
			history.push({
				status: target,
				source: report.source,
				at,
				note: `ignored: intent is ${intent.status}`,
			});
			const updated = await saveIntent(payload, intentId, { statusHistory: history }, req);
			return { outcome: "ignored", intent: updated };
		}

		for (const status of path) {
			history.push({ status, source: report.source, at, note: report.note ?? null });
		}
		const data: Partial<PaymentIntent> = { status: target, statusHistory: history };
		if (target === "succeeded") {
			data.settledAmount = report.amount ?? null;
			data.settledCurrency = report.currency?.toUpperCase() ?? null;
		}
		const updated = await saveIntent(payload, intentId, data, req);

		if (target === "succeeded") await handler.onSucceeded(payload, updated, req);
		else if (target !== "pending") await handler.onFailed(payload, updated, req);
		return { outcome: "applied", intent: updated };
	});
}

export async function settlePayment(
	payload: Payload,
	input: SettleInput,
): Promise<SettleOutcome> {
	const intent = await findIntentByReference(payload, {
		reference: input.reference,
		providerReference: input.providerTransactionId,
	});
	if (!intent) {
		payload.logger.warn({
			msg: "[payments] report for an unknown reference",
			reference: input.reference,
			providerTransactionId: input.providerTransactionId,
			source: input.source,
		});
		return { outcome: "unknown_reference" };
	}
	return applyStatus(payload, String(intent.id), {
		status: input.status,
		source: input.source,
		at: input.at,
		amount: input.amount,
		currency: input.currency,
	});
}
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/payment-transitions.int.spec.ts tests/int/payment-settlement.int.spec.ts`
Expected: PASS (transitions: 40 tests; settlement: 17 tests).

- [ ] **Step 9: Typecheck, lint, commit**

Run: `bun run check-types` in `packages/api` — Expected: no errors.
Run from root: `bunx biome check --write packages/api/src/lib/relationId.ts packages/api/src/lib/transactions.ts packages/api/src/lib/paymentTransitions.ts packages/api/src/services/boostActivation.ts packages/api/src/services/paymentPurposes.ts packages/api/src/services/payments.ts packages/api/tests/int/helpers packages/api/tests/int/payment-transitions.int.spec.ts packages/api/tests/int/payment-settlement.int.spec.ts`

```bash
git add packages/api/src/lib/relationId.ts packages/api/src/lib/transactions.ts packages/api/src/lib/paymentTransitions.ts packages/api/src/services/boostActivation.ts packages/api/src/services/paymentPurposes.ts packages/api/src/services/payments.ts packages/api/tests/int/helpers packages/api/tests/int/payment-transitions.int.spec.ts packages/api/tests/int/payment-settlement.int.spec.ts
git commit -m "feat(api): settle payment intents through one transition table"
```

---

### Task 5: Payload migrations and the legacy boost payment backfill

**Files:**
- Create: `packages/api/src/services/paymentBackfill.ts`
- Create: `packages/api/src/migrations/20260915_000000_p0_payment_intents.ts`
- Create: `packages/api/src/migrations/index.ts`
- Modify: `packages/api/src/payload.config.ts`
- Test: `packages/api/tests/int/payment-backfill.int.spec.ts` (create)

**Interfaces:**
- Consumes: `INTENT_TTL_MS` (Task 4), `relationId`, `TxReq`.
- Produces: `legacyIntentStatus(boostStatus, createdAt, now): { status: IntentStatus; note: string | null }`; `backfillBoostPaymentIntents(payload, { now?, req? }): Promise<{ created: number; linked: number }>`; `migrations` array exported from `src/migrations/index.ts` and passed to the adapter as `prodMigrations`, so migrations run when the API starts with `NODE_ENV=production`.

Decisions: a legacy pending payment older than 24 hours becomes an `expired` intent and its boost payment is marked `failed`, so the boost payment keeps mirroring its intent. The idempotency key of a migrated intent is `legacy:{boostPaymentId}`. An intent already created for `BOOST-{id}` by an interrupted run is linked, not duplicated.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/tests/int/payment-backfill.int.spec.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { backfillBoostPaymentIntents } from "../../src/services/paymentBackfill";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T10:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const legacy = (id: string, status: string, createdAt = hoursAgo(48)) => ({
	id,
	listing: "l-1",
	user: "u-1",
	amount: 900,
	duration: "14",
	status,
	paymentProvider: "notchpay",
	paymentReference: `trx.${id}`,
	paymentUrl: `https://pay.test/${id}`,
	createdAt,
	updatedAt: createdAt,
});

function fixture() {
	return fakePayload({
		"boost-payments": [
			legacy("bp-done", "completed"),
			legacy("bp-failed", "failed"),
			legacy("bp-refunded", "refunded"),
			legacy("bp-stale", "pending", hoursAgo(30)),
			legacy("bp-fresh", "pending", hoursAgo(2)),
			{ ...legacy("bp-linked", "completed"), paymentIntent: "pi-existing" },
			legacy("bp-half", "completed"),
		],
		"payment-intents": [
			{ id: "pi-existing", reference: "PI-pi-existing", status: "succeeded" },
			{ id: "pi-half", reference: "BOOST-bp-half", status: "succeeded" },
		],
	});
}

const intentFor = (payload: ReturnType<typeof fixture>, boostId: string) =>
	payload.store["payment-intents"].find((i) => i.reference === `BOOST-${boostId}`);

describe("backfillBoostPaymentIntents", () => {
	it("creates one intent per unlinked boost payment with the mapped status", async () => {
		const payload = fixture();
		const result = await backfillBoostPaymentIntents(payload, { now: NOW });

		expect(result).toEqual({ created: 5, linked: 6 });
		expect(intentFor(payload, "bp-done")).toMatchObject({
			purpose: "boost",
			targetType: "boost-payment",
			targetId: "bp-done",
			customer: "u-1",
			amount: 900,
			currency: "XAF",
			provider: "notchpay",
			providerReference: "trx.bp-done",
			status: "succeeded",
			settledAmount: 900,
			idempotencyKey: "legacy:bp-done",
		});
		expect(intentFor(payload, "bp-failed")?.status).toBe("failed");
		expect(intentFor(payload, "bp-refunded")?.status).toBe("succeeded");
		expect(intentFor(payload, "bp-refunded")?.statusHistory[0].note).toContain(
			"refunded",
		);
		expect(intentFor(payload, "bp-stale")?.status).toBe("expired");
		expect(intentFor(payload, "bp-fresh")?.status).toBe("pending");
	});

	it("marks a stale pending boost payment failed to mirror its expired intent", async () => {
		const payload = fixture();
		await backfillBoostPaymentIntents(payload, { now: NOW });
		const stale = payload.store["boost-payments"].find((b) => b.id === "bp-stale");
		expect(stale?.status).toBe("failed");
	});

	it("links an intent left by an interrupted run instead of creating another", async () => {
		const payload = fixture();
		await backfillBoostPaymentIntents(payload, { now: NOW });
		const half = payload.store["boost-payments"].find((b) => b.id === "bp-half");
		expect(half?.paymentIntent).toBe("pi-half");
		expect(
			payload.store["payment-intents"].filter((i) => i.reference === "BOOST-bp-half"),
		).toHaveLength(1);
	});

	it("changes nothing on a second run", async () => {
		const payload = fixture();
		await backfillBoostPaymentIntents(payload, { now: NOW });
		const snapshot = structuredClone(payload.store);

		const second = await backfillBoostPaymentIntents(payload, { now: NOW });

		expect(second).toEqual({ created: 0, linked: 0 });
		expect(payload.store).toEqual(snapshot);
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/payment-backfill.int.spec.ts`
Expected: FAIL, cannot resolve `../../src/services/paymentBackfill`.

- [ ] **Step 3: Write the backfill**

```ts
// packages/api/src/services/paymentBackfill.ts
import type { Payload } from "payload";
import type { IntentStatus } from "../lib/paymentTransitions";
import { relationId } from "../lib/relationId";
import type { TxReq } from "../lib/transactions";
import { INTENT_TTL_MS } from "./payments";

export function legacyIntentStatus(
	boostStatus: string | null | undefined,
	createdAt: string | null | undefined,
	now: Date,
): { status: IntentStatus; note: string | null } {
	if (boostStatus === "completed") return { status: "succeeded", note: null };
	if (boostStatus === "failed") return { status: "failed", note: null };
	if (boostStatus === "refunded") {
		return { status: "succeeded", note: "legacy: boost payment was marked refunded" };
	}
	const age = createdAt ? now.getTime() - new Date(createdAt).getTime() : Number.POSITIVE_INFINITY;
	return age > INTENT_TTL_MS
		? { status: "expired", note: "legacy: pending for more than 24 hours" }
		: { status: "pending", note: null };
}

/**
 * Gives every boost payment created before P0 its payment intent. Idempotent:
 * linked records are skipped and an intent already created for `BOOST-{id}` is
 * reused, so an interrupted run can simply be started again.
 */
export async function backfillBoostPaymentIntents(
	payload: Payload,
	{ now = new Date(), req }: { now?: Date; req?: TxReq } = {},
): Promise<{ created: number; linked: number }> {
	const result = { created: 0, linked: 0 };

	// Always page 1: every processed record leaves the "unlinked" set.
	for (;;) {
		const batch = await payload.find({
			collection: "boost-payments",
			where: { paymentIntent: { exists: false } },
			depth: 0,
			limit: 100,
			overrideAccess: true,
			req,
		});
		if (batch.docs.length === 0) break;

		for (const boost of batch.docs) {
			const boostId = String(boost.id);
			const reference = `BOOST-${boostId}`;
			const existing = await payload.find({
				collection: "payment-intents",
				where: { reference: { equals: reference } },
				limit: 1,
				depth: 0,
				overrideAccess: true,
				req,
			});

			let intentId = existing.docs[0] ? String(existing.docs[0].id) : null;
			const { status, note } = legacyIntentStatus(boost.status, boost.createdAt, now);

			if (!intentId) {
				const createdAt = boost.createdAt ?? now.toISOString();
				const intent = await payload.create({
					collection: "payment-intents",
					depth: 0,
					overrideAccess: true,
					req,
					data: {
						purpose: "boost",
						targetType: "boost-payment",
						targetId: boostId,
						customer: relationId(boost.user) ?? undefined,
						amount: boost.amount,
						currency: "XAF",
						provider: boost.paymentProvider,
						providerReference: boost.paymentReference ?? undefined,
						reference,
						status,
						statusHistory: [
							{
								status,
								source: "system",
								at: boost.updatedAt ?? createdAt,
								note: note ?? "legacy: migrated from boost-payments",
							},
						],
						idempotencyKey: `legacy:${boostId}`,
						checkoutUrl: boost.paymentUrl ?? undefined,
						expiresAt: new Date(new Date(createdAt).getTime() + INTENT_TTL_MS).toISOString(),
						...(status === "succeeded"
							? { settledAmount: boost.amount, settledCurrency: "XAF" }
							: {}),
					},
				});
				intentId = String(intent.id);
				result.created += 1;
			}

			await payload.update({
				collection: "boost-payments",
				id: boostId,
				depth: 0,
				overrideAccess: true,
				req,
				data: {
					paymentIntent: intentId,
					...(status === "expired" && boost.status === "pending"
						? { status: "failed" as const }
						: {}),
				},
			});
			result.linked += 1;
		}
	}

	return result;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bunx vitest run --config ./vitest.config.mts tests/int/payment-backfill.int.spec.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Add the migration and wire migrations into the adapter**

```ts
// packages/api/src/migrations/20260915_000000_p0_payment_intents.ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-mongodb";
import { backfillBoostPaymentIntents } from "../services/paymentBackfill";

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
	const result = await backfillBoostPaymentIntents(payload, { req });
	payload.logger.info({ msg: "[migration] boost payment intents backfilled", ...result });
}

export async function down(_args: MigrateDownArgs): Promise<void> {
	// Intents are payment records and are kept; the backfill is idempotent, so there is nothing to undo.
}
```

```ts
// packages/api/src/migrations/index.ts
import * as migration_20260915_000000_p0_payment_intents from "./20260915_000000_p0_payment_intents";

export const migrations = [
	{
		up: migration_20260915_000000_p0_payment_intents.up,
		down: migration_20260915_000000_p0_payment_intents.down,
		name: "20260915_000000_p0_payment_intents",
	},
];
```

(Same shape as `payload migrate:create` writes; later migrations are appended to this array.)

In `packages/api/src/payload.config.ts`, add `import { migrations } from "./migrations";` and replace the adapter:

```ts
	db: mongooseAdapter({
		url: process.env.DATABASE_URI || "",
		migrationDir: path.resolve(dirname, "migrations"),
		// Applied at startup when NODE_ENV=production, before the API serves traffic.
		prodMigrations: migrations,
	}),
```

- [ ] **Step 6: Run the migration twice against a scratch database (manual verification)**

```bash
docker run -d --rm --name bns-p0-mongo -p 27027:27017 mongo:7
cd packages/api
export DATABASE_URI=mongodb://127.0.0.1:27027/bns-p0 PAYLOAD_SECRET=dev
bun run payload migrate
bun run payload migrate
bun run payload migrate:status
docker stop bns-p0-mongo
```

Expected: the first `migrate` logs `boost payment intents backfilled` with `created: 0, linked: 0` on the empty database; the second reports nothing to run; `migrate:status` lists `20260915_000000_p0_payment_intents` as ran. If a copy of staging data is available, restore it into this container first (`mongorestore --archive --gzip`) and check that `created` equals the number of boost payments and that a second `migrate` changes nothing.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `bun run check-types` in `packages/api` — Expected: no errors.
Run from root: `bunx biome check --write packages/api/src/services/paymentBackfill.ts packages/api/src/migrations packages/api/src/payload.config.ts packages/api/tests/int/payment-backfill.int.spec.ts`

```bash
git add packages/api/src/services/paymentBackfill.ts packages/api/src/migrations packages/api/src/payload.config.ts packages/api/tests/int/payment-backfill.int.spec.ts
git commit -m "feat(api): run Payload migrations and backfill intents for existing boost payments"
```

---

### Task 6: Boost pricing and the hardened purchase route

**Files:**
- Create: `packages/api/src/lib/boostPricing.ts`
- Create: `packages/api/src/services/boostPurchase.ts`
- Modify: `packages/api/src/app/(frontend)/api/public/boost/route.ts`
- Modify: `packages/api/src/app/(frontend)/api/public/config/route.ts`
- Test: `packages/api/tests/int/boost-purchase.int.spec.ts` (create)
- Test: `packages/api/tests/int/boost-route.int.spec.ts` (create)

**Interfaces:**
- Consumes: `createPaymentIntent`, `findIntentByIdempotencyKey`, `markIntentPending`, `applyStatus` (Task 4); `withTransaction`, `relationId`; `getProvider`, `PaymentProvider`, `ProviderName` (Task 2); error codes (Task 1).
- Produces:
  - `interface BoostPrice { days: number; amount: number; currency: "XAF" }`; `BOOST_PRICING: readonly BoostPrice[]`; `findBoostPrice(duration: unknown): BoostPrice | null`
  - `class BoostPurchaseError extends Error { code: ErrorCode; status: number }`
  - `startBoostPurchase(payload, input: StartBoostPurchaseInput, deps?: { getProvider }): Promise<{ paymentId: string; intentId: string; provider: ProviderName; checkoutUrl: string | null; clientSecret: string | null }>`
  - `buildCallbackUrl(serverUrl, listingId, appReturnUrl, providerName): string`
  - `GET /api/public/config` gains `boostPricing`.
  - `POST /api/public/boost` accepts an optional `Idempotency-Key` header.

Idempotency: a client key is scoped to the caller (`boost:{userId}:{key}`). A replay of a pending intent returns the same checkout; a replay of any other intent is refused with 409 `generic.validation`, so clients send a new key per attempt. Without a header the server derives a random key, which records the attempt but does not deduplicate.

- [ ] **Step 1: Write the failing service test**

```ts
// packages/api/tests/int/boost-purchase.int.spec.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BOOST_PRICING, findBoostPrice } from "../../src/lib/boostPricing";
import {
	BoostPurchaseError,
	startBoostPurchase,
} from "../../src/services/boostPurchase";
import { fakePayload } from "./helpers/fakePayload";

function provider() {
	return {
		id: "notchpay" as const,
		createPayment: vi.fn(async () => ({
			checkoutUrl: "https://pay.test/checkout/1",
			providerReference: "trx.1",
		})),
		verifyWebhook: vi.fn(),
		parseWebhookEvent: vi.fn(),
		verifyPayment: vi.fn(),
	};
}

function world(listing: Record<string, unknown> = {}) {
	return fakePayload(
		{
			listings: [
				{ id: "l-1", title: "Bike", seller: "u-1", status: "published", ...listing },
			],
		},
		{ uniques: { "payment-intents": [["idempotencyKey"]] } },
	);
}

const input = {
	userId: "u-1",
	email: "seller@example.com",
	listingId: "l-1",
	duration: "14",
	providerName: "notchpay",
	serverUrl: "https://api.test",
};

describe("boost pricing", () => {
	it("keeps the published prices", () => {
		expect(BOOST_PRICING).toEqual([
			{ days: 7, amount: 500, currency: "XAF" },
			{ days: 14, amount: 900, currency: "XAF" },
			{ days: 30, amount: 1500, currency: "XAF" },
		]);
	});

	it("accepts a duration as string or number and nothing else", () => {
		expect(findBoostPrice("14")?.amount).toBe(900);
		expect(findBoostPrice(30)?.amount).toBe(1500);
		expect(findBoostPrice("15")).toBeNull();
		expect(findBoostPrice("7 days")).toBeNull();
	});
});

describe("startBoostPurchase", () => {
	it("creates the boost payment and its intent, then stores the checkout", async () => {
		const payload = world();
		const p = provider();
		const result = await startBoostPurchase(payload, input, { getProvider: () => p });

		const boost = payload.store["boost-payments"][0];
		const intent = payload.store["payment-intents"][0];
		expect(boost).toMatchObject({
			listing: "l-1",
			user: "u-1",
			amount: 900,
			duration: "14",
			status: "pending",
			paymentProvider: "notchpay",
			paymentIntent: intent.id,
			paymentReference: "trx.1",
			paymentUrl: "https://pay.test/checkout/1",
		});
		expect(intent).toMatchObject({
			purpose: "boost",
			targetId: boost.id,
			customer: "u-1",
			amount: 900,
			currency: "XAF",
			reference: `PI-${intent.id}`,
			status: "pending",
			providerReference: "trx.1",
			checkoutUrl: "https://pay.test/checkout/1",
		});
		expect(p.createPayment).toHaveBeenCalledWith(
			expect.objectContaining({ reference: `PI-${intent.id}`, amount: 900, currency: "XAF" }),
		);
		expect(result).toEqual({
			paymentId: boost.id,
			intentId: intent.id,
			provider: "notchpay",
			checkoutUrl: "https://pay.test/checkout/1",
			clientSecret: null,
		});
	});

	it.each([
		["another seller's listing", { seller: "u-2" }, "boost.notOwner", 403],
		["an unpublished listing", { status: "draft" }, "boost.listingNotPublished", 409],
	])("refuses %s and writes nothing", async (_label, listing, code, status) => {
		const payload = world(listing);
		await expect(
			startBoostPurchase(payload, input, { getProvider: provider }),
		).rejects.toMatchObject({ code, status });
		expect(payload.store["boost-payments"] ?? []).toHaveLength(0);
		expect(payload.store["payment-intents"] ?? []).toHaveLength(0);
	});

	it("refuses a duration that is not on the price list", async () => {
		await expect(
			startBoostPurchase(world(), { ...input, duration: "15" }, { getProvider: provider }),
		).rejects.toMatchObject({ code: "boost.invalidDuration", status: 400 });
	});

	it("answers 404 for a missing listing", async () => {
		await expect(
			startBoostPurchase(world(), { ...input, listingId: "nope" }, { getProvider: provider }),
		).rejects.toMatchObject({ code: "listing.notFound", status: 404 });
	});

	it("answers 503 when the provider is not configured", async () => {
		await expect(
			startBoostPurchase(world(), input, {
				getProvider: () => {
					throw new Error("Stripe non configuré");
				},
			}),
		).rejects.toMatchObject({ code: "payment.providerUnavailable", status: 503 });
	});

	it("fails the intent and the boost payment when the provider refuses", async () => {
		const payload = world();
		const p = provider();
		p.createPayment.mockRejectedValueOnce(new Error("NotchPay (500)"));

		await expect(
			startBoostPurchase(payload, input, { getProvider: () => p }),
		).rejects.toBeInstanceOf(BoostPurchaseError);
		expect(payload.store["payment-intents"][0].status).toBe("failed");
		expect(payload.store["boost-payments"][0].status).toBe("failed");
	});

	it("replays a pending purchase for the same idempotency key", async () => {
		const payload = world();
		const p = provider();
		const first = await startBoostPurchase(
			payload,
			{ ...input, idempotencyKey: "abc" },
			{ getProvider: () => p },
		);
		const second = await startBoostPurchase(
			payload,
			{ ...input, idempotencyKey: "abc" },
			{ getProvider: () => p },
		);

		expect(second).toEqual(first);
		expect(p.createPayment).toHaveBeenCalledTimes(1);
		expect(payload.store["payment-intents"][0].idempotencyKey).toBe("boost:u-1:abc");
	});
});
```

- [ ] **Step 2: Write the failing route test**

```ts
// packages/api/tests/int/boost-route.int.spec.ts
// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.fn();
const createPaymentMock = vi.fn();

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({ getPayload: getPayloadMock }));
vi.mock("../../src/lib/payments", () => ({
	getProvider: () => ({ id: "notchpay", createPayment: createPaymentMock }),
}));

let POST: (request: Request) => Promise<Response>;

beforeAll(async () => {
	({ POST } = await import("../../src/app/(frontend)/api/public/boost/route"));
}, 30_000);

function call(body: Record<string, unknown>) {
	return POST(
		new Request("http://localhost:3000/api/public/boost", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/public/boost", () => {
	let payload: ReturnType<typeof fakePayload>;

	beforeEach(() => {
		payload = fakePayload({
			listings: [
				{ id: "l-mine", title: "A", seller: "u-1", status: "published" },
				{ id: "l-other", title: "B", seller: "u-2", status: "published" },
				{ id: "l-draft", title: "C", seller: "u-1", status: "draft" },
			],
		});
		payload.auth.mockResolvedValue({ user: { id: "u-1", email: "s@example.com" } });
		getPayloadMock.mockResolvedValue(payload);
		createPaymentMock.mockResolvedValue({
			checkoutUrl: "https://pay.test/c",
			providerReference: "trx.9",
		});
	});

	it("answers 401 to a guest", async () => {
		payload.auth.mockResolvedValue({ user: null });
		expect((await call({ listingId: "l-mine", duration: "7" })).status).toBe(401);
	});

	it("answers 403 boost.notOwner for someone else's listing", async () => {
		const response = await call({ listingId: "l-other", duration: "7" });
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "boost.notOwner" });
	});

	it("answers 409 boost.listingNotPublished for an unpublished listing", async () => {
		const response = await call({ listingId: "l-draft", duration: "7" });
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ code: "boost.listingNotPublished" });
	});

	it("returns the checkout for the owner", async () => {
		const response = await call({ listingId: "l-mine", duration: "7" });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			provider: "notchpay",
			checkoutUrl: "https://pay.test/c",
		});
	});
});
```

- [ ] **Step 3: Run both and watch them fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/boost-purchase.int.spec.ts tests/int/boost-route.int.spec.ts`
Expected: FAIL, cannot resolve `../../src/lib/boostPricing`; the route test fails because the current route never checks ownership (200 instead of 403).

- [ ] **Step 4: Write the pricing table**

```ts
// packages/api/src/lib/boostPricing.ts
export interface BoostPrice {
	days: number;
	amount: number;
	currency: "XAF";
}

/** The only boost price list; clients read it from GET /api/public/config. */
export const BOOST_PRICING: readonly BoostPrice[] = [
	{ days: 7, amount: 500, currency: "XAF" },
	{ days: 14, amount: 900, currency: "XAF" },
	{ days: 30, amount: 1500, currency: "XAF" },
];

export function findBoostPrice(duration: unknown): BoostPrice | null {
	const days =
		typeof duration === "number"
			? duration
			: typeof duration === "string" && /^\d+$/.test(duration)
				? Number(duration)
				: Number.NaN;
	return BOOST_PRICING.find((price) => price.days === days) ?? null;
}
```

- [ ] **Step 5: Write the purchase service**

```ts
// packages/api/src/services/boostPurchase.ts
import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import { findBoostPrice } from "../lib/boostPricing";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { getProvider } from "../lib/payments";
import type {
	CreatePaymentResult,
	PaymentProvider,
	ProviderName,
} from "../lib/payments/types";
import { relationId } from "../lib/relationId";
import { withTransaction } from "../lib/transactions";
import {
	applyStatus,
	createPaymentIntent,
	findIntentByIdempotencyKey,
	markIntentPending,
} from "./payments";

export class BoostPurchaseError extends Error {
	code: ErrorCode;
	status: number;

	constructor(code: ErrorCode, status: number) {
		super(code);
		this.name = "BoostPurchaseError";
		this.code = code;
		this.status = status;
	}
}

export interface StartBoostPurchaseInput {
	userId: string;
	email: string;
	listingId: unknown;
	duration: unknown;
	providerName: unknown;
	returnUrl?: string;
	idempotencyKey?: string | null;
	serverUrl: string;
	now?: Date;
}

export interface StartBoostPurchaseResult {
	paymentId: string;
	intentId: string;
	provider: ProviderName;
	checkoutUrl: string | null;
	clientSecret: string | null;
}

export function buildCallbackUrl(
	serverUrl: string,
	listingId: string,
	appReturnUrl: string | undefined,
	providerName: ProviderName,
): string {
	const url = new URL("/api/public/boost/callback", serverUrl);
	url.searchParams.set("listingId", listingId);
	url.searchParams.set("provider", providerName);
	if (appReturnUrl) url.searchParams.set("appReturnUrl", appReturnUrl);
	// NotchPay appends &reference=… (its id) and &trxref=… (ours) on redirect.
	return url.toString();
}

export async function startBoostPurchase(
	payload: Payload,
	input: StartBoostPurchaseInput,
	deps: { getProvider: (name: ProviderName) => PaymentProvider } = { getProvider },
): Promise<StartBoostPurchaseResult> {
	if (typeof input.listingId !== "string" || !input.listingId) {
		throw new BoostPurchaseError(ERROR_CODES.badRequest, 400);
	}
	const price = findBoostPrice(input.duration);
	if (!price) throw new BoostPurchaseError(ERROR_CODES.boostInvalidDuration, 400);
	const providerName: ProviderName = input.providerName === "stripe" ? "stripe" : "notchpay";

	const listing = await payload
		.findByID({ collection: "listings", id: input.listingId, depth: 0, overrideAccess: true })
		.catch(() => null);
	if (!listing) throw new BoostPurchaseError(ERROR_CODES.listingNotFound, 404);
	if (relationId(listing.seller) !== input.userId) {
		throw new BoostPurchaseError(ERROR_CODES.boostNotOwner, 403);
	}
	if (listing.status !== "published") {
		throw new BoostPurchaseError(ERROR_CODES.boostListingNotPublished, 409);
	}

	let provider: PaymentProvider;
	try {
		provider = deps.getProvider(providerName);
	} catch (error) {
		payload.logger.error({
			msg: "[boost] payment provider is not configured",
			provider: providerName,
			err: error,
		});
		throw new BoostPurchaseError(ERROR_CODES.paymentProviderUnavailable, 503);
	}

	const idempotencyKey = `boost:${input.userId}:${input.idempotencyKey || randomUUID()}`;
	const replay = await findIntentByIdempotencyKey(payload, idempotencyKey);
	if (replay) {
		if (replay.status === "pending" && replay.checkoutUrl) {
			return {
				paymentId: replay.targetId,
				intentId: String(replay.id),
				provider: replay.provider,
				checkoutUrl: replay.checkoutUrl,
				clientSecret: null,
			};
		}
		throw new BoostPurchaseError(ERROR_CODES.validation, 409);
	}

	const now = input.now ?? new Date();
	const { boostPaymentId, intent } = await withTransaction(payload, async (req) => {
		const boost = await payload.create({
			collection: "boost-payments",
			depth: 0,
			overrideAccess: true,
			req,
			data: {
				listing: String(listing.id),
				user: input.userId,
				amount: price.amount,
				duration: String(price.days) as "7" | "14" | "30",
				status: "pending",
				paymentProvider: providerName,
			},
		});
		const created = await createPaymentIntent(
			payload,
			{
				purpose: "boost",
				targetType: "boost-payment",
				targetId: String(boost.id),
				customerId: input.userId,
				amount: price.amount,
				currency: price.currency,
				provider: providerName,
				idempotencyKey,
				now,
			},
			req,
		);
		await payload.update({
			collection: "boost-payments",
			id: boost.id,
			depth: 0,
			overrideAccess: true,
			req,
			data: { paymentIntent: String(created.id) },
		});
		return { boostPaymentId: String(boost.id), intent: created };
	});

	// Outside the transaction: a network call must not hold it open.
	let checkout: CreatePaymentResult;
	try {
		checkout = await provider.createPayment({
			reference: String(intent.reference),
			amount: price.amount,
			currency: price.currency,
			description: `Boost annonce: ${listing.title}`,
			callbackUrl: buildCallbackUrl(input.serverUrl, String(listing.id), input.returnUrl, providerName),
			customer: { email: input.email },
		});
	} catch (error) {
		payload.logger.error({
			msg: "[boost] provider refused to create the payment",
			intentId: intent.id,
			err: error,
		});
		await applyStatus(payload, String(intent.id), {
			status: "failed",
			source: "system",
			note: "provider createPayment failed",
		});
		throw new BoostPurchaseError(ERROR_CODES.paymentProviderUnavailable, 502);
	}

	await markIntentPending(payload, String(intent.id), {
		providerReference: checkout.providerReference,
		checkoutUrl: checkout.checkoutUrl ?? null,
	});
	// Legacy fields: released app versions still read them.
	await payload.update({
		collection: "boost-payments",
		id: boostPaymentId,
		depth: 0,
		overrideAccess: true,
		data: {
			paymentReference: checkout.providerReference,
			paymentUrl: checkout.checkoutUrl ?? null,
		},
	});

	return {
		paymentId: boostPaymentId,
		intentId: String(intent.id),
		provider: providerName,
		checkoutUrl: checkout.checkoutUrl ?? null,
		clientSecret: checkout.clientSecret ?? null,
	};
}
```

- [ ] **Step 6: Rewrite the purchase route**

```ts
// packages/api/src/app/(frontend)/api/public/boost/route.ts
import config from "@payload-config";
import { getPayload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { BoostPurchaseError, startBoostPurchase } from "@/services/boostPurchase";

export async function POST(request: Request) {
	const payload = await getPayload({ config });
	const { user } = await payload.auth({ headers: request.headers });
	if (!user) return errorResponse(ERROR_CODES.unauthorized, 401);

	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

	try {
		const result = await startBoostPurchase(payload, {
			userId: String(user.id),
			email: user.email,
			listingId: body.listingId,
			duration: body.duration,
			providerName: body.provider,
			returnUrl: typeof body.returnUrl === "string" ? body.returnUrl : undefined,
			idempotencyKey: request.headers.get("idempotency-key"),
			serverUrl: process.env.PAYLOAD_PUBLIC_SERVER_URL ?? "",
		});
		return Response.json(result);
	} catch (error) {
		if (error instanceof BoostPurchaseError) {
			return errorResponse(error.code, error.status);
		}
		console.error("[boost] purchase failed", error);
		return errorResponse(ERROR_CODES.server, 500);
	}
}
```

- [ ] **Step 7: Expose the price list**

In `packages/api/src/app/(frontend)/api/public/config/route.ts`, add `import { BOOST_PRICING } from "@/lib/boostPricing";` and `boostPricing: BOOST_PRICING,` to the returned JSON.

- [ ] **Step 8: Run the tests and watch them pass**

Run: `bunx vitest run --config ./vitest.config.mts tests/int/boost-purchase.int.spec.ts tests/int/boost-route.int.spec.ts`
Expected: PASS (purchase: 10 tests; route: 4 tests).

- [ ] **Step 9: Typecheck, lint, commit**

Run: `bun run check-types` in `packages/api` — Expected: no errors.
Run from root: `bunx biome check --write packages/api/src/lib/boostPricing.ts packages/api/src/services/boostPurchase.ts "packages/api/src/app/(frontend)/api/public/boost/route.ts" "packages/api/src/app/(frontend)/api/public/config/route.ts" packages/api/tests/int/boost-purchase.int.spec.ts packages/api/tests/int/boost-route.int.spec.ts`

```bash
git add packages/api/src/lib/boostPricing.ts packages/api/src/services/boostPurchase.ts "packages/api/src/app/(frontend)/api/public/boost/route.ts" "packages/api/src/app/(frontend)/api/public/config/route.ts" packages/api/tests/int/boost-purchase.int.spec.ts packages/api/tests/int/boost-route.int.spec.ts
git commit -m "feat(api): check ownership and price boosts server-side through payment intents"
```

---

### Task 7: Stored webhook events, the processing job and both webhook routes

**Files:**
- Create: `packages/api/src/services/webhookEvents.ts`
- Create: `packages/api/src/lib/paymentWebhookRoute.ts`
- Create: `packages/api/src/jobs/processWebhookEvent.ts`
- Modify: `packages/api/src/jobs/index.ts`
- Modify: `packages/api/src/payload.config.ts`
- Rewrite: `packages/api/src/app/(frontend)/api/public/boost/webhook/notchpay/route.ts`
- Rewrite: `packages/api/src/app/(frontend)/api/public/boost/webhook/stripe/route.ts`
- Modify (generated): `packages/api/src/payload-types.ts`
- Test: `packages/api/tests/int/webhook-events.int.spec.ts` (create)
- Test: `packages/api/tests/int/payment-webhook-routes.int.spec.ts` (create)

**Interfaces:**
- Consumes: `PaymentProvider.verifyWebhook` / `parseWebhookEvent`, `WebhookSignatureError`, `getProvider` (Task 2); `settlePayment` (Task 4); `webhook-events` collection (Task 3).
- Produces:
  - `hashPayload(rawBody: string): string` (SHA-256 hex)
  - `recordWebhookEvent(payload, { provider, event, raw, rawBody, receivedAt? }): Promise<{ id: string; duplicate: boolean }>`
  - `processWebhookEvent(payload, eventId: string, deps?: { getProvider }): Promise<{ outcome: string }>`
  - `handlePaymentWebhook(providerName: ProviderName, request: Request): Promise<Response>`
  - Payload task `processWebhookEvent` (input `{ eventId: string }`) on queue `payments`, which `jobs.autoRun` runs every minute.

Route behaviour, identical for both providers: bad signature → 400 with only "signature verification failed" logged; duplicate `(provider, providerEventId)` → 200 with no work; store failure → 500 so the provider retries; otherwise 200 and a queued job. If queuing fails after the event is stored the route answers 500; the provider's retry is then a duplicate, and the reconciliation job (Task 9) settles the intent from the provider's own API. An event without an id is keyed `sha256:{payloadHash}`. An event with no reference is marked processed and ignored; an unknown reference is marked processed, logged, and not retried.

- [ ] **Step 1: Write the failing service test**

```ts
// packages/api/tests/int/webhook-events.int.spec.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { processWebhookEventTask } from "../../src/jobs/processWebhookEvent";
import { NotchPayProvider } from "../../src/lib/payments/notchpay";
import {
	hashPayload,
	processWebhookEvent,
	recordWebhookEvent,
} from "../../src/services/webhookEvents";
import { fakePayload } from "./helpers/fakePayload";

const notchpay = new NotchPayProvider("pk", "https://notchpay.test", "hash");
const deps = { getProvider: () => notchpay };

const raw = {
	id: "evt_1",
	event: "payment.complete",
	data: { merchant_reference: "PI-pi-1", reference: "trx.1", amount: 900, currency: "XAF", status: "complete" },
};
const rawBody = JSON.stringify(raw);

function world() {
	return fakePayload(
		{
			listings: [{ id: "l-1", status: "published", boostedUntil: null }],
			"boost-payments": [
				{ id: "bp-1", listing: "l-1", duration: "7", status: "pending", amount: 900 },
			],
			"payment-intents": [
				{
					id: "pi-1",
					purpose: "boost",
					targetId: "bp-1",
					amount: 900,
					currency: "XAF",
					status: "pending",
					reference: "PI-pi-1",
					statusHistory: [],
				},
			],
		},
		{ uniques: { "webhook-events": [["provider", "providerEventId"]] } },
	);
}

const record = (payload: ReturnType<typeof world>) =>
	recordWebhookEvent(payload, {
		provider: "notchpay",
		event: notchpay.parseWebhookEvent(raw),
		raw,
		rawBody,
	});

describe("recordWebhookEvent", () => {
	it("stores the event once with its hash", async () => {
		const payload = world();
		const first = await record(payload);
		const second = await record(payload);

		expect(first.duplicate).toBe(false);
		expect(second).toEqual({ id: first.id, duplicate: true });
		expect(payload.store["webhook-events"]).toHaveLength(1);
		expect(payload.store["webhook-events"][0]).toMatchObject({
			provider: "notchpay",
			providerEventId: "evt_1",
			type: "payment.complete",
			reference: "PI-pi-1",
			payloadHash: hashPayload(rawBody),
			attempts: 0,
		});
	});

	it("treats a lost insert race as a duplicate", async () => {
		const payload = world();
		const original = payload.create.bind(payload);
		vi.spyOn(payload, "create").mockImplementationOnce(async (args: any) => {
			await original(args);
			throw Object.assign(new Error("E11000"), { code: 11000 });
		});
		expect((await record(payload)).duplicate).toBe(true);
	});

	it("keys an event without an id by its payload hash", async () => {
		const payload = world();
		await recordWebhookEvent(payload, {
			provider: "notchpay",
			event: { ...notchpay.parseWebhookEvent(raw), providerEventId: "" },
			raw,
			rawBody,
		});
		expect(payload.store["webhook-events"][0].providerEventId).toBe(
			`sha256:${hashPayload(rawBody)}`,
		);
	});
});

describe("processWebhookEvent", () => {
	it("settles the intent and marks the event processed", async () => {
		const payload = world();
		const { id } = await record(payload);

		expect(await processWebhookEvent(payload, id, deps)).toEqual({ outcome: "applied" });
		expect(payload.store["payment-intents"][0].status).toBe("succeeded");
		expect(payload.store["webhook-events"][0]).toMatchObject({ attempts: 1, lastError: null });
		expect(payload.store["webhook-events"][0].processedAt).toEqual(expect.any(String));
	});

	it("does nothing for an event already processed", async () => {
		const payload = world();
		const { id } = await record(payload);
		await processWebhookEvent(payload, id, deps);
		expect(await processWebhookEvent(payload, id, deps)).toEqual({ outcome: "already_processed" });
	});

	it("records the failure and rethrows so the job is retried", async () => {
		const payload = world();
		const { id } = await record(payload);
		vi.spyOn(payload, "findByID").mockImplementation(async ({ collection, id: docId }: any) => {
			if (collection === "payment-intents") throw new Error("mongo is down");
			return structuredClone(payload.store[collection].find((d) => d.id === docId));
		});

		await expect(processWebhookEvent(payload, id, deps)).rejects.toThrow("mongo is down");
		expect(payload.store["webhook-events"][0]).toMatchObject({
			attempts: 1,
			lastError: "mongo is down",
		});
		expect(payload.store["webhook-events"][0].processedAt).toBeUndefined();
	});

	it("is retried up to five times with backoff", () => {
		expect(processWebhookEventTask.retries).toMatchObject({
			attempts: 5,
			backoff: { type: "exponential" },
		});
	});
});
```

- [ ] **Step 2: Write the failing route test**

```ts
// packages/api/tests/int/payment-webhook-routes.int.spec.ts
// @vitest-environment node
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.fn();
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({ getPayload: getPayloadMock }));

const HASH_KEY = "notch-hash";
const STRIPE_SECRET = "whsec_routes";

type Handler = (request: Request) => Promise<Response>;
let notchpayPOST: Handler;
let stripePOST: Handler;

beforeAll(async () => {
	({ POST: notchpayPOST } = await import(
		"../../src/app/(frontend)/api/public/boost/webhook/notchpay/route"
	));
	({ POST: stripePOST } = await import(
		"../../src/app/(frontend)/api/public/boost/webhook/stripe/route"
	));
}, 30_000);

const notchBody = JSON.stringify({
	id: "evt_route_1",
	event: "payment.complete",
	data: { merchant_reference: "PI-x", reference: "trx.x", amount: 900, currency: "XAF", status: "complete" },
});
const validSignature = createHmac("sha256", HASH_KEY).update(notchBody).digest("hex");
const wrongSignature = createHmac("sha256", "wrong").update(notchBody).digest("hex");

const notchRequest = (signature: string, body = notchBody) =>
	new Request("http://localhost/api/public/boost/webhook/notchpay", {
		method: "POST",
		headers: { "x-notch-signature": signature },
		body,
	});

describe("payment webhook routes", () => {
	let payload: ReturnType<typeof fakePayload>;
	const logSpies: Array<ReturnType<typeof vi.spyOn>> = [];

	beforeEach(() => {
		process.env.NOTCHPAY_PUBLIC_KEY = "pk_test";
		process.env.NOTCHPAY_HASH_KEY = HASH_KEY;
		process.env.STRIPE_SECRET_KEY = "sk_test_routes";
		process.env.STRIPE_WEBHOOK_SECRET = STRIPE_SECRET;
		payload = fakePayload({}, { uniques: { "webhook-events": [["provider", "providerEventId"]] } });
		getPayloadMock.mockResolvedValue(payload);
		for (const method of ["log", "info", "warn", "error"] as const) {
			logSpies.push(vi.spyOn(console, method).mockImplementation(() => undefined));
		}
	});

	afterEach(() => {
		for (const spy of logSpies.splice(0)) spy.mockRestore();
	});

	const everythingLogged = () =>
		JSON.stringify([
			...logSpies.flatMap((spy) => spy.mock.calls),
			payload.logger.info.mock.calls,
			payload.logger.warn.mock.calls,
			payload.logger.error.mock.calls,
		]);

	it("stores a signed NotchPay event and queues its processing", async () => {
		const response = await notchpayPOST(notchRequest(validSignature));

		expect(response.status).toBe(200);
		expect(payload.store["webhook-events"]).toHaveLength(1);
		expect(payload.jobs.queue).toHaveBeenCalledWith({
			task: "processWebhookEvent",
			input: { eventId: payload.store["webhook-events"][0].id },
			queue: "payments",
		});
	});

	it("answers 400 to a bad signature and never logs a signature value", async () => {
		const response = await notchpayPOST(notchRequest(wrongSignature));

		expect(response.status).toBe(400);
		expect(payload.store["webhook-events"] ?? []).toHaveLength(0);
		const logged = everythingLogged();
		expect(logged).not.toContain(wrongSignature);
		expect(logged).not.toContain(validSignature);
	});

	it("answers 200 to a duplicate event without queuing it again", async () => {
		await notchpayPOST(notchRequest(validSignature));
		const second = await notchpayPOST(notchRequest(validSignature));

		expect(second.status).toBe(200);
		expect(await second.json()).toMatchObject({ duplicate: true });
		expect(payload.jobs.queue).toHaveBeenCalledTimes(1);
	});

	it("answers 500 when the event cannot be stored, so the provider retries", async () => {
		vi.spyOn(payload, "create").mockRejectedValue(new Error("mongo is down"));
		vi.spyOn(payload, "find").mockResolvedValue({ docs: [], totalDocs: 0, hasNextPage: false, nextPage: null } as never);
		expect((await notchpayPOST(notchRequest(validSignature))).status).toBe(500);
	});

	it("stores a signed Stripe event", async () => {
		const body = JSON.stringify({
			id: "evt_stripe_1",
			object: "event",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_1",
					object: "checkout.session",
					amount_total: 900,
					currency: "xaf",
					payment_status: "paid",
					status: "complete",
					metadata: { reference: "PI-x" },
				},
			},
		});
		const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: STRIPE_SECRET });
		const response = await stripePOST(
			new Request("http://localhost/api/public/boost/webhook/stripe", {
				method: "POST",
				headers: { "stripe-signature": header },
				body,
			}),
		);

		expect(response.status).toBe(200);
		expect(payload.store["webhook-events"][0]).toMatchObject({
			provider: "stripe",
			providerEventId: "evt_stripe_1",
			reference: "PI-x",
		});
	});

	it("answers 400 to a Stripe event signed with another secret", async () => {
		const body = JSON.stringify({ id: "evt_s", object: "event", type: "ping", data: { object: {} } });
		const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_other" });
		const response = await stripePOST(
			new Request("http://localhost/api/public/boost/webhook/stripe", {
				method: "POST",
				headers: { "stripe-signature": header },
				body,
			}),
		);
		expect(response.status).toBe(400);
	});
});
```

- [ ] **Step 3: Run both and watch them fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/webhook-events.int.spec.ts tests/int/payment-webhook-routes.int.spec.ts`
Expected: FAIL, cannot resolve `../../src/services/webhookEvents`; the route test fails on the missing `webhook-events` rows and on the logged signatures.

- [ ] **Step 4: Write the webhook events service**

```ts
// packages/api/src/services/webhookEvents.ts
import { createHash } from "node:crypto";
import type { Payload } from "payload";
import { getProvider } from "../lib/payments";
import type {
	NormalizedWebhookEvent,
	PaymentProvider,
	ProviderName,
} from "../lib/payments/types";
import { settlePayment } from "./payments";

export function hashPayload(rawBody: string): string {
	return createHash("sha256").update(rawBody).digest("hex");
}

export async function recordWebhookEvent(
	payload: Payload,
	input: {
		provider: ProviderName;
		event: NormalizedWebhookEvent;
		raw: unknown;
		rawBody: string;
		receivedAt?: Date;
	},
): Promise<{ id: string; duplicate: boolean }> {
	const payloadHash = hashPayload(input.rawBody);
	const providerEventId = input.event.providerEventId || `sha256:${payloadHash}`;

	const findExisting = async () => {
		const result = await payload.find({
			collection: "webhook-events",
			where: {
				and: [
					{ provider: { equals: input.provider } },
					{ providerEventId: { equals: providerEventId } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		return result.docs[0];
	};

	const existing = await findExisting();
	if (existing) return { id: String(existing.id), duplicate: true };

	try {
		const created = await payload.create({
			collection: "webhook-events",
			depth: 0,
			overrideAccess: true,
			data: {
				provider: input.provider,
				providerEventId,
				type: input.event.type,
				reference: input.event.reference || undefined,
				payloadHash,
				raw: input.raw as Record<string, unknown>,
				receivedAt: (input.receivedAt ?? new Date()).toISOString(),
				attempts: 0,
			},
		});
		return { id: String(created.id), duplicate: false };
	} catch (error) {
		// Two deliveries of the same event can race past the lookup; the unique
		// index lets one win, and the loser is a duplicate, not a failure.
		const raced = await findExisting().catch(() => undefined);
		if (raced) return { id: String(raced.id), duplicate: true };
		throw error;
	}
}

export async function processWebhookEvent(
	payload: Payload,
	eventId: string,
	deps: { getProvider: (name: ProviderName) => PaymentProvider } = { getProvider },
): Promise<{ outcome: string }> {
	const event = await payload.findByID({
		collection: "webhook-events",
		id: eventId,
		depth: 0,
		overrideAccess: true,
	});
	if (event.processedAt) return { outcome: "already_processed" };

	const attempts = (event.attempts ?? 0) + 1;
	try {
		const normalized = deps.getProvider(event.provider).parseWebhookEvent(event.raw);
		let outcome = "ignored_without_reference";
		if (normalized.reference || normalized.providerTransactionId) {
			outcome = (await settlePayment(payload, { ...normalized, source: "webhook" })).outcome;
		}
		await payload.update({
			collection: "webhook-events",
			id: eventId,
			depth: 0,
			overrideAccess: true,
			data: { attempts, processedAt: new Date().toISOString(), lastError: null },
		});
		return { outcome };
	} catch (error) {
		await payload
			.update({
				collection: "webhook-events",
				id: eventId,
				depth: 0,
				overrideAccess: true,
				data: {
					attempts,
					lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
				},
			})
			.catch(() => undefined);
		throw error;
	}
}
```

- [ ] **Step 5: Write the job and register it**

```ts
// packages/api/src/jobs/processWebhookEvent.ts
import type { TaskConfig } from "payload";
import { processWebhookEvent } from "../services/webhookEvents";

export const processWebhookEventTask: TaskConfig<"processWebhookEvent"> = {
	slug: "processWebhookEvent",
	retries: { attempts: 5, backoff: { type: "exponential", delay: 30_000 } },
	inputSchema: [{ name: "eventId", type: "text", required: true }],
	outputSchema: [{ name: "outcome", type: "text" }],
	handler: async ({ input, req }) => {
		const { outcome } = await processWebhookEvent(req.payload, input.eventId);
		return { output: { outcome } };
	},
};
```

Add `export { processWebhookEventTask } from "./processWebhookEvent";` to `src/jobs/index.ts`. In `payload.config.ts` import it, add it to `jobs.tasks`, and add a third `autoRun` entry:

```ts
			{ cron: "* * * * *", queue: "payments", limit: 20 },
```

Run: `cd packages/api && DATABASE_URI=mongodb://127.0.0.1:27017/unused PAYLOAD_SECRET=unused bun run generate:types`
Expected: `TypedJobs.tasks.processWebhookEvent` appears in `src/payload-types.ts`.

- [ ] **Step 6: Write the shared route handler and both routes**

```ts
// packages/api/src/lib/paymentWebhookRoute.ts
import config from "@payload-config";
import { getPayload } from "payload";
import { recordWebhookEvent } from "../services/webhookEvents";
import { ERROR_CODES, errorResponse } from "./errors";
import { getProvider } from "./payments";
import {
	type NormalizedWebhookEvent,
	type PaymentProvider,
	type ProviderName,
	WebhookSignatureError,
} from "./payments/types";

export async function handlePaymentWebhook(
	providerName: ProviderName,
	request: Request,
): Promise<Response> {
	const scope = `[webhook:${providerName}]`;
	const rawBody = await request.text();
	const headers = Object.fromEntries(request.headers.entries());

	let provider: PaymentProvider;
	try {
		provider = getProvider(providerName);
	} catch {
		console.error(`${scope} provider is not configured`);
		return errorResponse(ERROR_CODES.server, 500);
	}

	let event: NormalizedWebhookEvent;
	try {
		event = await provider.verifyWebhook(rawBody, headers);
	} catch (error) {
		if (error instanceof WebhookSignatureError) {
			console.warn(`${scope} signature verification failed`);
			return errorResponse(ERROR_CODES.badRequest, 400);
		}
		console.error(`${scope} verification could not run:`, (error as Error).message);
		return errorResponse(ERROR_CODES.server, 500);
	}

	const payload = await getPayload({ config });

	let recorded: { id: string; duplicate: boolean };
	try {
		recorded = await recordWebhookEvent(payload, {
			provider: providerName,
			event,
			raw: JSON.parse(rawBody),
			rawBody,
		});
	} catch (error) {
		payload.logger.error({ msg: `${scope} could not store the event`, err: error });
		return errorResponse(ERROR_CODES.server, 500);
	}

	if (recorded.duplicate) return Response.json({ received: true, duplicate: true });

	try {
		await payload.jobs.queue({
			task: "processWebhookEvent",
			input: { eventId: recorded.id },
			queue: "payments",
		});
	} catch (error) {
		payload.logger.error({ msg: `${scope} could not queue the event`, eventId: recorded.id, err: error });
		return errorResponse(ERROR_CODES.server, 500);
	}

	return Response.json({ received: true });
}
```

```ts
// packages/api/src/app/(frontend)/api/public/boost/webhook/notchpay/route.ts
import { handlePaymentWebhook } from "@/lib/paymentWebhookRoute";

export function POST(request: Request) {
	return handlePaymentWebhook("notchpay", request);
}
```

```ts
// packages/api/src/app/(frontend)/api/public/boost/webhook/stripe/route.ts
import { handlePaymentWebhook } from "@/lib/paymentWebhookRoute";

export function POST(request: Request) {
	return handlePaymentWebhook("stripe", request);
}
```

`boost/webhook/route.ts` keeps re-exporting the Stripe `POST`.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `bunx vitest run --config ./vitest.config.mts tests/int/webhook-events.int.spec.ts tests/int/payment-webhook-routes.int.spec.ts`
Expected: PASS (service: 7 tests; routes: 6 tests).

- [ ] **Step 8: Typecheck, lint, commit**

Run: `bun run check-types` in `packages/api` — Expected: no errors (`lib/boostPayments.ts` is still used by the callback until Task 8).
Run from root: `bunx biome check --write packages/api/src/services/webhookEvents.ts packages/api/src/lib/paymentWebhookRoute.ts packages/api/src/jobs "packages/api/src/app/(frontend)/api/public/boost/webhook" packages/api/src/payload.config.ts packages/api/tests/int/webhook-events.int.spec.ts packages/api/tests/int/payment-webhook-routes.int.spec.ts`

```bash
git add packages/api/src/services/webhookEvents.ts packages/api/src/lib/paymentWebhookRoute.ts packages/api/src/jobs "packages/api/src/app/(frontend)/api/public/boost/webhook" packages/api/src/payload.config.ts packages/api/src/payload-types.ts packages/api/tests/int/webhook-events.int.spec.ts packages/api/tests/int/payment-webhook-routes.int.spec.ts
git commit -m "feat(api): store payment webhooks once and settle them in a retried job"
```

---

### Task 8: Callback through settlement, legacy activation removed

**Files:**
- Rewrite: `packages/api/src/app/(frontend)/api/public/boost/callback/route.ts`
- Modify: `packages/api/src/lib/payments/index.ts` (remove `getNotchPayProvider`)
- Delete: `packages/api/src/lib/boostPayments.ts`
- Delete: `packages/api/tests/int/boost-payments.int.spec.ts` (covered by `payment-settlement.int.spec.ts`)
- Rewrite: `packages/api/tests/int/boost-callback-route.int.spec.ts`

**Interfaces:**
- Consumes: `getProvider("notchpay").verifyPayment` (Task 2), `settlePayment`, `SettleOutcome` (Task 4).
- Produces: nothing new. The redirect contract is unchanged: `?boostStatus=success|pending|failed` on the web, `?status=…&listingId=…` on the app deep link.

- [ ] **Step 1: Rewrite the callback test**

```ts
// packages/api/tests/int/boost-callback-route.int.spec.ts
// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePayload } from "./helpers/fakePayload";

const getPayloadMock = vi.fn();
const verifyPaymentMock = vi.fn();

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({ getPayload: getPayloadMock }));
vi.mock("../../src/lib/payments", () => ({
	getProvider: () => ({ verifyPayment: verifyPaymentMock }),
}));

let GET: (request: Request) => Promise<Response>;

beforeAll(async () => {
	({ GET } = await import("../../src/app/(frontend)/api/public/boost/callback/route"));
}, 30_000);

const verified = (status: string, amount = 900) => ({
	reference: "PI-pi-1",
	status,
	amount,
	currency: "XAF",
	providerTransactionId: "trx.1",
});

const callback = (query: string) =>
	GET(new Request(`http://localhost:3000/api/public/boost/callback?${query}`));

describe("boost callback route", () => {
	let payload: ReturnType<typeof fakePayload>;

	beforeEach(() => {
		process.env.PUBLIC_WEB_URL = "https://buynsellem.com";
		verifyPaymentMock.mockReset();
		payload = fakePayload({
			listings: [{ id: "l-1", status: "published", boostedUntil: null }],
			"boost-payments": [{ id: "bp-1", listing: "l-1", duration: "14", status: "pending" }],
			"payment-intents": [
				{
					id: "pi-1",
					purpose: "boost",
					targetId: "bp-1",
					amount: 900,
					currency: "XAF",
					status: "pending",
					reference: "PI-pi-1",
					providerReference: "trx.1",
					statusHistory: [],
				},
			],
		});
		getPayloadMock.mockResolvedValue(payload);
	});

	it("settles a verified payment with source callback and redirects with success", async () => {
		verifyPaymentMock.mockResolvedValue(verified("succeeded"));
		const response = await callback("provider=notchpay&reference=trx.1&trxref=PI-pi-1&listingId=l-1");

		expect(verifyPaymentMock).toHaveBeenCalledWith("trx.1");
		expect(payload.store["payment-intents"][0].statusHistory.at(-1)).toMatchObject({
			status: "succeeded",
			source: "callback",
		});
		expect(payload.store["boost-payments"][0].status).toBe("completed");
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://buynsellem.com/listing/l-1?boostStatus=success",
		);
	});

	it("does not boost twice when the webhook already settled the intent", async () => {
		verifyPaymentMock.mockResolvedValue(verified("succeeded"));
		await callback("provider=notchpay&reference=trx.1&listingId=l-1");
		const boosted = payload.store.listings[0].boostedUntil;

		const response = await callback("provider=notchpay&reference=trx.1&listingId=l-1");
		expect(payload.store.listings[0].boostedUntil).toBe(boosted);
		expect(response.headers.get("location")).toContain("boostStatus=success");
	});

	it("reports pending while the provider has not confirmed", async () => {
		verifyPaymentMock.mockResolvedValue(verified("pending"));
		const response = await callback("provider=notchpay&reference=trx.1&listingId=l-1");
		expect(response.headers.get("location")).toContain("boostStatus=pending");
	});

	it("reports pending on an amount mismatch and failed on an unknown reference", async () => {
		verifyPaymentMock.mockResolvedValue(verified("succeeded", 100));
		expect((await callback("provider=notchpay&reference=trx.1&listingId=l-1")).headers.get("location")).toContain("boostStatus=pending");

		verifyPaymentMock.mockResolvedValue({ ...verified("succeeded"), reference: "PI-nope", providerTransactionId: "trx.nope" });
		expect((await callback("provider=notchpay&reference=trx.nope&listingId=l-1")).headers.get("location")).toContain("boostStatus=failed");
	});

	it("reports failed when verification throws", async () => {
		verifyPaymentMock.mockRejectedValue(new Error("NotchPay verify (503)"));
		const response = await callback("provider=notchpay&reference=trx.1&listingId=l-1");
		expect(response.headers.get("location")).toContain("boostStatus=failed");
	});

	it("returns to the app through the deep link", async () => {
		verifyPaymentMock.mockResolvedValue(verified("succeeded"));
		const response = await callback(
			"provider=notchpay&reference=trx.1&listingId=l-1&appReturnUrl=buynsellem%3A%2F%2Fboost%2Fcallback",
		);
		expect(await response.text()).toContain("buynsellem://boost/callback?status=success&listingId=l-1");
	});
});
```

(An amount mismatch keeps the intent pending, so the callback answers `pending`; staff investigate from the error log.)

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/boost-callback-route.int.spec.ts`
Expected: FAIL, the route imports `getNotchPayProvider`, which the mock does not provide.

- [ ] **Step 3: Rewrite the callback**

Replace the imports, the NotchPay branch and the `activateBoost` helper of `callback/route.ts`; the HTML deep-link response and the web redirect at the end stay exactly as they are.

```ts
import config from "@payload-config";
import { getPayload } from "payload";
import { getProvider } from "@/lib/payments";
import { type SettleOutcome, settlePayment } from "@/services/payments";

type CallbackStatus = "success" | "pending" | "failed";

function callbackStatus(result: SettleOutcome): CallbackStatus {
	if (result.outcome === "unknown_reference") return "failed";
	const { status } = result.intent;
	if (status === "succeeded") return "success";
	if (status === "pending" || status === "created") return "pending";
	return "failed";
}

/**
 * GET redirect after a hosted checkout. It never activates anything by itself:
 * NotchPay payments are verified with the provider and go through the same
 * idempotent settlement as the webhook, in whichever order the two arrive.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const provider = url.searchParams.get("provider") ?? "notchpay";
	const providerReference = url.searchParams.get("reference") ?? "";
	const ourReference = url.searchParams.get("trxref") ?? "";
	const appReturnUrl = url.searchParams.get("appReturnUrl") ?? "";
	const listingId = url.searchParams.get("listingId") ?? "";

	let status: CallbackStatus = "failed";

	if (provider === "stripe") {
		// Stripe settles through its webhook; the redirect only relays the outcome.
		status = url.searchParams.get("status") === "success" ? "success" : "failed";
	} else if (providerReference) {
		try {
			const payload = await getPayload({ config });
			const verified = await getProvider("notchpay").verifyPayment(providerReference);
			const result = await settlePayment(payload, {
				...verified,
				reference: verified.reference || ourReference,
				source: "callback",
			});
			status = callbackStatus(result);
		} catch (error) {
			console.error(
				"[boost callback] verification failed:",
				error instanceof Error ? error.message : error,
			);
		}
	}

	// … unchanged deep-link HTML and web redirect …
}
```

Delete the old `activateBoost` function at the bottom of the file.

- [ ] **Step 4: Remove the legacy activation path**

```bash
git rm packages/api/src/lib/boostPayments.ts packages/api/tests/int/boost-payments.int.spec.ts
```

In `src/lib/payments/index.ts` delete `getNotchPayProvider`. Check nothing else used them:

Run: `grep -rn "boostPayments\"\|getNotchPayProvider\|activateBoostPayment" packages/api/src`
Expected: only `services/boostActivation.ts` and `services/paymentPurposes.ts` (the new `activateBoostPayment`).

- [ ] **Step 5: Run the test and watch it pass**

Run: `bunx vitest run --config ./vitest.config.mts tests/int/boost-callback-route.int.spec.ts` — Expected: PASS (6 tests), in well under the 10 s timeout that made the old version fail.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `bun run check-types` in `packages/api` — Expected: no errors.
Run from root: `bunx biome check --write "packages/api/src/app/(frontend)/api/public/boost/callback/route.ts" packages/api/src/lib/payments/index.ts packages/api/tests/int/boost-callback-route.int.spec.ts`

```bash
git add "packages/api/src/app/(frontend)/api/public/boost/callback/route.ts" packages/api/src/lib/payments/index.ts packages/api/tests/int/boost-callback-route.int.spec.ts
git commit -m "feat(api): settle the boost callback through the payment intent"
```

---

### Task 9: Reconciliation job

**Files:**
- Create: `packages/api/src/services/paymentReconciliation.ts`
- Create: `packages/api/src/jobs/reconcilePendingPayments.ts`
- Modify: `packages/api/src/jobs/index.ts`, `packages/api/src/payload.config.ts`
- Modify (generated): `packages/api/src/payload-types.ts`
- Test: `packages/api/tests/int/payment-reconciliation.int.spec.ts` (create)

**Interfaces:**
- Consumes: `applyStatus`, `IntentDoc` (Task 4); `getProvider`, `PaymentProvider` (Task 2).
- Produces: `RECONCILE_AFTER_MS = 10 * 60 * 1000`; `reconcilePendingPayments(payload, { now?, getProvider?, limit? }): Promise<{ checked: number; settled: number; expired: number; errors: number }>`; task `reconcilePendingPayments` scheduled `*/15 * * * *` on queue `payments`.

Order per intent: ask the provider first (a late success must win over expiry), then expire if `expiresAt` has passed. An amount mismatch leaves the intent pending and is never expired automatically: money moved and staff must look. A `created` intent has no provider reference and can only expire. One failing intent does not stop the run.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/tests/int/payment-reconciliation.int.spec.ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { reconcilePendingPaymentsTask } from "../../src/jobs/reconcilePendingPayments";
import { reconcilePendingPayments } from "../../src/services/paymentReconciliation";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T10:00:00.000Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

const intent = (id: string, overrides: Record<string, unknown>) => ({
	id,
	purpose: "boost",
	targetId: `bp-${id}`,
	amount: 900,
	currency: "XAF",
	provider: "notchpay",
	providerReference: `trx.${id}`,
	reference: `PI-${id}`,
	status: "pending",
	statusHistory: [],
	createdAt: ago(30),
	expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
	...overrides,
});

function world(intents: Record<string, unknown>[]) {
	return fakePayload({
		listings: [{ id: "l-1", status: "published", boostedUntil: null }],
		"boost-payments": intents.map((i) => ({
			id: `bp-${i.id}`,
			listing: "l-1",
			duration: "7",
			status: "pending",
		})),
		"payment-intents": intents,
	});
}

function providerReporting(statuses: Record<string, { status: string; amount?: number }>) {
	const verifyPayment = vi.fn(async (ref: string) => {
		const report = statuses[ref];
		if (!report) throw new Error(`no answer for ${ref}`);
		return {
			reference: "",
			status: report.status,
			amount: report.amount ?? 900,
			currency: "XAF",
			providerTransactionId: ref,
		};
	});
	return { verifyPayment, getProvider: () => ({ verifyPayment }) as never };
}

const statusOf = (payload: ReturnType<typeof world>, id: string) =>
	payload.store["payment-intents"].find((i) => i.id === id)?.status;

describe("reconcilePendingPayments", () => {
	it("settles an intent the provider reports as paid", async () => {
		const payload = world([intent("a", {})]);
		const { getProvider } = providerReporting({ "trx.a": { status: "succeeded" } });

		const stats = await reconcilePendingPayments(payload, { now: NOW, getProvider });

		expect(stats).toMatchObject({ checked: 1, settled: 1, expired: 0, errors: 0 });
		expect(statusOf(payload, "a")).toBe("succeeded");
		expect(payload.store["payment-intents"][0].statusHistory.at(-1).source).toBe("reconcile");
	});

	it("leaves intents younger than ten minutes alone", async () => {
		const payload = world([intent("young", { createdAt: ago(5) })]);
		const { verifyPayment, getProvider } = providerReporting({});
		const stats = await reconcilePendingPayments(payload, { now: NOW, getProvider });
		expect(stats.checked).toBe(0);
		expect(verifyPayment).not.toHaveBeenCalled();
	});

	it("expires a pending intent past expiresAt and fails its boost payment", async () => {
		const payload = world([intent("old", { expiresAt: ago(1), createdAt: ago(25 * 60) })]);
		const { getProvider } = providerReporting({ "trx.old": { status: "pending" } });

		const stats = await reconcilePendingPayments(payload, { now: NOW, getProvider });

		expect(stats.expired).toBe(1);
		expect(statusOf(payload, "old")).toBe("expired");
		expect(payload.store["boost-payments"][0].status).toBe("failed");
	});

	it("prefers a late success over expiry", async () => {
		const payload = world([intent("late", { expiresAt: ago(1) })]);
		const { getProvider } = providerReporting({ "trx.late": { status: "succeeded" } });
		await reconcilePendingPayments(payload, { now: NOW, getProvider });
		expect(statusOf(payload, "late")).toBe("succeeded");
	});

	it("never expires an intent whose amount did not match", async () => {
		const payload = world([intent("odd", { expiresAt: ago(1) })]);
		const { getProvider } = providerReporting({ "trx.odd": { status: "succeeded", amount: 100 } });
		await reconcilePendingPayments(payload, { now: NOW, getProvider });
		expect(statusOf(payload, "odd")).toBe("pending");
	});

	it("expires a created intent that never reached the provider", async () => {
		const payload = world([intent("stuck", { status: "created", providerReference: undefined, expiresAt: ago(1) })]);
		const { verifyPayment, getProvider } = providerReporting({});
		await reconcilePendingPayments(payload, { now: NOW, getProvider });
		expect(verifyPayment).not.toHaveBeenCalled();
		expect(statusOf(payload, "stuck")).toBe("expired");
	});

	it("keeps going when one intent fails", async () => {
		const payload = world([intent("broken", {}), intent("fine", {})]);
		const { getProvider } = providerReporting({ "trx.fine": { status: "succeeded" } });
		const stats = await reconcilePendingPayments(payload, { now: NOW, getProvider });
		expect(stats).toMatchObject({ checked: 2, settled: 1, errors: 1 });
		expect(payload.logger.error).toHaveBeenCalled();
	});

	it("runs every 15 minutes on the payments queue", () => {
		expect(reconcilePendingPaymentsTask.schedule).toEqual([
			{ cron: "*/15 * * * *", queue: "payments" },
		]);
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/payment-reconciliation.int.spec.ts`
Expected: FAIL, cannot resolve `../../src/jobs/reconcilePendingPayments`.

- [ ] **Step 3: Write the service**

```ts
// packages/api/src/services/paymentReconciliation.ts
import type { Payload } from "payload";
import { getProvider as defaultGetProvider } from "../lib/payments";
import type { PaymentProvider, ProviderName } from "../lib/payments/types";
import { applyStatus } from "./payments";

export const RECONCILE_AFTER_MS = 10 * 60 * 1000;

/** Covers a missed webhook and a buyer who closed the browser before the callback. */
export async function reconcilePendingPayments(
	payload: Payload,
	{
		now = new Date(),
		getProvider = defaultGetProvider,
		limit = 100,
	}: {
		now?: Date;
		getProvider?: (name: ProviderName) => PaymentProvider;
		limit?: number;
	} = {},
): Promise<{ checked: number; settled: number; expired: number; errors: number }> {
	const stats = { checked: 0, settled: 0, expired: 0, errors: 0 };
	const { docs } = await payload.find({
		collection: "payment-intents",
		where: {
			and: [
				{ status: { in: ["created", "pending"] } },
				{ createdAt: { less_than: new Date(now.getTime() - RECONCILE_AFTER_MS).toISOString() } },
			],
		},
		sort: "createdAt",
		limit,
		depth: 0,
		overrideAccess: true,
	});

	for (const intent of docs) {
		stats.checked += 1;
		const intentId = String(intent.id);
		try {
			if (intent.providerReference) {
				const verified = await getProvider(intent.provider).verifyPayment(intent.providerReference);
				if (verified.status !== "pending") {
					const result = await applyStatus(payload, intentId, {
						status: verified.status,
						source: "reconcile",
						at: now,
						amount: verified.amount,
						currency: verified.currency,
					});
					if (result.outcome === "applied") {
						stats.settled += 1;
						continue;
					}
					if (result.outcome === "amount_mismatch") continue;
				}
			}

			if (intent.expiresAt && new Date(intent.expiresAt).getTime() <= now.getTime()) {
				const result = await applyStatus(payload, intentId, {
					status: "expired",
					source: "reconcile",
					at: now,
				});
				if (result.outcome === "applied") stats.expired += 1;
			}
		} catch (error) {
			stats.errors += 1;
			payload.logger.error({ msg: "[payments] reconciliation failed for an intent", intentId, err: error });
		}
	}

	return stats;
}
```

- [ ] **Step 4: Write the job and register it**

```ts
// packages/api/src/jobs/reconcilePendingPayments.ts
import type { TaskConfig } from "payload";
import { reconcilePendingPayments } from "../services/paymentReconciliation";

export const reconcilePendingPaymentsTask: TaskConfig<"reconcilePendingPayments"> = {
	slug: "reconcilePendingPayments",
	retries: 0,
	inputSchema: [],
	outputSchema: [
		{ name: "checked", type: "number" },
		{ name: "settled", type: "number" },
		{ name: "expired", type: "number" },
		{ name: "errors", type: "number" },
	],
	schedule: [{ cron: "*/15 * * * *", queue: "payments" }],
	handler: async ({ req }) => ({ output: await reconcilePendingPayments(req.payload) }),
};
```

Export it from `src/jobs/index.ts` and add it to `jobs.tasks` in `payload.config.ts` (the `payments` autoRun entry from Task 7 runs it). Regenerate types:

Run: `cd packages/api && DATABASE_URI=mongodb://127.0.0.1:27017/unused PAYLOAD_SECRET=unused bun run generate:types`

- [ ] **Step 5: Run the test and watch it pass**

Run: `bunx vitest run --config ./vitest.config.mts tests/int/payment-reconciliation.int.spec.ts` — Expected: PASS (8 tests).

- [ ] **Step 6: Run every payment test together**

Run: `bunx vitest run --config ./vitest.config.mts tests/int/error-codes.int.spec.ts tests/int/payment-providers.int.spec.ts tests/int/payment-access.int.spec.ts tests/int/payment-transitions.int.spec.ts tests/int/payment-settlement.int.spec.ts tests/int/payment-backfill.int.spec.ts tests/int/boost-purchase.int.spec.ts tests/int/boost-route.int.spec.ts tests/int/webhook-events.int.spec.ts tests/int/payment-webhook-routes.int.spec.ts tests/int/boost-callback-route.int.spec.ts tests/int/payment-reconciliation.int.spec.ts`
Expected: PASS, all files.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `bun run check-types` in `packages/api` — Expected: no errors.
Run from root: `bunx biome check --write packages/api/src/services/paymentReconciliation.ts packages/api/src/jobs packages/api/src/payload.config.ts packages/api/tests/int/payment-reconciliation.int.spec.ts`

```bash
git add packages/api/src/services/paymentReconciliation.ts packages/api/src/jobs packages/api/src/payload.config.ts packages/api/src/payload-types.ts packages/api/tests/int/payment-reconciliation.int.spec.ts
git commit -m "feat(api): reconcile pending payments with the provider every 15 minutes"
```

---
### Task 10: Web boost dialog reads the server price list

**Files:**
- Modify: `packages/web/src/hooks/use-app-config.tsx`
- Modify: `packages/web/src/app/layout.tsx`
- Modify: `packages/web/src/components/listing/boost-dialog.tsx`

**Interfaces:**
- Consumes: `GET /api/public/config` → `boostPricing: { days: number; amount: number; currency: string }[]` (Task 6); `POST /api/public/boost` error codes and `Idempotency-Key` header (Task 6); `apiErrorFrom`, `resolveErrorMessage` (web `lib/apiError.ts`, Task 1).
- Produces: `interface BoostPrice` and `AppConfig.boostPricing` in `use-app-config.tsx`.

The web package has no test runner; this task is verified by typecheck, lint and a manual check.

- [ ] **Step 1: Add the price list to the app config**

In `packages/web/src/hooks/use-app-config.tsx`:

```ts
export interface BoostPrice {
	days: number;
	amount: number;
	currency: string;
}

export interface AppConfig {
	stripePublishableKey: string | null;
	chatUrl: string | null;
	novuAppId: string | null;
	boostPricing: BoostPrice[];
}

export const EMPTY_APP_CONFIG: AppConfig = {
	stripePublishableKey: null,
	chatUrl: null,
	novuAppId: null,
	boostPricing: [],
};

const AppConfigContext = createContext<AppConfig>(EMPTY_APP_CONFIG);
```

In `packages/web/src/app/layout.tsx`, import `EMPTY_APP_CONFIG` with `AppConfig` and replace `getPublicConfig`:

```ts
async function getPublicConfig(): Promise<AppConfig> {
	try {
		const res = await serverFetch("/api/public/config");
		if (!res.ok) return EMPTY_APP_CONFIG;
		return { ...EMPTY_APP_CONFIG, ...(await res.json()) };
	} catch {
		return EMPTY_APP_CONFIG;
	}
}
```

- [ ] **Step 2: Rewrite the dialog's data and submit logic**

In `packages/web/src/components/listing/boost-dialog.tsx`:

Delete the `boostPrices` constant. Add, after the imports (and `import { apiErrorFrom, resolveErrorMessage } from "~/lib/apiError";` with them):

```ts
const PLAN_LABELS: Record<number, "week1" | "week2" | "month1"> = {
	7: "week1",
	14: "week2",
	30: "month1",
};
const POPULAR_DAYS = 14;
// One key per attempt: a double click replays the same checkout instead of paying twice.
const newIdempotencyKey = () => crypto.randomUUID();
```

In the component body, replace the first lines and `handleOpenChange` / `handlePay`:

```tsx
	const t = useTranslations("Boost");
	const tRoot = useTranslations();
	const { stripePublishableKey, boostPricing } = useAppConfig();
	const plans = boostPricing.filter((plan) => PLAN_LABELS[plan.days]);
	const [open, setOpen] = useState(false);
	const [duration, setDuration] = useState<BoostDuration>("14");
	const [paymentMethod, setPaymentMethod] =
		useState<PaymentMethod>("mobilemoney");
	const [error, setError] = useState<string | null>(null);
	const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
	const [isPending, startTransition] = useTransition();

	const stripeAvailable = !!stripePublishableKey;
	const price = plans.find((plan) => String(plan.days) === duration)?.amount;

	function handleOpenChange(v: boolean) {
		setOpen(v);
		if (!v) {
			setError(null);
			setDuration("14");
			setPaymentMethod("mobilemoney");
			setIdempotencyKey(newIdempotencyKey());
		}
	}

	function handlePay() {
		setError(null);
		startTransition(async () => {
			try {
				const res = await fetch("/api/public/boost", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Idempotency-Key": idempotencyKey,
					},
					credentials: "include",
					body: JSON.stringify({
						listingId,
						duration,
						provider: paymentMethod === "card" ? "stripe" : "notchpay",
					}),
				});

				if (!res.ok) {
					if (res.status === 401) {
						window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
						return;
					}
					const body = await res.json().catch(() => ({}));
					setIdempotencyKey(newIdempotencyKey());
					setError(
						resolveErrorMessage(apiErrorFrom(res.status, body), tRoot, t("genericError")),
					);
					return;
				}

				const data: BoostApiResponse = await res.json();
				if (!data.checkoutUrl) {
					setError(t("noCheckoutUrl"));
					return;
				}
				window.location.href = data.checkoutUrl;
			} catch {
				setError(t("networkError"));
			}
		});
	}
```

Delete the old `const price = boostPrices[duration];` line.

- [ ] **Step 3: Render the plans from the price list**

Replace the whole `{( [ { value: "7" … ] satisfies … ).map((plan) => { … })}` expression inside the "Plans" `div` with:

```tsx
						{plans.map((plan) => {
							const value = String(plan.days) as BoostDuration;
							const selected = duration === value;
							return (
								<label
									key={value}
									className={`relative flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition-all ${
										selected
											? "border-[#F59E0B] bg-amber-50/50 shadow-sm"
											: "border-[#E2E8F0] hover:border-[#F59E0B]/40 hover:bg-[#FFFBEB]/30"
									}`}
								>
									{plan.days === POPULAR_DAYS && (
										<span className="-top-2.5 absolute right-3 rounded-full bg-[#F59E0B] px-2 py-0.5 font-bold text-[10px] text-white">
											{t("popular")}
										</span>
									)}
									<div className="flex items-center gap-3">
										<div
											className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
												selected ? "border-[#F59E0B] bg-[#F59E0B]" : "border-[#CBD5E1]"
											}`}
										>
											{selected && <div className="h-2 w-2 rounded-full bg-white" />}
										</div>
										<input
											type="radio"
											name="boost-duration"
											value={value}
											checked={selected}
											onChange={() => setDuration(value)}
											className="sr-only"
										/>
										<div>
											<p className="font-semibold text-[#0F172A] text-sm">
												{t(PLAN_LABELS[plan.days])}
											</p>
											<p className="text-[#64748B] text-xs">
												{t("daysVisibility", { days: plan.days })}
											</p>
										</div>
									</div>
									<p className="font-bold text-[#0F172A] text-base">
										{plan.amount.toLocaleString()}{" "}
										<span className="font-medium text-[#64748B] text-xs">
											{plan.currency}
										</span>
									</p>
								</label>
							);
						})}
```

On the pay `Button`, change `disabled={isPending}` to `disabled={isPending || price === undefined}` and both `price.toLocaleString()` to `(price ?? 0).toLocaleString()`.

- [ ] **Step 4: Typecheck and lint**

Run: `cd packages/web && bun run check-types` — Expected: no errors.
Run from root: `bunx biome check --write packages/web/src/hooks/use-app-config.tsx packages/web/src/app/layout.tsx packages/web/src/components/listing/boost-dialog.tsx`

- [ ] **Step 5: Manual check**

With the API (`cd packages/api && bun run dev`) and web (`cd packages/web && bun run dev`) running against a dev database, sign in as a seller, open one of your published listings, open the boost dialog: three plans at 500, 900 and 1500 XAF. Open another seller's listing in the same session and call the API directly from the browser console:
`fetch("/api/public/boost",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({listingId:"<other seller's listing id>",duration:"7"})}).then(r=>r.json())`
Expected: `{ code: "boost.notOwner", … }`.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/hooks/use-app-config.tsx packages/web/src/app/layout.tsx packages/web/src/components/listing/boost-dialog.tsx
git commit -m "feat(web): read boost prices from the API and send an idempotency key"
```

---

### Task 11: Private seller phone numbers and the contact-phone route

**Files:**
- Create: `packages/api/src/lib/rateLimit.ts`
- Create: `packages/api/src/collections/ContactReveals.ts`
- Create: `packages/api/src/services/contactReveal.ts`
- Create: `packages/api/src/app/(frontend)/api/listings/[id]/contact-phone/route.ts`
- Modify: `packages/api/src/collections/Users.ts` (phone field access)
- Modify: `packages/api/src/payload.config.ts`
- Modify (generated): `packages/api/src/payload-types.ts`
- Test: `packages/api/tests/int/contact-reveal.int.spec.ts` (create)

**Interfaces:**
- Consumes: `selfOrStaffField`, `staffOnly`, `nobody` (Task 3); `suspensionSummary` from `access/roles.ts`; `relationId` (Task 4); error codes (Task 1).
- Produces:
  - `interface CounterStore { increment(key: string, ttlSeconds: number): Promise<number> }`; `class MemoryCounterStore`; `getCounterStore(): CounterStore`; `interface RateLimitWindow { name: string; limit: number; windowSeconds: number }`; `hitRateLimit(store, subject, windows, nowMs?): Promise<boolean>` (true when any window is over its limit)
  - `CONTACT_PHONE_LIMITS`; `class ContactRevealError { code; status }`; `revealContactPhone(payload, { listingId, viewerId, now? }, deps?: { store? }): Promise<{ phone: string }>`
  - Collection `contact-reveals` (`listing`, `seller`, `viewer`, timestamps), read by staff only. Task 13 reads it for review eligibility; Task 15 deletes a user's rows.
  - `POST /api/listings/{id}/contact-phone` → `{ phone }`, 401, 404 `listing.notFound` (missing or unpublished listing), 404 `contact.phoneUnavailable` (no phone, or seller suspended), 429 `generic.rateLimited`.

Counters use fixed windows keyed by window number, so a key never needs its TTL preserved. With `REDIS_URL` unset (local dev), an in-process store is used. A seller asking for their own number gets it without a `contact-reveals` row. Next.js resolves `app/(frontend)/api/listings/[id]/contact-phone` before Payload's `app/(payload)/api/[...slug]` catch-all, which is verified in Step 8.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/tests/int/contact-reveal.int.spec.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCounterStore, hitRateLimit } from "../../src/lib/rateLimit";
import {
	CONTACT_PHONE_LIMITS,
	revealContactPhone,
} from "../../src/services/contactReveal";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T10:00:00.000Z");
const HOUR = 3_600_000;
const later = (ms: number) => new Date(NOW.getTime() + ms);

function world(seller: Record<string, unknown> = {}) {
	return fakePayload({
		users: [{ id: "seller", phone: "+237600000001", ...seller }],
		listings: [
			{ id: "l-live", seller: "seller", status: "published" },
			{ id: "l-draft", seller: "seller", status: "draft" },
		],
	});
}

// The fake stamps createdAt with Date, so the clock follows each call's `now`.
const reveal = (
	payload: ReturnType<typeof world>,
	store: MemoryCounterStore,
	now = NOW,
	listingId = "l-live",
	viewerId = "buyer",
) => {
	vi.setSystemTime(now);
	return revealContactPhone(payload, { listingId, viewerId, now }, { store });
};

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

describe("revealContactPhone", () => {
	it("returns the phone and records one reveal per viewer and listing per day", async () => {
		const payload = world();
		const store = new MemoryCounterStore(() => NOW.getTime());

		expect(await reveal(payload, store)).toEqual({ phone: "+237600000001" });
		await reveal(payload, store, later(HOUR));
		expect(payload.store["contact-reveals"]).toHaveLength(1);
		expect(payload.store["contact-reveals"][0]).toMatchObject({
			listing: "l-live",
			seller: "seller",
			viewer: "buyer",
		});

		await reveal(payload, store, later(25 * HOUR));
		expect(payload.store["contact-reveals"]).toHaveLength(2);
	});

	it("answers listing.notFound for an unpublished or missing listing", async () => {
		const store = new MemoryCounterStore();
		await expect(reveal(world(), store, NOW, "l-draft")).rejects.toMatchObject({
			code: "listing.notFound",
			status: 404,
		});
		await expect(reveal(world(), store, NOW, "nope")).rejects.toMatchObject({ status: 404 });
	});

	it("answers contact.phoneUnavailable when the seller has no phone", async () => {
		await expect(reveal(world({ phone: null }), new MemoryCounterStore())).rejects.toMatchObject({
			code: "contact.phoneUnavailable",
			status: 404,
		});
	});

	it("hides the phone of a suspended seller", async () => {
		const payload = world({ suspendedAt: "2026-09-01T00:00:00.000Z", suspendedUntil: null });
		await expect(reveal(payload, new MemoryCounterStore())).rejects.toMatchObject({
			code: "contact.phoneUnavailable",
		});
	});

	it("gives a seller their own number without recording a reveal", async () => {
		const payload = world();
		await reveal(payload, new MemoryCounterStore(), NOW, "l-live", "seller");
		expect(payload.store["contact-reveals"] ?? []).toHaveLength(0);
	});

	it("refuses the 21st call in an hour, counting failed calls too", async () => {
		const payload = world();
		const store = new MemoryCounterStore(() => NOW.getTime());
		for (let i = 0; i < 10; i++) await reveal(payload, store);
		for (let i = 0; i < 10; i++) {
			await reveal(payload, store, NOW, "l-draft").catch(() => undefined);
		}
		await expect(reveal(payload, store)).rejects.toMatchObject({
			code: "generic.rateLimited",
			status: 429,
		});
	});

	it("refuses the 61st call in a day even when spread over hours", async () => {
		const payload = world();
		let clock = NOW.getTime();
		const store = new MemoryCounterStore(() => clock);
		for (let hour = 0; hour < 3; hour++) {
			for (let i = 0; i < 20; i++) {
				clock = NOW.getTime() + hour * HOUR + i * 1000;
				await reveal(payload, store, new Date(clock));
			}
		}
		clock = NOW.getTime() + 3 * HOUR;
		await expect(reveal(payload, store, new Date(clock))).rejects.toMatchObject({ status: 429 });
	});
});

describe("hitRateLimit", () => {
	it("keeps the published limits", () => {
		expect(CONTACT_PHONE_LIMITS).toEqual([
			{ name: "contact-phone:hour", limit: 20, windowSeconds: 3600 },
			{ name: "contact-phone:day", limit: 60, windowSeconds: 86400 },
		]);
	});

	it("starts a fresh count in the next window", async () => {
		let clock = 0;
		const store = new MemoryCounterStore(() => clock);
		const windows = [{ name: "t", limit: 1, windowSeconds: 60 }];
		expect(await hitRateLimit(store, "v", windows, clock)).toBe(false);
		expect(await hitRateLimit(store, "v", windows, clock)).toBe(true);
		clock = 61_000;
		expect(await hitRateLimit(store, "v", windows, clock)).toBe(false);
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/contact-reveal.int.spec.ts`
Expected: FAIL, cannot resolve `../../src/lib/rateLimit`.

- [ ] **Step 3: Write the rate limiter**

```ts
// packages/api/src/lib/rateLimit.ts
import { createClient, type RedisClientType } from "redis";

export interface CounterStore {
	increment(key: string, ttlSeconds: number): Promise<number>;
}

export interface RateLimitWindow {
	name: string;
	limit: number;
	windowSeconds: number;
}

export class MemoryCounterStore implements CounterStore {
	private readonly counters = new Map<string, { count: number; expiresAt: number }>();

	constructor(private readonly clock: () => number = Date.now) {}

	async increment(key: string, ttlSeconds: number): Promise<number> {
		const now = this.clock();
		const current = this.counters.get(key);
		if (!current || current.expiresAt <= now) {
			this.counters.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
			return 1;
		}
		current.count += 1;
		return current.count;
	}
}

class RedisCounterStore implements CounterStore {
	private client: RedisClientType | null = null;
	private connecting: Promise<RedisClientType> | null = null;

	constructor(private readonly url: string) {}

	private async getClient(): Promise<RedisClientType> {
		if (this.client?.isOpen) return this.client;
		this.connecting ??= (async () => {
			const client = createClient({ url: this.url }) as RedisClientType;
			client.on("error", (error) => console.error("[rate-limit] Redis error:", error));
			await client.connect();
			this.client = client;
			return client;
		})().finally(() => {
			this.connecting = null;
		});
		return this.connecting;
	}

	async increment(key: string, ttlSeconds: number): Promise<number> {
		const client = await this.getClient();
		const [count] = await client.multi().incr(key).expire(key, ttlSeconds).exec();
		return Number(count);
	}
}

let defaultStore: CounterStore | null = null;

export function getCounterStore(): CounterStore {
	defaultStore ??= process.env.REDIS_URL
		? new RedisCounterStore(process.env.REDIS_URL)
		: new MemoryCounterStore();
	return defaultStore;
}

/** Counts this call in every window; true when any window is over its limit. */
export async function hitRateLimit(
	store: CounterStore,
	subject: string,
	windows: readonly RateLimitWindow[],
	nowMs: number = Date.now(),
): Promise<boolean> {
	let limited = false;
	for (const window of windows) {
		const bucket = Math.floor(nowMs / (window.windowSeconds * 1000));
		const count = await store.increment(
			`rl:${window.name}:${subject}:${bucket}`,
			window.windowSeconds,
		);
		if (count > window.limit) limited = true;
	}
	return limited;
}
```

- [ ] **Step 4: Write the collection and the service**

```ts
// packages/api/src/collections/ContactReveals.ts
import type { CollectionConfig } from "payload";
import { nobody, staffOnly } from "../access/staff";

/** Who asked for which seller's phone. Written only by services/contactReveal.ts. */
export const ContactReveals: CollectionConfig = {
	slug: "contact-reveals",
	admin: {
		useAsTitle: "id",
		defaultColumns: ["listing", "seller", "viewer", "createdAt"],
	},
	access: {
		read: staffOnly,
		create: nobody,
		update: nobody,
		delete: nobody,
	},
	fields: [
		{ name: "listing", type: "relationship", relationTo: "listings", required: true, index: true },
		{ name: "seller", type: "relationship", relationTo: "users", required: true, index: true },
		{ name: "viewer", type: "relationship", relationTo: "users", required: true, index: true },
	],
	timestamps: true,
};
```

```ts
// packages/api/src/services/contactReveal.ts
import type { Payload } from "payload";
import { suspensionSummary } from "../access/roles";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import {
	type CounterStore,
	getCounterStore,
	hitRateLimit,
	type RateLimitWindow,
} from "../lib/rateLimit";
import { relationId } from "../lib/relationId";

export const CONTACT_PHONE_LIMITS: readonly RateLimitWindow[] = [
	{ name: "contact-phone:hour", limit: 20, windowSeconds: 3600 },
	{ name: "contact-phone:day", limit: 60, windowSeconds: 86400 },
];

const REVEAL_DEDUP_MS = 24 * 60 * 60 * 1000;

export class ContactRevealError extends Error {
	code: ErrorCode;
	status: number;

	constructor(code: ErrorCode, status: number) {
		super(code);
		this.name = "ContactRevealError";
		this.code = code;
		this.status = status;
	}
}

export async function revealContactPhone(
	payload: Payload,
	input: { listingId: string; viewerId: string; now?: Date },
	deps: { store?: CounterStore } = {},
): Promise<{ phone: string }> {
	const now = input.now ?? new Date();

	// Counted before any lookup: failed calls are enumeration attempts too.
	if (
		await hitRateLimit(
			deps.store ?? getCounterStore(),
			input.viewerId,
			CONTACT_PHONE_LIMITS,
			now.getTime(),
		)
	) {
		throw new ContactRevealError(ERROR_CODES.rateLimited, 429);
	}

	const listing = await payload
		.findByID({ collection: "listings", id: input.listingId, depth: 0, overrideAccess: true })
		.catch(() => null);
	if (!listing || listing.status !== "published") {
		throw new ContactRevealError(ERROR_CODES.listingNotFound, 404);
	}

	const sellerId = relationId(listing.seller);
	const seller = sellerId
		? await payload
				.findByID({ collection: "users", id: sellerId, depth: 0, overrideAccess: true })
				.catch(() => null)
		: null;
	const phone = typeof seller?.phone === "string" ? seller.phone.trim() : "";
	if (!seller || !sellerId || !phone || suspensionSummary(seller, now).active) {
		throw new ContactRevealError(ERROR_CODES.contactPhoneUnavailable, 404);
	}

	if (sellerId !== input.viewerId) {
		const recent = await payload.find({
			collection: "contact-reveals",
			where: {
				and: [
					{ viewer: { equals: input.viewerId } },
					{ listing: { equals: String(listing.id) } },
					{ createdAt: { greater_than: new Date(now.getTime() - REVEAL_DEDUP_MS).toISOString() } },
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		if (recent.docs.length === 0) {
			await payload.create({
				collection: "contact-reveals",
				depth: 0,
				overrideAccess: true,
				data: { listing: String(listing.id), seller: sellerId, viewer: input.viewerId },
			});
		}
	}

	return { phone };
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `bunx vitest run --config ./vitest.config.mts tests/int/contact-reveal.int.spec.ts` — Expected: PASS (9 tests).


- [ ] **Step 6: Close the phone field and register the collection**

In `packages/api/src/collections/Users.ts`, import `selfOrStaffField` from `../access/staff` and change the `phone` field to:

```ts
		{
			name: "phone",
			type: "text",
			// Buyers get a seller's number from POST /api/listings/:id/contact-phone,
			// which is rate limited and recorded; the public user document never carries it.
			access: {
				read: selfOrStaffField,
			},
		},
```

In `payload.config.ts` import `ContactReveals` and add it after `WebhookEvents`. Regenerate types:

Run: `cd packages/api && DATABASE_URI=mongodb://127.0.0.1:27017/unused PAYLOAD_SECRET=unused bun run generate:types`

- [ ] **Step 7: Write the route**

```ts
// packages/api/src/app/(frontend)/api/listings/[id]/contact-phone/route.ts
import config from "@payload-config";
import { getPayload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { ContactRevealError, revealContactPhone } from "@/services/contactReveal";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const payload = await getPayload({ config });
	const { user } = await payload.auth({ headers: request.headers });
	if (!user) return errorResponse(ERROR_CODES.unauthorized, 401);

	const { id } = await params;
	try {
		const result = await revealContactPhone(payload, {
			listingId: id,
			viewerId: String(user.id),
		});
		return Response.json(result, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		if (error instanceof ContactRevealError) {
			return errorResponse(error.code, error.status);
		}
		console.error("[contact-phone]", error);
		return errorResponse(ERROR_CODES.server, 500);
	}
}
```

- [ ] **Step 8: Manual check of the routing and the public user document**

With the API running (`cd packages/api && bun run dev`) against a dev database that has a published listing whose seller has a phone:

```bash
curl -s http://localhost:3000/api/users?limit=5 | grep -c '"phone"'
curl -s -X POST http://localhost:3000/api/listings/<listingId>/contact-phone
TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login -H 'Content-Type: application/json' -d '{"email":"<buyer email>","password":"<password>"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
curl -s -X POST -H "Authorization: JWT $TOKEN" http://localhost:3000/api/listings/<listingId>/contact-phone
```

Expected: `0`; `{"code":"generic.unauthorized",…}` (our route answered, not Payload's catch-all); `{"phone":"+237…"}`. `GET /api/users/me` with the token still shows the buyer's own phone.

- [ ] **Step 9: Typecheck, lint, commit**

Run: `bun run check-types` in `packages/api` and `packages/web` — Expected: no errors.
Run from root: `bunx biome check --write packages/api/src/lib/rateLimit.ts packages/api/src/collections/ContactReveals.ts packages/api/src/collections/Users.ts packages/api/src/services/contactReveal.ts "packages/api/src/app/(frontend)/api/listings" packages/api/src/payload.config.ts packages/api/tests/int/contact-reveal.int.spec.ts`

```bash
git add packages/api/src/lib/rateLimit.ts packages/api/src/collections/ContactReveals.ts packages/api/src/collections/Users.ts packages/api/src/services/contactReveal.ts "packages/api/src/app/(frontend)/api/listings" packages/api/src/payload.config.ts packages/api/src/payload-types.ts packages/api/tests/int/contact-reveal.int.spec.ts
git commit -m "feat(api): keep seller phones private behind a rate-limited, recorded reveal"
```

---

### Task 12: Phone reveal on web and mobile fetches the number on tap

**Files:**
- Rewrite: `packages/web/src/components/listing/phone-reveal.tsx`
- Modify: `packages/web/src/app/listing/[id]/page.tsx:550-552`
- Modify: `packages/web/messages/en.json`, `packages/web/messages/fr.json` (`Listing.showNumber`)
- Rewrite: `packages/mobile/src/components/PhoneReveal.tsx`
- Modify: `packages/mobile/app/listing/[id].tsx:658`

**Interfaces:**
- Consumes: `POST /api/listings/{id}/contact-phone` (Task 11); `apiErrorFrom`, `resolveErrorMessage`, `ApiError`, `ERROR_CODES`, `fallbackFor` (web `lib/apiError.ts`); `api`, `resolveErrorMessage` (mobile); `useAuth`, `getAuthModalParams` (mobile).
- Produces: web `<PhoneReveal listingId: string; signedIn: boolean />`; mobile `<PhoneReveal listingId: string />`.

The button is shown to every visitor who is not the seller, because the public document no longer says whether a phone exists. A seller without a phone answers 404 `contact.phoneUnavailable`, shown inline. Released app versions read `seller.phone`, now absent, and simply hide the row.

- [ ] **Step 1: Rewrite the web component**

```tsx
// packages/web/src/components/listing/phone-reveal.tsx
"use client";

import { Loader2, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
	ApiError,
	apiErrorFrom,
	ERROR_CODES,
	fallbackFor,
	resolveErrorMessage,
} from "~/lib/apiError";

interface PhoneRevealProps {
	listingId: string;
	signedIn: boolean;
}

function goToSignIn() {
	window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
}

export function PhoneReveal({ listingId, signedIn }: PhoneRevealProps) {
	const t = useTranslations("Listing");
	const tRoot = useTranslations();
	const [phone, setPhone] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function reveal() {
		if (!signedIn) return goToSignIn();
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(
				`/api/listings/${encodeURIComponent(listingId)}/contact-phone`,
				{ method: "POST", credentials: "include" },
			);
			const body = await res.json().catch(() => ({}));
			if (res.status === 401) return goToSignIn();
			if (!res.ok) {
				setError(resolveErrorMessage(apiErrorFrom(res.status, body), tRoot));
				return;
			}
			setPhone((body as { phone?: string }).phone ?? null);
		} catch {
			setError(
				resolveErrorMessage(
					new ApiError(fallbackFor(ERROR_CODES.network), 0, ERROR_CODES.network),
					tRoot,
				),
			);
		} finally {
			setLoading(false);
		}
	}

	if (phone) {
		return (
			<a
				href={`tel:${phone}`}
				className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 font-medium text-[#0F172A] text-sm transition-colors hover:bg-[#F1F5F9]"
			>
				<Phone className="h-4 w-4 text-[#16A34A]" />
				{phone}
			</a>
		);
	}

	return (
		<div className="flex flex-col gap-1">
			<Button variant="outline" className="w-full rounded-lg" onClick={reveal} disabled={loading}>
				{loading ? (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				) : (
					<Phone className="mr-2 h-4 w-4 text-[#16A34A]" />
				)}
				{t("showNumber")}
			</Button>
			{error && <p className="text-center text-red-500 text-xs">{error}</p>}
		</div>
	);
}
```

Add `"showNumber": "Show phone number"` to `Listing` in `messages/en.json` and `"showNumber": "Afficher le numéro"` in `messages/fr.json`.

In `app/listing/[id]/page.tsx`, replace

```tsx
									{!isOwner && seller?.phone && (
										<PhoneReveal phone={seller.phone} />
									)}
```

with

```tsx
									{!isOwner && seller && (
										<PhoneReveal listingId={String(listing.id)} signedIn={Boolean(authUser)} />
									)}
```

- [ ] **Step 2: Rewrite the mobile component**

```tsx
// packages/mobile/src/components/PhoneReveal.tsx
import { router, usePathname } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { useTranslation } from "@/src/lib/i18n";

interface PhoneRevealProps {
	listingId: string;
}

export function PhoneReveal({ listingId }: PhoneRevealProps) {
	const { user } = useAuth();
	const pathname = usePathname();
	const { t } = useTranslation();
	const isDark = useColorScheme() === "dark";
	const [phone, setPhone] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const colors = {
		backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
		borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
	};
	const accent = isDark ? "#3b82f6" : "#1e40af";

	const reveal = async () => {
		if (!user) {
			router.push({ pathname: "/auth/login", params: getAuthModalParams(pathname) });
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const result = await api.post<{ phone: string }>(
				`/api/listings/${encodeURIComponent(listingId)}/contact-phone`,
				{},
			);
			setPhone(result.phone);
		} catch (err) {
			setError(resolveErrorMessage(err, t));
		} finally {
			setLoading(false);
		}
	};

	if (phone) {
		return (
			<Pressable onPress={() => Linking.openURL(`tel:${phone}`)} style={[styles.btn, colors]}>
				<Text style={[styles.text, { color: accent }]}>📞 {phone}</Text>
			</Pressable>
		);
	}

	return (
		<View>
			<Pressable onPress={reveal} disabled={loading} style={[styles.btn, colors]}>
				{loading ? (
					<ActivityIndicator size="small" color={accent} />
				) : (
					<Text style={[styles.text, { color: accent }]}>📞 {t("listing.phoneReveal")}</Text>
				)}
			</Pressable>
			{error && <Text style={styles.error}>{error}</Text>}
		</View>
	);
}

const styles = StyleSheet.create({
	btn: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 8,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	text: { fontSize: 14, fontWeight: "600" },
	error: { color: "#dc2626", fontSize: 12, marginTop: 4 },
});
```

(`listing.phoneReveal` already exists in both mobile locales: "Show phone number" / "Afficher le numéro".)

In `app/listing/[id].tsx`, replace `{seller.phone && <PhoneReveal phone={seller.phone} />}` with

```tsx
							{String(user?.id ?? "") !== String(seller.id) && <PhoneReveal listingId={id} />}
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd packages/web && bun run check-types` — Expected: no errors.
Run: `cd packages/mobile && bunx tsc --noEmit` — Expected: only the pre-existing `.expo/types/router.d.ts` errors.
Run from root: `bunx biome check --write packages/web/src/components/listing/phone-reveal.tsx "packages/web/src/app/listing/[id]/page.tsx" packages/web/messages packages/mobile/src/components/PhoneReveal.tsx "packages/mobile/app/listing/[id].tsx"`

- [ ] **Step 4: Manual check on both clients**

Web (`bun run dev` in `packages/api` and `packages/web`): signed out, open a listing and click "Show phone number" → sent to `/auth/login?redirect=/listing/<id>`. Signed in as another user → the number appears as a `tel:` link. On a seller without a phone → "This seller has not shared a phone number." On your own listing → no button.

Mobile (`cd packages/mobile && bun run dev`, Expo Go or dev client, `EXPO_PUBLIC_API_URL` pointing at the dev API): same four checks; signed out opens the login modal and returns to the listing.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/listing/phone-reveal.tsx "packages/web/src/app/listing/[id]/page.tsx" packages/web/messages packages/mobile/src/components/PhoneReveal.tsx "packages/mobile/app/listing/[id].tsx"
git commit -m "feat: fetch the seller's phone on tap on web and mobile"
```

---

### Task 13: Review rules, legacy review audit and seed fix

**Files:**
- Create: `packages/api/src/services/reviewRules.ts`
- Create: `packages/api/src/services/reviewAudit.ts`
- Create: `packages/api/src/migrations/20260915_000100_p0_reviews_audit.ts`
- Modify: `packages/api/src/migrations/index.ts`
- Modify: `packages/api/src/hooks/reviews.ts`
- Modify: `packages/api/src/collections/Reviews.ts`
- Modify: `packages/api/src/seed/seedReviews.ts:32`
- Test: `packages/api/tests/int/review-rules.int.spec.ts` (create)

**Interfaces:**
- Consumes: `contact-reveals` (Task 11); `conversations.participants`; `relationId`; error codes (Task 1); `migrations` array (Task 5).
- Produces:
  - `class ReviewRuleError { code: ErrorCode; status: number }` (message = the English fallback)
  - `assertReviewAllowed(payload, { reviewerId, reviewedUserId }, req?): Promise<void>`; `haveInteracted(payload, reviewerId, reviewedUserId, req?): Promise<boolean>`
  - `enforceReviewRules: CollectionBeforeChangeHook` in `hooks/reviews.ts`; it throws `APIError(message, status, { code }, true)`, which the clients read as `errors[0].data.code` (Task 1).
  - `auditLegacyReviews(payload, req?): Promise<{ selfReviewIds: string[]; duplicateGroups: { reviewer: string; reviewedUser: string; reviewIds: string[] }[] }>`

Decisions: the rules run only for a request with a `req.user` (REST calls and the admin panel); server-side writes without a user (the seed) are trusted and keep the reviewer they pass. The unique `(reviewer, reviewedUser)` index is created by the audit migration only when no legacy duplicates exist; otherwise the migration logs every group and skips it, and the hook keeps enforcing uniqueness for new reviews until staff resolve them and a follow-up migration adds the index. The interaction check is exactly the spec's: a conversation whose participants include both users, or a `contact-reveals` row where the reviewer revealed the reviewed user's phone.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/tests/int/review-rules.int.spec.ts
// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { auditLegacyReviews } from "../../src/services/reviewAudit";
import { assertReviewAllowed } from "../../src/services/reviewRules";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("payload", () => ({
	APIError: class APIError extends Error {
		constructor(
			message: string,
			public status: number,
			public data: unknown,
			public isPublic: boolean,
		) {
			super(message);
		}
	},
}));

let enforceReviewRules: (args: any) => Promise<any>;
beforeAll(async () => {
	({ enforceReviewRules } = await import("../../src/hooks/reviews"));
});

function world(seed: Record<string, any[]> = {}) {
	return fakePayload({ reviews: [], conversations: [], "contact-reveals": [], ...seed });
}

const allowed = (payload: ReturnType<typeof world>, reviewerId = "buyer", reviewedUserId = "seller") =>
	assertReviewAllowed(payload, { reviewerId, reviewedUserId });

describe("assertReviewAllowed", () => {
	it("refuses a self-review", async () => {
		await expect(allowed(world(), "u-1", "u-1")).rejects.toMatchObject({
			code: "review.self",
			status: 400,
		});
	});

	it("refuses a second review of the same user", async () => {
		const payload = world({
			reviews: [{ id: "r-1", reviewer: "buyer", reviewedUser: "seller" }],
			conversations: [{ id: "c-1", participants: ["buyer", "seller"] }],
		});
		await expect(allowed(payload)).rejects.toMatchObject({ code: "review.duplicate", status: 409 });
	});

	it("refuses a review without any interaction", async () => {
		await expect(allowed(world())).rejects.toMatchObject({
			code: "review.noInteraction",
			status: 403,
		});
	});

	it("accepts a review after a conversation with both users", async () => {
		const payload = world({ conversations: [{ id: "c-1", participants: ["seller", "buyer"] }] });
		await expect(allowed(payload)).resolves.toBeUndefined();
	});

	it("accepts a review after the reviewer revealed the reviewed user's phone", async () => {
		const payload = world({
			"contact-reveals": [{ id: "cr-1", viewer: "buyer", seller: "seller", listing: "l-1" }],
		});
		await expect(allowed(payload)).resolves.toBeUndefined();
	});

	it("does not count the reverse reveal", async () => {
		const payload = world({
			"contact-reveals": [{ id: "cr-1", viewer: "seller", seller: "buyer", listing: "l-1" }],
		});
		await expect(allowed(payload)).rejects.toMatchObject({ code: "review.noInteraction" });
	});
});

describe("enforceReviewRules hook", () => {
	const payload = world({ conversations: [{ id: "c-1", participants: ["buyer", "seller"] }] });

	it("sets the reviewer from the signed-in user, ignoring the client's value", async () => {
		const data = await enforceReviewRules({
			operation: "create",
			data: { reviewer: "someone-else", reviewedUser: "seller", rating: 5 },
			req: { user: { id: "buyer" }, payload },
		});
		expect(data.reviewer).toBe("buyer");
	});

	it("turns a rule failure into an APIError carrying the code", async () => {
		await expect(
			enforceReviewRules({
				operation: "create",
				data: { reviewedUser: "buyer", rating: 5 },
				req: { user: { id: "buyer" }, payload },
			}),
		).rejects.toMatchObject({ status: 400, data: { code: "review.self" }, isPublic: true });
	});

	it("leaves server-side writes and updates alone", async () => {
		const seeded = { reviewer: "a", reviewedUser: "a", rating: 4 };
		expect(await enforceReviewRules({ operation: "create", data: seeded, req: { payload } })).toEqual(seeded);
		expect(
			await enforceReviewRules({ operation: "update", data: seeded, req: { user: { id: "b" }, payload } }),
		).toEqual(seeded);
	});
});

describe("auditLegacyReviews", () => {
	it("lists self-reviews and duplicate groups without deleting anything", async () => {
		const payload = world({
			reviews: [
				{ id: "r-1", reviewer: "a", reviewedUser: "b" },
				{ id: "r-2", reviewer: "a", reviewedUser: "b" },
				{ id: "r-3", reviewer: "c", reviewedUser: "c" },
				{ id: "r-4", reviewer: "a", reviewedUser: "d" },
			],
		});
		const audit = await auditLegacyReviews(payload);

		expect(audit.selfReviewIds).toEqual(["r-3"]);
		expect(audit.duplicateGroups).toEqual([
			{ reviewer: "a", reviewedUser: "b", reviewIds: ["r-1", "r-2"] },
		]);
		expect(payload.store.reviews).toHaveLength(4);
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/review-rules.int.spec.ts`
Expected: FAIL, cannot resolve `../../src/services/reviewAudit`.

- [ ] **Step 3: Write the rules and the audit**

```ts
// packages/api/src/services/reviewRules.ts
import type { Payload } from "payload";
import { ERROR_CODES, type ErrorCode, fallbackMessage } from "../lib/errors";
import type { TxReq } from "../lib/transactions";

export class ReviewRuleError extends Error {
	code: ErrorCode;
	status: number;

	constructor(code: ErrorCode, status: number) {
		super(fallbackMessage(code));
		this.name = "ReviewRuleError";
		this.code = code;
		this.status = status;
	}
}

async function exists(
	payload: Payload,
	collection: "reviews" | "conversations" | "contact-reveals",
	where: Record<string, unknown>,
	req?: TxReq,
): Promise<boolean> {
	const result = await payload.find({
		collection,
		where: where as never,
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return result.docs.length > 0;
}

/** P4 adds a completed order as a qualifying interaction. */
export async function haveInteracted(
	payload: Payload,
	reviewerId: string,
	reviewedUserId: string,
	req?: TxReq,
): Promise<boolean> {
	const talked = await exists(
		payload,
		"conversations",
		{ and: [{ participants: { equals: reviewerId } }, { participants: { equals: reviewedUserId } }] },
		req,
	);
	if (talked) return true;
	return exists(
		payload,
		"contact-reveals",
		{ and: [{ viewer: { equals: reviewerId } }, { seller: { equals: reviewedUserId } }] },
		req,
	);
}

export async function assertReviewAllowed(
	payload: Payload,
	{ reviewerId, reviewedUserId }: { reviewerId: string; reviewedUserId: string },
	req?: TxReq,
): Promise<void> {
	if (reviewerId === reviewedUserId) {
		throw new ReviewRuleError(ERROR_CODES.reviewSelf, 400);
	}
	const duplicate = await exists(
		payload,
		"reviews",
		{ and: [{ reviewer: { equals: reviewerId } }, { reviewedUser: { equals: reviewedUserId } }] },
		req,
	);
	if (duplicate) throw new ReviewRuleError(ERROR_CODES.reviewDuplicate, 409);
	if (!(await haveInteracted(payload, reviewerId, reviewedUserId, req))) {
		throw new ReviewRuleError(ERROR_CODES.reviewNoInteraction, 403);
	}
}
```

```ts
// packages/api/src/services/reviewAudit.ts
import type { Payload } from "payload";
import { relationId } from "../lib/relationId";
import type { TxReq } from "../lib/transactions";

export interface ReviewAudit {
	selfReviewIds: string[];
	duplicateGroups: { reviewer: string; reviewedUser: string; reviewIds: string[] }[];
}

/** Reports reviews the P0 rules would refuse. Deletes nothing: staff decide. */
export async function auditLegacyReviews(payload: Payload, req?: TxReq): Promise<ReviewAudit> {
	const selfReviewIds: string[] = [];
	const pairs = new Map<string, { reviewer: string; reviewedUser: string; reviewIds: string[] }>();

	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const result = await payload.find({
			collection: "reviews",
			depth: 0,
			limit: 500,
			page,
			sort: "createdAt",
			overrideAccess: true,
			req,
		});
		for (const review of result.docs) {
			const reviewer = relationId(review.reviewer);
			const reviewedUser = relationId(review.reviewedUser);
			if (!reviewer || !reviewedUser) continue;
			if (reviewer === reviewedUser) selfReviewIds.push(String(review.id));
			const key = `${reviewer}:${reviewedUser}`;
			const group = pairs.get(key) ?? { reviewer, reviewedUser, reviewIds: [] };
			group.reviewIds.push(String(review.id));
			pairs.set(key, group);
		}
		hasNextPage = Boolean(result.hasNextPage);
		page += 1;
	}

	return {
		selfReviewIds,
		duplicateGroups: [...pairs.values()].filter((group) => group.reviewIds.length > 1),
	};
}
```

- [ ] **Step 4: Write the hook and attach it**

Append to `packages/api/src/hooks/reviews.ts`:

```ts
import { APIError, type CollectionBeforeChangeHook } from "payload";
import { relationId } from "../lib/relationId";
import { assertReviewAllowed, ReviewRuleError } from "../services/reviewRules";

/**
 * The reviewer is whoever is signed in, never what the client sent. Writes
 * without a user (seed, scripts) are trusted and skip the rules.
 */
export const enforceReviewRules: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
	if (operation !== "create" || !req.user) return data;

	data.reviewer = req.user.id;
	const reviewedUserId = relationId(data.reviewedUser);
	if (!reviewedUserId) return data;

	try {
		await assertReviewAllowed(
			req.payload,
			{ reviewerId: String(req.user.id), reviewedUserId },
			req,
		);
	} catch (error) {
		if (error instanceof ReviewRuleError) {
			throw new APIError(error.message, error.status, { code: error.code }, true);
		}
		throw error;
	}
	return data;
};
```

(Put the new imports at the top of the file with the others.) In `packages/api/src/collections/Reviews.ts`, import `enforceReviewRules` alongside `updateUserRating` and add `beforeChange: [enforceReviewRules],` as the first key of `hooks`.

- [ ] **Step 5: Run the test and watch it pass**

Run: `bunx vitest run --config ./vitest.config.mts tests/int/review-rules.int.spec.ts` — Expected: PASS (10 tests).

- [ ] **Step 6: Add the audit migration**

```ts
// packages/api/src/migrations/20260915_000100_p0_reviews_audit.ts
import type { MigrateDownArgs, MigrateUpArgs, MongooseAdapter } from "@payloadcms/db-mongodb";
import { auditLegacyReviews } from "../services/reviewAudit";

const INDEX_NAME = "reviewer_1_reviewedUser_1_unique";

const reviewsCollection = (payload: MigrateUpArgs["payload"]) =>
	(payload.db as unknown as MongooseAdapter).collections.reviews.collection;

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
	const audit = await auditLegacyReviews(payload, req);

	if (audit.selfReviewIds.length > 0) {
		payload.logger.warn({
			msg: "[migration] self-reviews kept for staff review",
			reviewIds: audit.selfReviewIds,
		});
	}
	if (audit.duplicateGroups.length > 0) {
		payload.logger.warn({
			msg: "[migration] duplicate reviews kept for staff review; the unique (reviewer, reviewedUser) index is not created until they are resolved",
			groups: audit.duplicateGroups,
		});
		return;
	}

	await reviewsCollection(payload).createIndex(
		{ reviewer: 1, reviewedUser: 1 },
		{ unique: true, name: INDEX_NAME },
	);
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
	await reviewsCollection(payload).dropIndex(INDEX_NAME).catch(() => undefined);
}
```

Append to `src/migrations/index.ts`:

```ts
import * as migration_20260915_000100_p0_reviews_audit from "./20260915_000100_p0_reviews_audit";
```

and to the array:

```ts
	{
		up: migration_20260915_000100_p0_reviews_audit.up,
		down: migration_20260915_000100_p0_reviews_audit.down,
		name: "20260915_000100_p0_reviews_audit",
	},
```

- [ ] **Step 7: Keep the seed inside the new unique index**

In `packages/api/src/seed/seedReviews.ts`, change `` const pairKey = `${reviewer.id}-${reviewedUser.id}-${i}`; `` to `` const pairKey = `${reviewer.id}-${reviewedUser.id}`; `` so the seed never writes the same pair twice.

- [ ] **Step 8: Manual check of the migration and the REST error**

Using the scratch database from Task 5 Step 6 (`docker run -d --rm --name bns-p0-mongo -p 27027:27017 mongo:7`, `DATABASE_URI=mongodb://127.0.0.1:27027/bns-p0`): run `bun run payload migrate`, then

```bash
docker exec bns-p0-mongo mongosh --quiet bns-p0 --eval 'db.reviews.getIndexes().map(i => i.name)'
```

Expected: the list contains `reviewer_1_reviewedUser_1_unique`. With the API running on that database, a signed-in `POST /api/reviews` with `reviewedUser` set to your own id answers 400 with `errors[0].data.code === "review.self"`.

- [ ] **Step 9: Typecheck, lint, commit**

Run: `bun run check-types` in `packages/api` — Expected: no errors.
Run from root: `bunx biome check --write packages/api/src/services/reviewRules.ts packages/api/src/services/reviewAudit.ts packages/api/src/migrations packages/api/src/hooks/reviews.ts packages/api/src/collections/Reviews.ts packages/api/src/seed/seedReviews.ts packages/api/tests/int/review-rules.int.spec.ts`

```bash
git add packages/api/src/services/reviewRules.ts packages/api/src/services/reviewAudit.ts packages/api/src/migrations packages/api/src/hooks/reviews.ts packages/api/src/collections/Reviews.ts packages/api/src/seed/seedReviews.ts packages/api/tests/int/review-rules.int.spec.ts
git commit -m "feat(api): attribute reviews to the signed-in user and require an interaction"
```

---

### Task 14: Review clients stop sending the reviewer and show the new errors

**Files:**
- Modify: `packages/mobile/app/profile/[userId].tsx:134-139`
- Modify: `packages/web/src/components/listing/review-form.tsx`

**Interfaces:**
- Consumes: review error codes in `errors[0].data.code` (Tasks 1 and 13); web `apiErrorFrom`, `resolveErrorMessage`.
- Produces: nothing.

- [ ] **Step 1: Mobile stops sending `reviewer`**

In `app/profile/[userId].tsx`, delete the line `reviewer: user?.id,` from the `api.post("/api/reviews", …)` body. The existing `onError` already calls `resolveErrorMessage(err, t)`, which now resolves `review.*` codes. If `user` becomes unused in the file, biome reports it; it is still used for the own-profile checks, so nothing else changes.

- [ ] **Step 2: Web shows the translated error**

In `packages/web/src/components/listing/review-form.tsx`, add `import { useTranslations } from "next-intl";` and `import { apiErrorFrom, resolveErrorMessage } from "~/lib/apiError";`, add `const tRoot = useTranslations();` at the top of the component, and replace the error handling:

```tsx
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw apiErrorFrom(res.status, data);
			}
```

```tsx
		} catch (err) {
			setError(resolveErrorMessage(err, tRoot, "Failed to submit review"));
		} finally {
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd packages/web && bun run check-types`; `cd packages/mobile && bunx tsc --noEmit` — Expected: no new errors.
Run from root: `bunx biome check --write "packages/mobile/app/profile/[userId].tsx" packages/web/src/components/listing/review-form.tsx`

- [ ] **Step 4: Manual check**

On web and mobile, signed in as a user who never messaged a seller, leave a review on that seller's profile → "You can review a user only after contacting them." (French in the French UI). Message the seller once, review again → published. Review again → "You have already reviewed this user."

- [ ] **Step 5: Commit**

```bash
git add "packages/mobile/app/profile/[userId].tsx" packages/web/src/components/listing/review-form.tsx
git commit -m "fix: let the server set the reviewer and show review rule errors"
```

---

### Task 15: Payment records survive account deletion, anonymised

**Files:**
- Create: `packages/api/src/lib/redact.ts`
- Modify: `packages/api/src/services/accountDeletion.ts`
- Test: `packages/api/tests/int/account-deletion.int.spec.ts` (create)

**Interfaces:**
- Consumes: `payment-intents.customer/customerDeletedAt/reference`, `boost-payments.user/customerDeletedAt`, `webhook-events.reference/raw` (Task 3); `contact-reveals` (Task 11).
- Produces: `REDACTED = "[redacted]"`; `redactPersonalData(value: unknown): unknown` (deep copy with `email`, `name`, `phone`, `customer_email`, `customer_name`, `customer_phone`, `customer_details`, `address`, `billing_details`, `shipping_details`, `shipping` replaced); `deleteUserRelatedData` keeps its signature and its `PayloadLike` gains `update`.

Kept as transaction data (Law 2010/021 art. 32): amount, currency, provider references, status history, dates, `payloadHash`. The user's `contact-reveals` rows (as viewer or seller) are deleted with the rest of their personal data. Boost payments that paid for the user's listings but belong to another customer are left untouched. Everything else in the cascade is unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/tests/int/account-deletion.int.spec.ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REDACTED, redactPersonalData } from "../../src/lib/redact";
import { deleteUserRelatedData } from "../../src/services/accountDeletion";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("../../src/auth/oauth/providers", () => ({ createAppleClientSecretFor: vi.fn() }));
vi.mock("../../src/services/notificationProvider", () => ({
	isNotificationProviderConfigured: () => false,
	getNotificationProvider: vi.fn(),
}));

const NOW = new Date("2026-09-15T10:00:00.000Z");

function world() {
	return fakePayload({
		users: [{ id: "u-1" }, { id: "u-2" }],
		listings: [{ id: "l-1", seller: "u-1", images: [] }],
		"boost-payments": [
			{ id: "bp-1", listing: "l-1", user: "u-1", amount: 900, status: "completed" },
			{ id: "bp-2", listing: "l-9", user: "u-2", amount: 500, status: "completed" },
		],
		"payment-intents": [
			{
				id: "pi-1",
				customer: "u-1",
				reference: "PI-pi-1",
				amount: 900,
				currency: "XAF",
				providerReference: "trx.1",
				status: "succeeded",
				statusHistory: [{ status: "succeeded", source: "webhook", at: "2026-09-01T00:00:00.000Z" }],
			},
			{ id: "pi-2", customer: "u-2", reference: "PI-pi-2", amount: 500, currency: "XAF", status: "succeeded" },
		],
		"webhook-events": [
			{
				id: "we-1",
				provider: "notchpay",
				reference: "PI-pi-1",
				payloadHash: "hash-1",
				raw: {
					id: "evt_1",
					data: {
						amount: 900,
						currency: "XAF",
						customer: { email: "a@example.com", name: "Awa", phone: "+237600000001" },
					},
				},
			},
			{ id: "we-2", provider: "notchpay", reference: "PI-pi-2", payloadHash: "hash-2", raw: { data: { customer: { email: "b@example.com" } } } },
		],
		"contact-reveals": [
			{ id: "cr-1", viewer: "u-1", seller: "u-2", listing: "l-9" },
			{ id: "cr-2", viewer: "u-2", seller: "u-1", listing: "l-1" },
			{ id: "cr-3", viewer: "u-2", seller: "u-3", listing: "l-8" },
		],
	});
}

describe("redactPersonalData", () => {
	it("replaces personal keys at any depth and keeps the rest", () => {
		expect(
			redactPersonalData({
				amount: 900,
				customer: { email: "a@x", name: "A", phone: "1" },
				items: [{ customer_details: { address: "x" } }],
			}),
		).toEqual({
			amount: 900,
			customer: { email: REDACTED, name: REDACTED, phone: REDACTED },
			items: [{ customer_details: REDACTED }],
		});
	});
});

describe("deleteUserRelatedData payment retention", () => {
	let payload: ReturnType<typeof world>;

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		payload = world();
		await deleteUserRelatedData(payload as never, { id: "u-1" });
		vi.useRealTimers();
	});

	it("keeps the boost payment without its customer", () => {
		expect(payload.store["boost-payments"].find((b) => b.id === "bp-1")).toMatchObject({
			user: null,
			customerDeletedAt: NOW.toISOString(),
			amount: 900,
			status: "completed",
		});
	});

	it("keeps the intent and its history without its customer", () => {
		expect(payload.store["payment-intents"].find((i) => i.id === "pi-1")).toMatchObject({
			customer: null,
			customerDeletedAt: NOW.toISOString(),
			amount: 900,
			currency: "XAF",
			providerReference: "trx.1",
			statusHistory: [{ status: "succeeded", source: "webhook" }],
		});
	});

	it("redacts the stored webhook body and keeps its hash", () => {
		const event = payload.store["webhook-events"].find((e) => e.id === "we-1");
		expect(event?.payloadHash).toBe("hash-1");
		expect(event?.raw.data).toEqual({
			amount: 900,
			currency: "XAF",
			customer: { email: REDACTED, name: REDACTED, phone: REDACTED },
		});
	});

	it("leaves other customers' records untouched", () => {
		expect(payload.store["payment-intents"].find((i) => i.id === "pi-2")?.customer).toBe("u-2");
		expect(payload.store["boost-payments"].find((b) => b.id === "bp-2")?.user).toBe("u-2");
		expect(payload.store["webhook-events"].find((e) => e.id === "we-2")?.raw.data.customer.email).toBe(
			"b@example.com",
		);
	});

	it("deletes the user's contact reveals as viewer and as seller", () => {
		expect(payload.store["contact-reveals"].map((r) => r.id)).toEqual(["cr-3"]);
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/account-deletion.int.spec.ts`
Expected: FAIL, cannot resolve `../../src/lib/redact`.

- [ ] **Step 3: Write the redaction helper**

```ts
// packages/api/src/lib/redact.ts
export const REDACTED = "[redacted]";

const PERSONAL_KEYS = new Set([
	"email",
	"name",
	"phone",
	"customer_email",
	"customer_name",
	"customer_phone",
	"customer_details",
	"address",
	"billing_details",
	"shipping_details",
	"shipping",
]);

/** Deep copy of a provider payload with the customer's identity removed. */
export function redactPersonalData(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redactPersonalData);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				PERSONAL_KEYS.has(key) ? REDACTED : redactPersonalData(entry),
			]),
		);
	}
	return value;
}
```

- [ ] **Step 4: Change the cascade**

In `packages/api/src/services/accountDeletion.ts`:

Add to `PayloadLike`:

```ts
	update: (options: {
		collection: string;
		id: string;
		data: Record<string, unknown>;
		overrideAccess?: boolean;
	}) => Promise<unknown>;
```

Add `import { redactPersonalData } from "../lib/redact";`, turn `findAllIds` into a thin wrapper over a new `findAllDocs`:

```ts
async function findAllDocs(
	payload: PayloadLike,
	collection: string,
	where: Record<string, unknown>,
): Promise<Array<Record<string, unknown> & { id: string }>> {
	const docs: Array<Record<string, unknown> & { id: string }> = [];
	let page = 1;
	let hasNextPage = true;

	while (hasNextPage) {
		const result = await payload.find({
			collection,
			depth: 0,
			limit: 100,
			overrideAccess: true,
			page,
			where,
		});
		docs.push(...result.docs);
		hasNextPage = Boolean(result.hasNextPage);
		page = result.nextPage ?? page + 1;
	}

	return docs;
}

async function findAllIds(
	payload: PayloadLike,
	collection: string,
	where: Record<string, unknown>,
): Promise<string[]> {
	return (await findAllDocs(payload, collection, where)).map((doc) => doc.id);
}
```

and add:

```ts
/**
 * Payment records are transaction data the law requires us to keep (Law
 * 2010/021 art. 32): they lose the customer, never the amounts or references.
 * Ids are collected before any update, so paging never skips a record.
 */
async function retainPaymentRecords(payload: PayloadLike, userId: string): Promise<void> {
	const customerDeletedAt = new Date().toISOString();

	for (const id of await findAllIds(payload, "boost-payments", { user: { equals: userId } })) {
		await payload.update({
			collection: "boost-payments",
			id,
			overrideAccess: true,
			data: { user: null, customerDeletedAt },
		});
	}

	const intents = await findAllDocs(payload, "payment-intents", { customer: { equals: userId } });
	const references = intents
		.map((intent) => intent.reference)
		.filter((reference): reference is string => typeof reference === "string" && reference.length > 0);

	for (const intent of intents) {
		await payload.update({
			collection: "payment-intents",
			id: intent.id,
			overrideAccess: true,
			data: { customer: null, customerDeletedAt },
		});
	}

	if (references.length === 0) return;
	for (const event of await findAllDocs(payload, "webhook-events", { reference: { in: references } })) {
		await payload.update({
			collection: "webhook-events",
			id: event.id,
			overrideAccess: true,
			data: { raw: redactPersonalData(event.raw) as Record<string, unknown> },
		});
	}
}
```

In `deleteUserRelatedData`, replace the whole `await deleteByIds(payload, "boost-payments", …)` block with:

```ts
	await retainPaymentRecords(payload, userId);

	await deleteByIds(
		payload,
		"contact-reveals",
		await findAllIds(payload, "contact-reveals", {
			or: [{ viewer: { equals: userId } }, { seller: { equals: userId } }],
		}),
	);
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `bunx vitest run --config ./vitest.config.mts tests/int/account-deletion.int.spec.ts` — Expected: PASS (6 tests).

- [ ] **Step 6: Typecheck, lint, commit**

Run: `bun run check-types` in `packages/api` — Expected: no errors (`Users.ts` passes `req.payload`, which has `update`).
Run from root: `bunx biome check --write packages/api/src/lib/redact.ts packages/api/src/services/accountDeletion.ts packages/api/tests/int/account-deletion.int.spec.ts`

```bash
git add packages/api/src/lib/redact.ts packages/api/src/services/accountDeletion.ts packages/api/tests/int/account-deletion.int.spec.ts
git commit -m "feat(api): keep anonymised payment records when an account is deleted"
```

---
### Task 16: Escaped search filters and one pair of Meilisearch variables

**Files:**
- Modify: `packages/api/src/app/(frontend)/api/public/search/route.ts`
- Modify: `packages/api/tests/int/public-search-route.int.spec.ts`
- Modify: `packages/search-indexer/src/meilisearch.ts:1-21`
- Test: `packages/search-indexer/src/__tests__/meiliConfig.test.ts` (create)
- Modify: `docker-compose.yml`, `docker-compose.local.yml`, `deployments/docker-compose/docker-compose.yml` (search-indexer environment)

**Interfaces:**
- Produces: `resolveMeiliConfig(env?): { host: string; apiKey: string }` in the indexer, reading `MEILI_HOST` / `MEILI_MASTER_KEY` first and `MEILISEARCH_HOST` / `MEILISEARCH_API_KEY` as a one-release fallback (the Kubernetes manifests under `infra/` and `deployments/kubernetes/` still set the old names and keep working through it).

- [ ] **Step 1: Write the failing API test cases**

In `packages/api/tests/int/public-search-route.int.spec.ts`, replace the `payload` mock (the `importOriginal` load is what times out the first test) with:

```ts
vi.mock("payload", () => ({ getPayload: getPayloadMock }));
```

and add inside the `describe`:

```ts
	it("quotes a category id instead of splicing it into the filter", async () => {
		const filter = await filterFor(
			`category=${encodeURIComponent('abc" OR status = draft')}`,
		);
		expect(filter).toContain('categoryId = "abc\\" OR status = draft"');
	});

	it("quotes a location instead of splicing it into the filter", async () => {
		const filter = await filterFor(`location=${encodeURIComponent('Douala" OR x = 1')}`);
		expect(filter).toContain('location = "Douala\\" OR x = 1"');
	});
```

- [ ] **Step 2: Write the failing indexer test**

```ts
// packages/search-indexer/src/__tests__/meiliConfig.test.ts
import { describe, expect, test } from "bun:test";
import { resolveMeiliConfig } from "../meilisearch.ts";

describe("resolveMeiliConfig", () => {
	test("reads the names the API uses", () => {
		expect(
			resolveMeiliConfig({ MEILI_HOST: "http://meili:7700", MEILI_MASTER_KEY: "k" }),
		).toEqual({ host: "http://meili:7700", apiKey: "k" });
	});

	test("falls back to the old names for one release", () => {
		expect(
			resolveMeiliConfig({ MEILISEARCH_HOST: "http://old:7700", MEILISEARCH_API_KEY: "old" }),
		).toEqual({ host: "http://old:7700", apiKey: "old" });
	});

	test("prefers the new names when both are set", () => {
		expect(
			resolveMeiliConfig({
				MEILI_HOST: "http://new:7700",
				MEILISEARCH_HOST: "http://old:7700",
				MEILI_MASTER_KEY: "new",
				MEILISEARCH_API_KEY: "old",
			}),
		).toEqual({ host: "http://new:7700", apiKey: "new" });
	});

	test("defaults to a local instance", () => {
		expect(resolveMeiliConfig({})).toEqual({ host: "http://localhost:7700", apiKey: "" });
	});
});
```

- [ ] **Step 3: Run both and watch them fail**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/public-search-route.int.spec.ts`
Expected: the two new tests FAIL (`categoryId = "abc" OR status = draft"`); the previously timing-out first test now passes.
Run: `cd packages/search-indexer && bun test src/__tests__/meiliConfig.test.ts`
Expected: FAIL, `resolveMeiliConfig` is not exported.

- [ ] **Step 4: Escape the two filters**

In `search/route.ts`, replace the two interpolations with the helper already used for attribute filters:

```ts
	if (category) {
		filters.push(`categoryId = ${quoteFilterValue(category)}`);
	}
```

```ts
	if (location) {
		filters.push(`location = ${quoteFilterValue(location)}`);
	}
```

- [ ] **Step 5: Unify the indexer configuration**

Replace lines 1 to 21 of `packages/search-indexer/src/meilisearch.ts` (the two env constants and `getClient`) with:

```ts
import { MeiliSearch } from "meilisearch";

const INDEX_NAME = "listings";

/** The MEILISEARCH_* names are read for one release only, then removed. */
export function resolveMeiliConfig(
	env: Record<string, string | undefined> = process.env,
): { host: string; apiKey: string } {
	return {
		host: env.MEILI_HOST || env.MEILISEARCH_HOST || "http://localhost:7700",
		apiKey: env.MEILI_MASTER_KEY || env.MEILISEARCH_API_KEY || "",
	};
}

let client: MeiliSearch | null = null;

function getClient(): MeiliSearch {
	if (!client) {
		const { host, apiKey } = resolveMeiliConfig();
		console.log(`[search-indexer] meilisearch connecting to ${host}`);
		client = new MeiliSearch({ host, apiKey });
	}
	return client;
}
```

- [ ] **Step 6: One pair of variables in every compose file**

In the `search-indexer` service of `docker-compose.yml`, `docker-compose.local.yml` and `deployments/docker-compose/docker-compose.yml`, replace

```yaml
      MEILISEARCH_HOST: http://meilisearch:7700
      MEILISEARCH_API_KEY: ${MEILI_MASTER_KEY}
```

with

```yaml
      MEILI_HOST: http://meilisearch:7700
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
```

Run: `docker compose -f docker-compose.yml config --quiet && docker compose -f deployments/docker-compose/docker-compose.yml config --quiet` (with a throwaway `.env` providing the required variables, e.g. `MONGO_PASSWORD=x REDIS_PASSWORD=x MEILI_MASTER_KEY=x PAYLOAD_SECRET=x` exported in the shell). Expected: no output, exit 0.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `cd packages/api && bunx vitest run --config ./vitest.config.mts tests/int/public-search-route.int.spec.ts` — Expected: PASS, whole file.
Run: `cd packages/search-indexer && bun test` — Expected: PASS, all files.

- [ ] **Step 8: Typecheck, lint, commit**

Run: `bun run check-types` in `packages/api` and `packages/search-indexer` — Expected: no errors.
Run from root: `bunx biome check --write "packages/api/src/app/(frontend)/api/public/search/route.ts" packages/api/tests/int/public-search-route.int.spec.ts packages/search-indexer/src/meilisearch.ts packages/search-indexer/src/__tests__/meiliConfig.test.ts`

```bash
git add "packages/api/src/app/(frontend)/api/public/search/route.ts" packages/api/tests/int/public-search-route.int.spec.ts packages/search-indexer/src/meilisearch.ts packages/search-indexer/src/__tests__/meiliConfig.test.ts docker-compose.yml docker-compose.local.yml deployments/docker-compose/docker-compose.yml
git commit -m "fix(search): quote category and location filters and share one Meilisearch config"
```

---

### Task 17: Web dead ends

**Files:**
- Modify: `packages/web/src/app/profile/me/page.tsx:92`
- Modify: `packages/web/src/app/contact/page.tsx`
- Modify: `packages/web/src/lib/api.ts` (remove `conversationsApi`)

**Interfaces:**
- Produces: `/contact?subject=<value>` preselects the subject when `<value>` is one of the form's options (`general`, `account`, `listing`, `payment`, `report`, `bug`, `feature`, `other`).

- [ ] **Step 1: Confirm nothing imports `conversationsApi`**

Run: `grep -rn "conversationsApi" packages/web/src packages/mobile packages/api/src`
Expected: only its definition in `packages/web/src/lib/api.ts`. (If anything else appears, point it at the Payload REST routes the web messages page already uses instead of deleting it.)

- [ ] **Step 2: Remove it**

Delete the `export const conversationsApi = { … };` block from `packages/web/src/lib/api.ts`, then remove `Conversation` and `Message` from the type import at the top if nothing else in the file uses them:

Run: `grep -n "Conversation\|Message\b" packages/web/src/lib/api.ts`
Expected after the edit: no matches.

- [ ] **Step 3: Point the verification banner at the contact form**

In `packages/web/src/app/profile/me/page.tsx`, change `href="/support"` to `href="/contact?subject=account"` (P2 replaces this link with the verification flow).

In `packages/web/src/app/contact/page.tsx`, change the React import to `import { useEffect, useState } from "react";`, add above the component:

```ts
const SUBJECTS = [
	"general",
	"account",
	"listing",
	"payment",
	"report",
	"bug",
	"feature",
	"other",
] as const;
```

and inside the component, after the `useState` declarations:

```ts
	useEffect(() => {
		const subject = new URLSearchParams(window.location.search).get("subject");
		if (subject && (SUBJECTS as readonly string[]).includes(subject)) {
			setFormData((current) => (current.subject ? current : { ...current, subject }));
		}
	}, []);
```

(Read from `window.location` in an effect rather than `useSearchParams`, which would require a Suspense boundary around this client page.)

- [ ] **Step 4: Typecheck, lint, manual check**

Run: `cd packages/web && bun run check-types` — Expected: no errors.
Run from root: `bunx biome check --write packages/web/src/app/profile/me/page.tsx packages/web/src/app/contact/page.tsx packages/web/src/lib/api.ts`
Manual: signed in as an unverified user, open `/profile/me`, click "Contact support" → `/contact` opens with "Account issue" selected.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/profile/me/page.tsx packages/web/src/app/contact/page.tsx packages/web/src/lib/api.ts
git commit -m "fix(web): send the verification banner to the contact form and drop dead conversation client code"
```

---

### Task 18: MongoDB single-node replica set in compose, and the transaction probe in CI

**Files:**
- Create: `packages/api/src/scripts/transactionProbe.ts`
- Modify: `docker-compose.yml`, `docker-compose.local.yml`, `deployments/docker-compose/docker-compose.yml` (mongodb service, api `DATABASE_URI`)
- Modify: `.env.example`, `deployments/docker-compose/.env.example`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `withTransaction` semantics (Task 4); `tags` and `webhook-events` collections.
- Produces: `MONGO_KEYFILE_PATH` (default `./mongo-keyfile`, relative to the compose file); `DATABASE_URI` default gains `&replicaSet=rs0`; CI job `mongo-transactions`.

Do not push this task's commit to `dev` before Task 20 Steps 1 to 4 have been done on the staging host: CI copies `deployments/docker-compose/docker-compose.yml` to staging on every push to `dev`, and `mongod` refuses to start without the key file, then stays unhealthy until `rs.initiate` has run.

- [ ] **Step 1: Write the probe**

```ts
// packages/api/src/scripts/transactionProbe.ts
/**
 * Proves multi-document transactions are live: writes to two collections in
 * one transaction, aborts it, and checks that neither write survived.
 *
 * Usage (from packages/api): bun run src/scripts/transactionProbe.ts
 * Exits 1 when DATABASE_URI has no replicaSet (transactions disabled) or when
 * an aborted write is visible.
 */
import { randomUUID } from "node:crypto";
import { getPayload } from "payload";
import config from "../payload.config";

const payload = await getPayload({ config });
const marker = `tx-probe-${randomUUID()}`;

const transactionID = await payload.db.beginTransaction();
if (!transactionID) {
	payload.logger.error("Transactions are disabled: DATABASE_URI has no replicaSet option.");
	process.exit(1);
}

const req = { transactionID };
try {
	await payload.create({
		collection: "tags",
		data: { name: marker, slug: marker },
		overrideAccess: true,
		req,
	});
	await payload.create({
		collection: "webhook-events",
		data: {
			provider: "notchpay",
			providerEventId: marker,
			type: "transaction-probe",
			payloadHash: marker,
			raw: {},
			receivedAt: new Date().toISOString(),
			attempts: 0,
		},
		overrideAccess: true,
		req,
	});
} finally {
	await payload.db.rollbackTransaction(transactionID);
}

const leaked =
	(await payload.count({ collection: "tags", where: { slug: { equals: marker } }, overrideAccess: true })).totalDocs +
	(await payload.count({
		collection: "webhook-events",
		where: { providerEventId: { equals: marker } },
		overrideAccess: true,
	})).totalDocs;

if (leaked > 0) {
	payload.logger.error(`Transaction probe failed: ${leaked} aborted write(s) are visible.`);
	process.exit(1);
}
payload.logger.info("Transaction probe passed: the aborted writes left no trace.");
process.exit(0);
```

- [ ] **Step 2: Run the probe against a standalone and a replica set (it must fail, then pass)**

```bash
docker run -d --rm --name bns-probe-standalone -p 27028:27017 mongo:7
cd packages/api
DATABASE_URI=mongodb://127.0.0.1:27028/probe PAYLOAD_SECRET=dev bun run src/scripts/transactionProbe.ts; echo "exit=$?"
docker stop bns-probe-standalone

docker run -d --rm --name bns-probe-rs -p 27029:27017 mongo:7 --replSet rs0 --bind_ip_all --port 27017
until docker exec bns-probe-rs mongosh --quiet --eval 'db.adminCommand("ping").ok' >/dev/null 2>&1; do sleep 1; done
docker exec bns-probe-rs mongosh --quiet --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })'
until docker exec bns-probe-rs mongosh --quiet --eval 'rs.status().myState' | grep -qx 1; do sleep 1; done
DATABASE_URI="mongodb://127.0.0.1:27029/probe?replicaSet=rs0&directConnection=true" PAYLOAD_SECRET=dev bun run src/scripts/transactionProbe.ts; echo "exit=$?"
docker stop bns-probe-rs
```

Expected: first run logs "Transactions are disabled" and `exit=1`; second logs "Transaction probe passed" and `exit=0`. (`directConnection=true` only because the member is advertised as `localhost:27017` inside the container while the host maps port 27029; if the driver refuses the combination, map `-p 27017:27017` and drop both the port change and `directConnection`.)

- [ ] **Step 3: Replica set in the three compose files**

In the `mongodb` service of `docker-compose.yml`, `docker-compose.local.yml` and `deployments/docker-compose/docker-compose.yml`, add a `command`, the key file mount and replace the healthcheck (keep `image`, `restart`, `environment`, `networks` as they are):

```yaml
    # Single-node replica set: required for multi-document transactions.
    # The key file is mandatory with authentication; create it once on the host
    # (see docs/superpowers/plans/2026-09-15-p0-foundations.md, Task 20).
    command: ["mongod", "--replSet", "rs0", "--keyFile", "/data/keyfile/mongo-keyfile", "--bind_ip_all"]
    volumes:
      - mongo_data:/data/db
      - ${MONGO_KEYFILE_PATH:-./mongo-keyfile}:/data/keyfile/mongo-keyfile:ro
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "mongosh --quiet -u \"$${MONGO_INITDB_ROOT_USERNAME}\" -p \"$${MONGO_INITDB_ROOT_PASSWORD}\" --authenticationDatabase admin --eval 'quit(db.adminCommand(\"ping\").ok === 1 && rs.status().ok === 1 ? 0 : 1)'",
        ]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s
```

In the `api` service of the same three files, change the `DATABASE_URI` default to end with `?authSource=admin&replicaSet=rs0`:

```yaml
      DATABASE_URI: ${DATABASE_URI:-mongodb://${MONGO_USER:-bns}:${MONGO_PASSWORD}@mongodb:27017/${MONGO_DB:-bns}?authSource=admin&replicaSet=rs0}
```

(`replicaSet=rs0` is the switch that turns Payload transactions on; removing it from `DATABASE_URI` is the first rollback level.)

- [ ] **Step 4: Declare the key file path and keep the key out of git**

Add to `.env.example`, under `# MongoDB`, and to `deployments/docker-compose/.env.example`, under the MongoDB section:

```
# Replica-set key file (openssl rand -base64 756, mode 400, owner 999:999)
MONGO_KEYFILE_PATH=./mongo-keyfile
```

In `deployments/docker-compose/.env.example`, change the commented example to `# DATABASE_URI=mongodb://bns:password@mongodb:27017/bns?authSource=admin&replicaSet=rs0`.

Append to `.gitignore`:

```
# MongoDB replica-set key file
mongo-keyfile
```

Run: `MONGO_PASSWORD=x REDIS_PASSWORD=x MEILI_MASTER_KEY=x PAYLOAD_SECRET=x docker compose -f deployments/docker-compose/docker-compose.yml config | grep -E "replSet|keyfile|replicaSet"`
Expected: the `command`, the key file bind mount and the `DATABASE_URI` with `replicaSet=rs0`.

- [ ] **Step 5: Bring the local compose stack up as a replica set (manual verification)**

```bash
openssl rand -base64 756 > mongo-keyfile
chmod 400 mongo-keyfile
sudo chown 999:999 mongo-keyfile
docker compose -f docker-compose.local.yml up -d mongodb
docker compose -f docker-compose.local.yml exec mongodb sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "rs.initiate({ _id: \"rs0\", members: [{ _id: 0, host: \"mongodb:27017\" }] })"'
docker compose -f docker-compose.local.yml ps mongodb
```

Expected: `rs.initiate` answers `{ ok: 1 }` and, within a minute, `mongodb` is `healthy`. (Use this only if you run the local compose stack; the key file stays untracked.)

- [ ] **Step 6: Add the CI job**

Append to `jobs:` in `.github/workflows/ci.yml`:

```yaml
  mongo-transactions:
    name: Mongo transaction probe
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Start a single-node replica set
        run: |
          docker run -d --name mongo -p 27017:27017 mongo:7 --replSet rs0 --bind_ip_all
          for i in $(seq 1 30); do
            docker exec mongo mongosh --quiet --eval 'db.adminCommand("ping").ok' && break
            sleep 1
          done
          docker exec mongo mongosh --quiet --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })'
          for i in $(seq 1 30); do
            docker exec mongo mongosh --quiet --eval 'rs.status().myState' | grep -qx 1 && break
            sleep 1
          done

      - name: Run the transaction probe
        working-directory: packages/api
        env:
          DATABASE_URI: mongodb://localhost:27017/bns-ci?replicaSet=rs0
          PAYLOAD_SECRET: ci-transaction-probe
        run: bun run src/scripts/transactionProbe.ts
```

- [ ] **Step 7: Lint and commit (do not push to `dev` yet)**

Run from root: `bunx biome check --write packages/api/src/scripts/transactionProbe.ts`
Run: `cd packages/api && bun run check-types` — Expected: no errors.

```bash
git add packages/api/src/scripts/transactionProbe.ts docker-compose.yml docker-compose.local.yml deployments/docker-compose/docker-compose.yml .env.example deployments/docker-compose/.env.example .gitignore .github/workflows/ci.yml
git commit -m "feat(infra): run MongoDB as a single-node replica set and probe transactions in CI"
```

---

### Task 19: Full verification before staging

**Files:** none changed unless a check fails (fix in the task that owns the file, then re-run).

- [ ] **Step 1: Types**

```bash
cd packages/api && DATABASE_URI=mongodb://127.0.0.1:27017/unused PAYLOAD_SECRET=unused bun run generate:types && git diff --exit-code src/payload-types.ts
cd packages/api && bun run check-types
cd packages/web && bun run check-types
cd packages/search-indexer && bun run check-types
cd packages/mobile && bunx tsc --noEmit
```

Expected: `payload-types.ts` already up to date (no diff); no errors except the pre-existing mobile `.expo/types/router.d.ts` ones.

- [ ] **Step 2: Tests**

```bash
cd packages/api && bunx vitest run --config ./vitest.config.mts
cd packages/mobile && bun test
cd packages/search-indexer && bun test
```

Expected: every new file passes. The only acceptable API failures are the pre-existing ones still untouched by this plan: `api.int.spec.ts`, `listings-before-change.int.spec.ts`, `public-categories-route.int.spec.ts` (`boost-callback-route` and `public-search-route` were rewritten and now pass).

- [ ] **Step 3: Lint**

Run from root: `bunx biome check $(git diff --name-only dev...HEAD | grep -E '\.(ts|tsx|json)$')`
Expected: no errors.

- [ ] **Step 4: Local soak with transactions on**

Start a local replica set (the `bns-probe-rs` commands of Task 18 Step 2, on port 27017 with `-p 27017:27017` and without `directConnection`), then run the API against it with `DATABASE_URI="mongodb://127.0.0.1:27017/bns-soak?replicaSet=rs0"` and the web app. Seed (`cd packages/api && bun run seed`), then: create and edit a listing, approve and reject from the moderation queue, suspend and unsuspend a user, reveal a phone, post a review after a conversation, delete a test account that has a boost payment, and buy a boost with the NotchPay sandbox keys. Expected: every action succeeds; the API log shows no `WriteConflict`, `Transaction` or `NoSuchTransaction` errors; the deleted account's boost payment and intent are still in the admin panel with an empty customer.

- [ ] **Step 5: Open the pull request into `dev`**

Push the branch and open the PR. Task 18 no longer gates the merge: as implemented, the replica set is off unless a host sets `MONGO_REPLICA_SET`, so the deployed compose file keeps running the standalone `mongod` it runs today. The first deploy after the merge does recreate the `mongodb` container (its `command`, volumes and healthcheck changed), which is a restart of a few seconds.

---

### Task 20: Staging replica-set runbook (manual verification)

Run on the staging host, in `$STAGING_PATH` (the directory CI deploys into). The staging `.env` already defines `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB`.

The operator-facing version of this, with the prerequisites, the downtime, the failure modes and the rollback, is `docs/superpowers/plans/2026-09-15-p0-mongo-replica-set-runbook.md`. The steps below are the staging pass of it.

- [ ] **Step 1: Back up, off the host**

```bash
cd "$STAGING_PATH"
docker compose exec -T mongodb sh -c 'mongodump --archive --gzip -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > "bns-staging-$(date +%Y%m%d-%H%M).archive.gz"
ls -lh bns-staging-*.archive.gz
```

From your workstation: `scp <staging>:"$STAGING_PATH"/bns-staging-*.archive.gz .` Expected: a non-empty archive on both machines.

- [ ] **Step 2: Create the key file**

```bash
openssl rand -base64 756 > mongo-keyfile
chmod 400 mongo-keyfile
sudo chown 999:999 mongo-keyfile
ls -l mongo-keyfile
```

Expected: `-r-------- 1 999 999 … mongo-keyfile`.

- [ ] **Step 3: Turn the switch on and initiate the replica set**

From your workstation: `scp deployments/docker-compose/docker-compose.yml <staging>:"$STAGING_PATH"/docker-compose.yml` (the branch version). The compose file alone changes nothing: `mongod` stays standalone until `MONGO_REPLICA_SET` is set, so `rs.initiate` would fail on a standalone if you skipped this.

Set the two variables as **GitHub repository or `staging` environment variables** — `MONGO_REPLICA_SET=rs0` and `MONGO_KEYFILE_PATH=./mongo-keyfile` — because the deploy job rewrites the host `.env` from GitHub on every push to `dev`. To finish the window now, write the same two lines into the host `.env` as well; the GitHub variables are what keeps them there.

The site is down from the restart below until `rs.initiate` has run: `api` and `mongo-express` wait on `mongodb` being healthy, and a replica-set member with no configuration is deliberately unhealthy. Run the commands back to back. A deploy that happens to run inside that gap goes red; that is expected, re-run it afterwards.

```bash
docker compose config | grep -E "replSet|keyfile|replicaSet="
docker compose up -d mongodb
docker compose exec mongodb sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "rs.initiate({ _id: \"rs0\", members: [{ _id: 0, host: \"mongodb:27017\" }] })"'
docker compose exec mongodb sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "rs.status().members[0].stateStr"'
docker compose ps mongodb
```

Expected: the `config` line shows `--replSet rs0`, the key file bind mount and a `DATABASE_URI` ending in `&replicaSet=rs0`; then `{ ok: 1 }`, `PRIMARY`, and `healthy` within a minute. `rs.initiate` is run once per host, ever.

- [ ] **Step 4: Restart the services that use the database**

```bash
docker compose up -d api chat-service search-indexer
docker compose exec api printenv DATABASE_URI | grep -c "replicaSet=rs0"
docker compose logs --since 5m api | grep -Ei "migration|error" | head -50
```

Expected: `1` and no connection errors. The two P0 migrations ran when the P0 images first reached staging (Tasks 1 to 17): check in that deploy's log that `boost payment intents backfilled` reported `created` equal to the number of legacy boost payments, and note any review groups listed for staff.

- [ ] **Step 5: Transaction probe (runbook step 4)**

```bash
docker compose exec mongodb sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin "$MONGO_INITDB_DATABASE" --eval "
const marker = \"tx-probe-\" + Date.now();
const session = db.getMongo().startSession();
const sdb = session.getDatabase(db.getName());
session.startTransaction();
sdb.tx_probe_a.insertOne({ marker });
sdb.tx_probe_b.insertOne({ marker });
session.abortTransaction();
const leaked = db.tx_probe_a.countDocuments({ marker }) + db.tx_probe_b.countDocuments({ marker });
db.tx_probe_a.drop(); db.tx_probe_b.drop();
print(leaked === 0 ? \"PROBE OK\" : \"PROBE FAILED: \" + leaked);
"'
```

Expected: `PROBE OK`. (The API image is a Next.js standalone build without `src/scripts`, so the database-level probe runs here; the Payload-level probe runs in CI.)

- [ ] **Step 6: Media, search and a sandbox boost (runbook step 5)**

`verify-media.sh` does not exist in the repository; check media directly:

```bash
MEDIA_URL=$(curl -s "https://$API_DOMAIN/api/media?limit=1&depth=0" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p' | head -1)
curl -sI "$MEDIA_URL" | head -1
curl -s "https://$API_DOMAIN/api/public/search?q=a&limit=1" | head -c 300; echo
```

Expected: `HTTP/2 200` (prefix `https://$API_DOMAIN` if the URL is relative) and a JSON search answer with `hits`.

Then, in the staging web app with NotchPay sandbox keys: boost one of your published listings, pay in the sandbox, come back. Expected: the listing shows as boosted; in the admin panel the intent is `succeeded` with history entries from `callback` and/or `webhook`, its `webhook-events` row has `processedAt` set, and `boost-payments` is `completed`. Buy a second boost on the same listing: `boostedUntil` moves forward by the new duration instead of restarting.

- [ ] **Step 7: Soak**

For at least 24 hours on staging: create and edit listings, run moderation actions, delete a test account that has a boost payment, reveal phones, post reviews. Check daily: `docker compose logs --since 24h api | grep -Ei "WriteConflict|NoSuchTransaction|TransientTransactionError|payment.amountMismatch"`. Expected: no matches, or matches you have explained.

- [ ] **Step 8: Confirm the next deploy is uneventful**

Task 18's commit no longer waits on this runbook — it can be merged before any of it. What to confirm here is the first `dev` push after the switch was turned on: the deploy rewrites the host `.env` from the GitHub variables, so `MONGO_REPLICA_SET=rs0` must survive it. Expected: CI green, `docker compose exec api printenv DATABASE_URI` still ends in `&replicaSet=rs0`, `docker compose ps` all healthy.

Rollback, if needed at any step:
- Transactions only: empty `MONGO_REPLICA_SET` in the GitHub variables **and** in the host `.env` (editing only the host `.env` is undone by the next deploy, which rewrites it from GitHub), then `docker compose up -d mongodb api chat-service search-indexer`. `mongod` comes back standalone with the data intact; the replica-set configuration stays in the `local` database and a later re-enable does not need a second `rs.initiate`.
- Full: as a last resort, `mongorestore --archive --gzip --drop` from the Step 1 archive. The compose file itself does not need reverting — with the switch empty it renders the standalone service it rendered before.

---

### Task 21: Production replica-set rollout (manual, maintenance window)

Run only after Task 20 passed. Production deploys on a `v*` tag; CI copies `deployments/docker-compose/docker-compose.yml` to `$DEPLOY_PATH` and runs `docker compose up -d`.

- [ ] **Step 1: Announce the window and back up**

Same commands as Task 20 Step 1 in `$DEPLOY_PATH`, archive named `bns-prod-…`, copied off the host and checked with `mongorestore --archive --gzip --dryRun` on your workstation.

- [ ] **Step 2: Key file and replica set**

Task 20 Steps 2 and 3 in `$DEPLOY_PATH`, with the compose file from the release commit, with one difference: no job rewrites the production `.env`, so the switch goes into that file directly (`MONGO_REPLICA_SET=rs0`, `MONGO_KEYFILE_PATH=./mongo-keyfile`) and stays there. Same downtime as on staging — `api` and `mongo-express` are down from the `mongodb` restart until `rs.initiate` has run, so this belongs inside the announced window. Expected: `PRIMARY`, `healthy`.

- [ ] **Step 3: Release**

Tag the release from `main` after merging `dev` (`git tag vX.Y.Z && git push origin vX.Y.Z`). CI deploys the P0 images; the API applies the two migrations on startup. Then run Task 20 Step 4 (`replicaSet=rs0` present, migration log lines, no errors).

- [ ] **Step 4: Probe and smoke checks**

Task 20 Step 5 (expect `PROBE OK`) and the media and search checks of Task 20 Step 6. For payments, start a boost purchase on a staff-owned listing up to the NotchPay checkout page without paying: the intent is `pending` with a `checkoutUrl`, and the reconciliation job expires it after 24 hours. Confirm `GET /api/users?limit=5` contains no `phone` field.

- [ ] **Step 5: Hand the review audit to staff**

From the API log of the first start, copy the `[migration] self-reviews kept for staff review` and `[migration] duplicate reviews kept for staff review` entries into a ticket for the moderation team. When they have resolved the duplicates, a follow-up migration creates the unique index (the one in `20260915_000100_p0_reviews_audit.ts` skipped it).

Rollback: the two levels of Task 20 apply in `$DEPLOY_PATH`, with the switch emptied in the production `.env` alone — there are no GitHub variables to undo here.

---

## Spec decisions made in this plan

These points were ambiguous or under-specified in the spec; the tasks above encode the choice.

1. **`verifyPayment` shape.** It returns `NormalizedPayment` (no `providerEventId` or `type`, which only exist for events). `PaymentProvider` also gains `parseWebhookEvent(raw)` so the job can re-normalise a stored, already verified body without the signature.
2. **Required fields that deletion nulls.** `payment-intents.customer` and `boost-payments.user` are optional in the schema, because account deletion sets them to null; the services always set them on creation. `boost-payments.paymentIntent` is likewise enforced by the purchase service, not the schema, because legacy rows exist until the migration runs.
3. **`PI-{id}` reference.** The intent is created without `reference`, then updated to `PI-{id}` in the same transaction; `reference` is unique and sparse.
4. **Idempotency key.** Client-supplied through an `Idempotency-Key` header, scoped as `boost:{userId}:{key}`; replaying a pending intent returns its checkout, replaying any other state is a 409 `generic.validation`. Without a header the key is random (recorded, not deduplicating). The web dialog sends a fresh key per attempt.
5. **`created` intents receiving a provider report** walk through `pending` (both steps recorded) instead of being refused.
6. **Success on an already closed intent** (`failed`, `cancelled`, `expired`) is recorded in history and logged as an error for staff; the status does not change. A missing amount counts as a mismatch.
7. **Unknown reference in a webhook** marks the event processed and logs a warning; it is not retried.
8. **Webhook queue failure** after the event is stored answers 500; the provider's retry is a duplicate, and reconciliation settles the intent from the provider's API.
9. **`webhook-events.reference`** is an extra indexed field, so account deletion can find the events of a customer's intents to redact them.
10. **Legacy pending boost payments older than 24 hours** become `expired` intents and their boost payment is set to `failed`, to keep the mirror rule.
11. **Reviews unique index.** The hook enforces uniqueness for new reviews; the audit migration creates the unique index only when no legacy duplicates exist, otherwise it logs them for staff and skips it.
12. **Review rules apply only when `req.user` exists** (REST and admin panel). The seed and scripts write reviews without a user and are trusted; the seed was fixed so it never writes the same pair twice.
13. **Conversation interaction** is taken literally from the spec: any conversation whose participants include both users. Strengthening conversation and message checks is left to P3, as instructed.
14. **Contact-phone errors.** Missing or unpublished listing → 404 `listing.notFound`; no phone or suspended seller → 404 `contact.phoneUnavailable`; a seller asking for their own number gets it without a reveal row. Rate-limit counters live in Redis when `REDIS_URL` is set and in process memory otherwise.
15. **Phone button visibility.** Because the public document no longer says whether a phone exists, the reveal button is shown to every non-owner; a seller without a phone produces the `contact.phoneUnavailable` message inline.
16. **`contact-reveals` on account deletion.** A deleted user's rows (as viewer or seller) are deleted with the rest of their personal data; the spec's "everything else unchanged" refers to the existing cascade.
17. **Redaction** replaces `email`, `name`, `phone`, `customer_email`, `customer_name`, `customer_phone`, `customer_details`, `address`, `billing_details`, `shipping_details`, `shipping` at any depth of the stored webhook body; `payloadHash` is kept.
18. **`payment.amountMismatch`** is added to the API catalogue only; it never reaches a client, so no client translation.
19. **Contact prefill** uses the existing `account` subject.
20. **Compose files.** All three compose files change (`docker-compose.yml`, `docker-compose.local.yml`, and `deployments/docker-compose/docker-compose.yml`, which is the one CI deploys). The Kubernetes manifests are left as they are; the indexer's fallback keeps their old variable names working for one release.
21. **Runbook probe and media check.** The staging and production probe runs in `mongosh` inside the `mongodb` container (the API image has no scripts); the Payload-level probe runs in CI. `verify-media.sh` does not exist in the repository, so the runbook checks a media URL with `curl`.
22. **Job scheduling.** Webhook processing and reconciliation run on a new `payments` queue, auto-run every minute; reconciliation itself is scheduled every 15 minutes.
