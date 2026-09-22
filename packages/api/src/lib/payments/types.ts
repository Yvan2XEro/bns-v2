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

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
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
