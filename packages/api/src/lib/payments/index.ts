import { NotchPayProvider } from "./notchpay";
import { StripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export type ProviderName = "notchpay" | "stripe";

export function getProvider(name: ProviderName): PaymentProvider {
	if (name === "stripe") {
		const key = process.env.STRIPE_SECRET_KEY;
		const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
		if (!key || !webhookSecret) {
			throw new Error(
				"Stripe not configured: set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET",
			);
		}
		return new StripeProvider(key, webhookSecret);
	}

	const key = process.env.NOTCHPAY_API_KEY;
	if (!key) {
		throw new Error("NotchPay not configured: set NOTCHPAY_API_KEY");
	}
	return new NotchPayProvider(
		key,
		process.env.NOTCHPAY_WEBHOOK_SECRET,
		process.env.NOTCHPAY_BASE_URL ?? "https://api.notchpay.co",
	);
}

export { NotchPayProvider, StripeProvider };
export type {
	CreatePaymentParams,
	CreatePaymentResult,
	PaymentProvider,
	PaymentStatus,
	WebhookEvent,
} from "./types";
