import Stripe from "stripe";
import type {
	CreatePaymentParams,
	CreatePaymentResult,
	PaymentProvider,
	PaymentStatus,
	WebhookEvent,
} from "./types";

export class StripeProvider implements PaymentProvider {
	readonly id = "stripe";

	private readonly stripe: Stripe;

	constructor(
		secretKey: string,
		private readonly webhookSecret: string,
	) {
		this.stripe = new Stripe(secretKey, { apiVersion: "2026-03-25.dahlia" });
	}

	async createPayment(
		params: CreatePaymentParams,
	): Promise<CreatePaymentResult> {
		const intent = await this.stripe.paymentIntents.create({
			amount: params.amount,
			currency: params.currency.toLowerCase(),
			description: params.description,
			metadata: { reference: params.reference },
			// Apple Pay is presented client-side; backend just creates the intent
			payment_method_types: ["card"],
			capture_method: "automatic",
		});

		return {
			clientSecret: intent.client_secret!,
			providerReference: intent.id,
		};
	}

	async verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<WebhookEvent> {
		const sig = headers["stripe-signature"];
		if (!sig)
			throw new Error("Stripe webhook: missing Stripe-Signature header");

		const event = this.stripe.webhooks.constructEvent(
			rawBody,
			sig,
			this.webhookSecret,
		);

		const intent = event.data.object as Stripe.PaymentIntent;
		const reference = intent.metadata?.reference ?? "";
		const status = this.mapStatus(event.type);

		return { reference, status, providerTransactionId: intent.id };
	}

	private mapStatus(eventType: string): PaymentStatus {
		if (eventType === "payment_intent.succeeded") return "completed";
		if (
			eventType === "payment_intent.payment_failed" ||
			eventType === "payment_intent.canceled"
		)
			return "failed";
		return "pending";
	}
}
