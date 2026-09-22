import { NotchPayProvider, parseNotchPayWebhookEvent } from "./notchpay";
import { parseStripeWebhookEvent, StripeProvider } from "./stripe";
import type { PaymentProvider, ProviderName } from "./types";

export function getProvider(name: ProviderName): PaymentProvider {
	if (name === "stripe") {
		const key = process.env.STRIPE_SECRET_KEY;
		const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
		if (!key || !webhookSecret) {
			throw new Error(
				"Stripe non configuré : définir STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET",
			);
		}
		return new StripeProvider(key, webhookSecret);
	}

	const publicKey = process.env.NOTCHPAY_PUBLIC_KEY;
	if (!publicKey) {
		throw new Error("NotchPay non configuré : définir NOTCHPAY_PUBLIC_KEY");
	}
	return new NotchPayProvider(
		publicKey,
		process.env.NOTCHPAY_BASE_URL ?? "https://api.notchpay.co",
		process.env.NOTCHPAY_HASH_KEY,
	);
}

export {
	NotchPayProvider,
	StripeProvider,
	parseNotchPayWebhookEvent,
	parseStripeWebhookEvent,
};
export type {
	CreatePaymentParams,
	CreatePaymentResult,
	NormalizedPayment,
	NormalizedWebhookEvent,
	PaymentProvider,
	ProviderName,
	ProviderPaymentStatus,
} from "./types";
export { WebhookSignatureError } from "./types";
