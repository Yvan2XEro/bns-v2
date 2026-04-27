import Stripe from "stripe";
import type {
	CreatePaymentParams,
	CreatePaymentResult,
	PaymentProvider,
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
		const session = await this.stripe.checkout.sessions.create({
			line_items: [
				{
					price_data: {
						currency: params.currency.toLowerCase(),
						product_data: { name: params.description },
						unit_amount: params.amount,
					},
					quantity: 1,
				},
			],
			mode: "payment",
			success_url: `${params.callbackUrl}&status=success`,
			cancel_url: `${params.callbackUrl}&status=cancelled`,
			customer_email: params.customer.email,
			metadata: { reference: params.reference },
		});

		return {
			checkoutUrl: session.url!,
			providerReference: session.id,
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

		if (event.type === "checkout.session.completed") {
			const session = event.data.object as Stripe.Checkout.Session;
			return {
				reference: session.metadata?.reference ?? "",
				status: "completed",
				providerTransactionId: session.id,
			};
		}

		if (event.type === "checkout.session.expired") {
			const session = event.data.object as Stripe.Checkout.Session;
			return {
				reference: session.metadata?.reference ?? "",
				status: "failed",
				providerTransactionId: session.id,
			};
		}

		return { reference: "", status: "pending" };
	}
}
