export interface CreatePaymentParams {
	reference: string;
	amount: number;
	currency: string;
	description: string;
	/** Server-side webhook URL */
	callbackUrl: string;
	/** URL to redirect the user after payment (for hosted checkout flows) */
	returnUrl?: string;
	customer: {
		email: string;
		name?: string;
		phone?: string;
	};
}

export interface CreatePaymentResult {
	/** Redirect URL for hosted checkout (NotchPay) */
	checkoutUrl?: string;
	/** PaymentIntent client secret for native SDK flows (Stripe) */
	clientSecret?: string;
	/** Provider's transaction reference */
	providerReference: string;
}

export type PaymentStatus = "completed" | "failed" | "cancelled" | "pending";

export interface WebhookEvent {
	/** Our internal reference string (e.g. "BOOST-abc123") */
	reference: string;
	status: PaymentStatus;
	providerTransactionId?: string;
}

export interface PaymentProvider {
	readonly id: string;
	createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
	verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<WebhookEvent>;
}
