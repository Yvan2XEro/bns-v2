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
	);
}

export function getNotchPayProvider(): NotchPayProvider {
	const publicKey = process.env.NOTCHPAY_PUBLIC_KEY;
	if (!publicKey) {
		throw new Error("NotchPay non configuré : définir NOTCHPAY_PUBLIC_KEY");
	}
	return new NotchPayProvider(
		publicKey,
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
