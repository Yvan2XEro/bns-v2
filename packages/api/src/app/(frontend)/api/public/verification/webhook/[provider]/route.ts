import config from "@payload-config";
import { getPayload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { getKycProvider } from "@/lib/kyc";
import { recordWebhookEvent } from "@/services/webhookEvents";

/**
 * Verifies, stores and queues a vendor KYC event, following P0's
 * `handlePaymentWebhook`'s four steps: verify the signature, store the event
 * before anything else runs (a replay is then a no-op, not a second
 * decision), queue the processing job only for a fresh event, and answer
 * fast either way.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const { provider } = await params;
	if (provider !== "didit" && provider !== "smileid") {
		return errorResponse(ERROR_CODES.notFound, 404);
	}

	const rawBody = await request.text();
	let event: { providerEventId: string; type: string; sessionRef: string };
	try {
		event = await getKycProvider(provider).verifyWebhook(
			rawBody,
			request.headers,
		);
	} catch {
		// Never echo why: a signature oracle is a signature oracle.
		console.warn(`[verification:webhook:${provider}] rejected`);
		return errorResponse(ERROR_CODES.forbidden, 403);
	}

	const payload = await getPayload({ config });
	let recorded: { id: string; duplicate: boolean };
	try {
		recorded = await recordWebhookEvent(payload, {
			provider,
			event: {
				providerEventId: event.providerEventId,
				type: event.type,
				reference: event.sessionRef,
				providerTransactionId: event.sessionRef,
			},
			// The verified subset only, never the vendor's raw wire body: `event`
			// is exactly what `verifyWebhook` parsed and checked the signature
			// over (a session id, a status, an event id for didit), so this is
			// what `webhook-events.raw` actually holds for a KYC provider, unlike
			// the arbitrary body a payment provider's webhook stores.
			raw: event,
			rawBody,
		});
	} catch (error) {
		// 500 so the vendor retries: an event we failed to store is an event we
		// would otherwise lose for good.
		console.error(`[verification:webhook:${provider}] could not record`, error);
		return errorResponse(ERROR_CODES.server, 500);
	}

	if (!recorded.duplicate) {
		try {
			await payload.jobs.queue({
				task: "processKycEvent",
				input: {
					webhookEventId: recorded.id,
					provider,
					sessionRef: event.sessionRef,
				},
			});
		} catch (error) {
			payload.logger.error({
				msg: `[verification:webhook:${provider}] could not queue the event`,
				eventId: recorded.id,
				err: error,
			});
			return errorResponse(ERROR_CODES.server, 500);
		}
	}

	return Response.json({ received: true });
}
