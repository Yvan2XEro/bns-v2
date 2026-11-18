import config from "@payload-config";
import { getPayload, type Payload } from "payload";
import type { WebhookEvent } from "../payload-types";
import {
	recordWebhookEvent,
	type WebhookEventFields,
} from "../services/webhookEvents";
import { ERROR_CODES, errorResponse } from "./errors";
import { getPaymentSettings } from "./paymentSettings";
import { getProvider } from "./payments";
import type { MarketplaceProvider } from "./payments/marketplace";
import { getMarketplaceProvider } from "./payments/marketplaceRegistry";
import {
	type PaymentProvider,
	type ProviderName,
	WebhookSignatureError,
} from "./payments/types";

type Verify = (
	rawBody: string,
	headers: Record<string, string | undefined>,
) => Promise<WebhookEventFields>;

/**
 * P0's route behaviour, shared by every payment webhook URL: verify, store
 * once, answer, queue. Signature values are never logged, and the event is
 * stored before any work is queued so a replay is a no-op instead of a
 * second settlement.
 */
async function receive(
	scope: string,
	request: Request,
	provider: WebhookEvent["provider"],
	verify: Verify,
	loadPayload: () => Promise<Payload>,
): Promise<Response> {
	const rawBody = await request.text();
	const headers = Object.fromEntries(request.headers.entries());

	let event: WebhookEventFields;
	try {
		event = await verify(rawBody, headers);
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

	const payload = await loadPayload();

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
			provider,
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

const payloadFromConfig = () => getPayload({ config });

export async function handlePaymentWebhook(
	providerName: ProviderName,
	request: Request,
): Promise<Response> {
	const scope = `[webhook:${providerName}]`;
	let provider: PaymentProvider;
	try {
		provider = getProvider(providerName);
	} catch {
		console.error(`${scope} provider is not configured`);
		return errorResponse(ERROR_CODES.server, 500);
	}
	return receive(
		scope,
		request,
		providerName,
		(rawBody, headers) => provider.verifyWebhook(rawBody, headers),
		payloadFromConfig,
	);
}

const WEBHOOK_PROVIDERS: ReadonlySet<string> = new Set<
	WebhookEvent["provider"]
>(["notchpay", "stripe", "fake"]);

function isWebhookProvider(id: string): id is WebhookEvent["provider"] {
	return WEBHOOK_PROVIDERS.has(id);
}

/**
 * The marketplace spine: every NotchPay event, whatever its entity, verified
 * through the registry's provider (the shared fake outside production) and
 * stored under that provider's id, which is how `processWebhookEvent` knows
 * to parse it back with the same provider.
 *
 * In production with no marketplace adapter registered yet, the registry
 * answers `payment.providerUnavailable`; the URL then keeps P0's NotchPay
 * verification, so boost payments do not stop settling before the adapter
 * lands.
 */
export async function handleMarketplaceWebhook(
	request: Request,
): Promise<Response> {
	const scope = "[webhook:marketplace]";
	const payload = await payloadFromConfig();

	let provider: MarketplaceProvider;
	try {
		provider = getMarketplaceProvider(await getPaymentSettings(payload));
	} catch {
		return handlePaymentWebhook("notchpay", request);
	}
	const providerId = provider.id;
	if (!isWebhookProvider(providerId)) {
		console.error(
			`${scope} provider "${providerId}" is not a webhook-events provider`,
		);
		return errorResponse(ERROR_CODES.server, 500);
	}
	return receive(
		scope,
		request,
		providerId,
		(rawBody, headers) => provider.verifyWebhook(rawBody, headers),
		async () => payload,
	);
}
