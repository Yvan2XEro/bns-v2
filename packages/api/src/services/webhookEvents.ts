import { createHash } from "node:crypto";
import type { Payload } from "payload";
import { getProvider } from "../lib/payments";
import {
	isRecord,
	type NormalizedWebhookEvent,
	type PaymentProvider,
	type ProviderName,
} from "../lib/payments/types";
import type { WebhookEvent } from "../payload-types";
import { settlePayment } from "./payments";

const COLLECTION = "webhook-events" as const;

export function hashPayload(rawBody: string): string {
	return createHash("sha256").update(rawBody).digest("hex");
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
				payloadHash,
				raw: isRecord(input.raw) ? input.raw : undefined,
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
		const normalized = deps
			.getProvider(event.provider)
			.parseWebhookEvent(event.raw);

		let outcome = "ignored_without_reference";
		if (normalized.reference || normalized.providerTransactionId) {
			const settled = await settlePayment(payload, {
				...normalized,
				source: "webhook",
			});
			outcome = settled.outcome;
		}

		await payload.update({
			collection: COLLECTION,
			id: eventId,
			depth: 0,
			overrideAccess: true,
			data: {
				attempts,
				processedAt: new Date().toISOString(),
				lastError: null,
			},
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
