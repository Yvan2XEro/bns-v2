import { createHash } from "node:crypto";
import type { Payload } from "payload";
import { getProvider } from "../lib/payments";
import {
	isRecord,
	type NormalizedWebhookEvent,
	type PaymentProvider,
	type ProviderName,
} from "../lib/payments/types";
import { isRetainedWebhookRaw, retainedWebhookRaw } from "../lib/redact";
import type { PaymentIntent, WebhookEvent } from "../payload-types";
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
	event: Pick<NormalizedWebhookEvent, "providerTransactionId" | "reference">,
): Promise<PaymentIntent | null> {
	return findIntentByReference(payload, {
		reference: event.reference,
		providerReference: event.providerTransactionId,
	}).catch(() => null);
}

/** Spread so the rebuilt body satisfies the json field's index signature. */
function redactedBody(provider: string, raw: unknown): WebhookEvent["raw"] {
	return { ...retainedWebhookRaw(provider, raw) };
}

export interface RecordWebhookEventInput {
	provider: ProviderName;
	event: NormalizedWebhookEvent;
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

	const intent = await intentFor(payload, input.event);
	const raw = intent?.customerDeletedAt
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

export async function processWebhookEvent(
	payload: Payload,
	eventId: string,
	deps: { getProvider: (name: ProviderName) => PaymentProvider } = {
		getProvider,
	},
): Promise<{ outcome: string }> {
	const event = await payload.findByID({
		collection: COLLECTION,
		id: eventId,
		depth: 0,
		overrideAccess: true,
	});
	if (event.processedAt) return { outcome: "already_processed" };

	const attempts = (event.attempts ?? 0) + 1;
	try {
		// The account-deletion cascade may have already rewritten this event's
		// body into the same normalised shape `parseWebhookEvent` would
		// otherwise produce (lib/redact.ts). Re-parsing that flat shape through
		// a provider's original-wire-format parser finds nothing — a queued
		// retry for a payment that settles the moment its owner's account is
		// deleted must still resolve, not silently stop replaying.
		const normalized = isRetainedWebhookRaw(event.raw)
			? event.raw
			: deps.getProvider(event.provider).parseWebhookEvent(event.raw);

		let outcome = "ignored_without_reference";
		let intent: PaymentIntent | null = null;
		if (normalized.reference || normalized.providerTransactionId) {
			const settled = await settlePayment(payload, {
				...normalized,
				source: "webhook",
			});
			outcome = settled.outcome;
			if ("intent" in settled) intent = settled.intent;
		}

		const data: Partial<WebhookEvent> = {
			attempts,
			processedAt: new Date().toISOString(),
			lastError: null,
		};
		// The owner's account went away between this event being stored and
		// this run: the sweep has already been and gone, so the body is
		// redacted here or never.
		if (intent?.customerDeletedAt && !isRetainedWebhookRaw(event.raw)) {
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
