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

/**
 * Verifies, stores and queues a provider event. Signature values are never
 * logged, and the event is stored before any work is queued so a replay is a
 * no-op instead of a second settlement.
 */
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
		console.error(
			`${scope} verification could not run:`,
			error instanceof Error ? error.message : String(error),
		);
		return errorResponse(ERROR_CODES.server, 500);
	}

	const payload = await getPayload({ config });

	let raw: unknown;
	try {
		raw = JSON.parse(rawBody);
	} catch {
		console.warn(`${scope} verified body is not JSON`);
		return errorResponse(ERROR_CODES.badRequest, 400);
	}

	let recorded: { id: string; duplicate: boolean };
	try {
		recorded = await recordWebhookEvent(payload, {
			provider: providerName,
			event,
			raw,
			rawBody,
		});
	} catch (error) {
		payload.logger.error({
			msg: `${scope} could not store the event`,
			err: error,
		});
		return errorResponse(ERROR_CODES.server, 500);
	}

	if (recorded.duplicate)
		return Response.json({ received: true, duplicate: true });

	try {
		await payload.jobs.queue({
			task: "processWebhookEvent",
			input: { eventId: recorded.id },
			queue: "payments",
		});
	} catch (error) {
		// The event is stored: answering 500 lets the provider retry, and the
		// reconciliation job settles the intent if it never does.
		payload.logger.error({
			msg: `${scope} could not queue the event`,
			eventId: recorded.id,
			err: error,
		});
		return errorResponse(ERROR_CODES.server, 500);
	}

	return Response.json({ received: true });
}
