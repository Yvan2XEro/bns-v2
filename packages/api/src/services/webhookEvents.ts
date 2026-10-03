import { createHash } from "node:crypto";
import type { Payload } from "payload";
import { getPaymentSettings } from "../lib/paymentSettings";
import { getProvider } from "../lib/payments";
import type { MarketplaceProvider } from "../lib/payments/marketplace";
import { getMarketplaceProvider } from "../lib/payments/marketplaceRegistry";
import {
	isRecord,
	type NormalizedWebhookEvent,
	type PaymentProvider,
	type ProviderName,
} from "../lib/payments/types";
import { isRetainedWebhookRaw, retainedWebhookRaw } from "../lib/redact";
import type { PaymentIntent, WebhookEvent } from "../payload-types";
import { dispatchMarketplaceEvent } from "./marketplaceEvents";
import { findIntentByReference, settlePayment } from "./payments";

const COLLECTION = "webhook-events" as const;

export function hashPayload(rawBody: string): string {
	return createHash("sha256").update(rawBody).digest("hex");
}

/**
 * The account-deletion sweep passes over an intent's stored bodies exactly
 * once, while the intent still names its customer. An event recorded — or
 * processed — after that point is the one thing the sweep can never come back
 * for, so its body is rebuilt through the same `retainedWebhookRaw` path on
 * the spot instead of being kept as the provider sent it, customer object
 * included.
 */
async function intentFor(
	payload: Payload,
	event: { providerTransactionId?: string | null; reference?: string | null },
): Promise<PaymentIntent | null> {
	return findIntentByReference(payload, {
		reference: event.reference,
		providerReference: event.providerTransactionId,
	}).catch(() => null);
}

/**
 * The fields this recorder actually reads off an event, kept apart from
 * `NormalizedWebhookEvent` (amount, currency, a payment status) because a
 * non-payment vendor — `didit`, processed by its own job — has none of
 * those. A payment provider's normalized event still satisfies this
 * structurally, so every existing caller is unaffected.
 */
export interface WebhookEventFields {
	providerEventId: string;
	type: string;
	reference?: string | null;
	providerTransactionId?: string | null;
	/** A marketplace event's entity; absent on a P0 payment event. */
	entity?: string;
}

/** Spread so the rebuilt body satisfies the json field's index signature. */
function redactedBody(provider: string, raw: unknown): WebhookEvent["raw"] {
	return { ...retainedWebhookRaw(provider, raw) };
}

/**
 * `webhook-events.provider` also carries vendor names that are not payment
 * providers (`didit`, processed by its own job). This job settles payments
 * only, so a non-payment provider reaching it is misrouted, not a payment
 * outcome to normalise.
 */
function isPaymentProvider(
	provider: WebhookEvent["provider"],
): provider is ProviderName {
	return provider === "notchpay" || provider === "stripe";
}

export interface RecordWebhookEventInput {
	provider: WebhookEvent["provider"];
	event: WebhookEventFields;
	raw: unknown;
	rawBody: string;
	receivedAt?: Date;
}

export async function recordWebhookEvent(
	payload: Payload,
	input: RecordWebhookEventInput,
): Promise<{ id: string; duplicate: boolean }> {
	const payloadHash = hashPayload(input.rawBody);
	const providerEventId =
		input.event.providerEventId || `sha256:${payloadHash}`;

	const findExisting = async (): Promise<WebhookEvent | undefined> => {
		const result = await payload.find({
			collection: COLLECTION,
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

	// An event that resolves to no intent at all is the same hole seen from the
	// other end: both row keys are empty (every Stripe event outside
	// `checkout.session.*` carries neither our reference nor a session id) so
	// the deletion sweep can never find it, and no customer is named to
	// trigger one. `charge.*` and `payment_intent.*` bodies carry
	// `receipt_email` and `billing_details`, so an unlinkable body is stored in
	// the retained shape from the start. The row itself — provider, event id,
	// hash, timestamps — is kept whole; only the body is rebuilt, and a
	// reference that becomes resolvable later survives it, so a late-settling
	// intent still processes.
	//
	// A non-payment vendor never resolves to a payment intent and its body was
	// never shaped for `retainedWebhookRaw`'s payment parsers, so it is kept
	// as verified instead of run through them: the webhook route (not this
	// function) passes only what `verifyWebhook` itself parsed and checked the
	// signature over as `input.raw`, so `didit`'s stored body carries only a
	// session id, a status and an event id (`lib/kyc/didit.ts`'s
	// `diditWebhookEventSchema`), never a document number or a birth date.
	// Those rows are removed outright when the account behind them is deleted
	// (`lib/verificationRetention.ts`'s `deleteDiditWebhookEvents`), unlike a
	// payment record, which the law requires kept.
	// A refund, transfer, account or debit event is not a payment body:
	// `retainedWebhookRaw` would rebuild it as one and lose the very fields
	// its applier reads.
	const paymentBody =
		isPaymentProvider(input.provider) &&
		(input.event.entity ?? "payment") === "payment";
	const intent = paymentBody ? await intentFor(payload, input.event) : null;
	const raw = !paymentBody
		? isRecord(input.raw)
			? input.raw
			: undefined
		: !intent || intent.customerDeletedAt
			? redactedBody(input.provider, input.raw)
			: isRecord(input.raw)
				? input.raw
				: undefined;

	try {
		const created = await payload.create({
			collection: COLLECTION,
			depth: 0,
			overrideAccess: true,
			data: {
				provider: input.provider,
				providerEventId,
				type: input.event.type,
				reference: input.event.reference || undefined,
				providerReference: input.event.providerTransactionId || undefined,
				payloadHash,
				raw,
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

/**
 * The marketplace provider that signed rows stored under `provider`, or null
 * when the row is P0's (a P0 provider, or no adapter registered in
 * production). The registry's provider in this environment is the only one
 * whose wire shape a marketplace row can be parsed back with.
 */
export async function marketplaceProviderFor(
	payload: Payload,
	provider: WebhookEvent["provider"],
): Promise<MarketplaceProvider | null> {
	try {
		const marketplace = getMarketplaceProvider(
			await getPaymentSettings(payload),
		);
		return marketplace.id === provider ? marketplace : null;
	} catch {
		return null;
	}
}

export interface ProcessWebhookDeps {
	getProvider: (name: ProviderName) => PaymentProvider;
	marketplaceFor: (
		payload: Payload,
		provider: WebhookEvent["provider"],
	) => Promise<MarketplaceProvider | null>;
}

const DEFAULT_DEPS: ProcessWebhookDeps = {
	getProvider,
	marketplaceFor: marketplaceProviderFor,
};

export async function processWebhookEvent(
	payload: Payload,
	eventId: string,
	deps: Partial<ProcessWebhookDeps> = {},
): Promise<{ outcome: string }> {
	const { getProvider: p0Provider, marketplaceFor } = {
		...DEFAULT_DEPS,
		...deps,
	};
	const event = await payload.findByID({
		collection: COLLECTION,
		id: eventId,
		depth: 0,
		overrideAccess: true,
	});
	if (event.processedAt) return { outcome: "already_processed" };

	const attempts = (event.attempts ?? 0) + 1;
	try {
		let outcome = "ignored_without_reference";
		let intent: PaymentIntent | null = null;
		const marketplace = isRetainedWebhookRaw(event.raw)
			? null
			: await marketplaceFor(payload, event.provider);
		if (marketplace) {
			const dispatched = await dispatchMarketplaceEvent(
				payload,
				marketplace.parseWebhookEvent(event.raw),
			);
			outcome = dispatched.outcome;
			intent = dispatched.intent;
		} else {
			let normalized: NormalizedWebhookEvent;
			// The account-deletion cascade may have already rewritten this event's
			// body into the same normalised shape `parseWebhookEvent` would
			// otherwise produce (lib/redact.ts). Re-parsing that flat shape through
			// a provider's original-wire-format parser finds nothing — a queued
			// retry for a payment that settles the moment its owner's account is
			// deleted must still resolve, not silently stop replaying.
			if (isRetainedWebhookRaw(event.raw)) {
				normalized = event.raw;
			} else if (isPaymentProvider(event.provider)) {
				normalized = p0Provider(event.provider).parseWebhookEvent(event.raw);
			} else {
				throw new Error(
					`processWebhookEvent only handles payment providers; got "${event.provider}"`,
				);
			}
			if (normalized.reference || normalized.providerTransactionId) {
				const settled = await settlePayment(payload, {
					...normalized,
					source: "webhook",
				});
				outcome = settled.outcome;
				if ("intent" in settled) intent = settled.intent;
			}
		}

		const data: Partial<WebhookEvent> = {
			attempts,
			processedAt: new Date().toISOString(),
			lastError: null,
		};
		// The owner's account went away between this event being stored and
		// this run: the sweep has already been and gone, so the body is
		// redacted here or never.
		if (
			intent?.customerDeletedAt &&
			isPaymentProvider(event.provider) &&
			!isRetainedWebhookRaw(event.raw)
		) {
			data.raw = redactedBody(event.provider, event.raw);
		}

		await payload.update({
			collection: COLLECTION,
			id: eventId,
			depth: 0,
			overrideAccess: true,
			data,
		});
		return { outcome };
	} catch (error) {
		await payload
			.update({
				collection: COLLECTION,
				id: eventId,
				depth: 0,
				overrideAccess: true,
				data: {
					attempts,
					lastError: (error instanceof Error
						? error.message
						: String(error)
					).slice(0, 500),
				},
			})
			.catch(() => undefined);
		throw error;
	}
}
