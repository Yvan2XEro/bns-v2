import {
	CamPayProvider,
	campayCallbackFields,
	parseCamPayTransaction,
} from "./campay";
import { CAMPAY_DEFAULT_BASE_URL, campayConfigured } from "./campayConfig";
import { NotchPayProvider, parseNotchPayWebhookEvent } from "./notchpay";
import { parseStripeWebhookEvent, StripeProvider } from "./stripe";
import type { PaymentProvider, ProviderName } from "./types";

type Env = Readonly<Record<string, string | undefined>>;

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
	if (name === "campay") return getCamPayProvider();

	return getNotchPayProvider();
}

export function getNotchPayProvider(): NotchPayProvider {
	const publicKey = process.env.NOTCHPAY_PUBLIC_KEY;
	if (!publicKey) {
		throw new Error("NotchPay non configuré : définir NOTCHPAY_PUBLIC_KEY");
	}
	return new NotchPayProvider(
		publicKey,
		process.env.NOTCHPAY_BASE_URL ?? "https://api.notchpay.co",
		process.env.NOTCHPAY_HASH_KEY,
		process.env.NOTCHPAY_PRIVATE_KEY,
	);
}

export { CAMPAY_DEFAULT_BASE_URL, campayConfigured };

const campayInstances = new Map<string, CamPayProvider>();

/** One instance per configuration, so a temporary token is reused until it expires. */
export function getCamPayProvider(env: Env = process.env): CamPayProvider {
	if (!campayConfigured(env)) {
		throw new Error(
			"CamPay non configuré : définir CAMPAY_PERMANENT_TOKEN (ou CAMPAY_USERNAME et CAMPAY_PASSWORD) et CAMPAY_WEBHOOK_KEY",
		);
	}
	const config = {
		baseUrl: (env.CAMPAY_BASE_URL || CAMPAY_DEFAULT_BASE_URL).replace(
			/\/+$/,
			"",
		),
		permanentToken: env.CAMPAY_PERMANENT_TOKEN || undefined,
		username: env.CAMPAY_USERNAME || undefined,
		password: env.CAMPAY_PASSWORD || undefined,
		webhookKey: env.CAMPAY_WEBHOOK_KEY || undefined,
	};
	const key = JSON.stringify(config);
	let instance = campayInstances.get(key);
	if (!instance) {
		instance = new CamPayProvider(config);
		campayInstances.set(key, instance);
	}
	return instance;
}

export {
	CamPayProvider,
	NotchPayProvider,
	StripeProvider,
	campayCallbackFields,
	parseCamPayTransaction,
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
