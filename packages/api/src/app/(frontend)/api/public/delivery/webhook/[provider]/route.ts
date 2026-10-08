import config from "@payload-config";
import { getPayload } from "payload";
import { CourierNotConfiguredError, getCourierProvider } from "@/lib/delivery";
import type {
	CourierProviderId,
	CourierWebhookEvent,
} from "@/lib/delivery/types";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { recordWebhookEvent } from "@/services/webhookEvents";

function isWebhookProvider(
	value: string,
): value is Exclude<CourierProviderId, "manual"> {
	return value === "yango" || value === "campost";
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const { provider } = await params;
	if (!isWebhookProvider(provider))
		return errorResponse(ERROR_CODES.notFound, 404);

	const rawBody = await request.text();
	const headers: Record<string, string | undefined> = {};
	request.headers.forEach((value, key) => {
		headers[key.toLowerCase()] = value;
	});
	const payload = await getPayload({ config });
	let event: CourierWebhookEvent;
	try {
		event = await getCourierProvider(provider, { payload }).verifyWebhook(
			rawBody,
			headers,
		);
	} catch (error) {
		if (error instanceof CourierNotConfiguredError) {
			payload.logger.error({
				msg: `[delivery:webhook:${provider}] provider is not configured`,
			});
			return errorResponse(ERROR_CODES.server, 503);
		}
		payload.logger.warn({
			msg: `[delivery:webhook:${provider}] verification failed`,
		});
		return errorResponse(ERROR_CODES.badRequest, 400);
	}

	let recorded: { id: string; duplicate: boolean };
	try {
		recorded = await recordWebhookEvent(payload, {
			provider,
			event: {
				providerEventId: event.providerEventId,
				type: event.type,
				reference: event.reference,
				providerTransactionId: event.providerShipmentId,
			},
			raw: event,
			rawBody,
		});
	} catch (error) {
		payload.logger.error({
			msg: `[delivery:webhook:${provider}] could not store event`,
			err: error,
		});
		return errorResponse(ERROR_CODES.server, 500);
	}
	if (recorded.duplicate)
		return Response.json({ received: true, duplicate: true });

	try {
		await payload.jobs.queue({
			task: "processCourierWebhookEvent",
			input: { eventId: recorded.id },
			queue: "delivery",
		});
	} catch (error) {
		payload.logger.error({
			msg: `[delivery:webhook:${provider}] could not queue event`,
			eventId: recorded.id,
			err: error,
		});
		return errorResponse(ERROR_CODES.server, 500);
	}
	return Response.json({ received: true });
}
