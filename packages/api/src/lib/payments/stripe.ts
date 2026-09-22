import Stripe from "stripe";
import {
	type CreatePaymentParams,
	type CreatePaymentResult,
	type NormalizedPayment,
	type NormalizedWebhookEvent,
	type PaymentProvider,
	type ProviderPaymentStatus,
	WebhookSignatureError,
} from "./types";

export function stripeSessionStatus(
	type: string,
	session: Pick<Stripe.Checkout.Session, "payment_status" | "status">,
): ProviderPaymentStatus {
	if (type === "checkout.session.expired" || session.status === "expired")
		return "expired";
	if (type === "checkout.session.async_payment_failed") return "failed";
	if (type === "checkout.session.async_payment_succeeded") return "succeeded";
	return session.payment_status === "paid" ? "succeeded" : "pending";
}

export class StripeProvider implements PaymentProvider {
	readonly id = "stripe" as const;

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
	): Promise<NormalizedWebhookEvent> {
		const signature = headers["stripe-signature"];
		if (!signature) throw new WebhookSignatureError();

		let event: Stripe.Event;
		try {
			event = this.stripe.webhooks.constructEvent(
				rawBody,
				signature,
				this.webhookSecret,
			);
		} catch {
			throw new WebhookSignatureError();
		}
		return this.parseWebhookEvent(event);
	}

	parseWebhookEvent(raw: unknown): NormalizedWebhookEvent {
		const event = raw as {
			id: string;
			type: string;
			data?: { object?: unknown };
		};
		const session = event.type.startsWith("checkout.session.")
			? (event.data?.object as Stripe.Checkout.Session)
			: null;
		return {
			providerEventId: event.id,
			type: event.type,
			reference: session?.metadata?.reference ?? "",
			status: session ? stripeSessionStatus(event.type, session) : "pending",
			amount: session?.amount_total ?? null,
			currency: session?.currency ? session.currency.toUpperCase() : null,
			providerTransactionId: session?.id ?? null,
		};
	}

	async verifyPayment(providerReference: string): Promise<NormalizedPayment> {
		const session =
			await this.stripe.checkout.sessions.retrieve(providerReference);
		return {
			reference: session.metadata?.reference ?? "",
			status: stripeSessionStatus("", session),
			amount: session.amount_total ?? null,
			currency: session.currency ? session.currency.toUpperCase() : null,
			providerTransactionId: session.id,
		};
	}
}
