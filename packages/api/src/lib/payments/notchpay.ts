import crypto from "node:crypto";
import type {
	CreatePaymentParams,
	CreatePaymentResult,
	PaymentProvider,
	PaymentStatus,
	WebhookEvent,
} from "./types";

export class NotchPayProvider implements PaymentProvider {
	readonly id = "notchpay";

	constructor(
		private readonly apiKey: string,
		private readonly webhookSecret: string | undefined,
		private readonly baseUrl = "https://api.notchpay.co",
	) {}

	async createPayment(
		params: CreatePaymentParams,
	): Promise<CreatePaymentResult> {
		const res = await fetch(`${this.baseUrl}/payments`, {
			method: "POST",
			headers: {
				Authorization: this.apiKey,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				reference: params.reference,
				amount: params.amount,
				currency: params.currency,
				description: params.description,
				callback: params.callbackUrl,
				redirect: params.returnUrl,
				customer: params.customer,
			}),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(
				`NotchPay API error (${res.status}): ${(err as Record<string, string>).message ?? (err as Record<string, string>).error ?? res.statusText}`,
			);
		}

		const data = (await res.json()) as Record<string, unknown>;

		// NotchPay returns the checkout URL under different keys depending on version
		const transaction = data.transaction as Record<string, unknown> | undefined;
		const checkoutUrl =
			(transaction?.authorization_url as string | undefined) ??
			(data.checkout_url as string | undefined) ??
			(data.authorization_url as string | undefined);

		const providerReference =
			(transaction?.reference as string | undefined) ??
			(data.reference as string | undefined) ??
			params.reference;

		if (!checkoutUrl) {
			throw new Error("NotchPay: no checkout URL in response");
		}

		return { checkoutUrl, providerReference };
	}

	async verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<WebhookEvent> {
		if (this.webhookSecret) {
			const sig =
				headers["x-notch-signature"] ??
				headers["x-notchpay-hash"] ??
				headers["x-hash"];

			if (!sig) {
				throw new Error("NotchPay webhook: missing signature header");
			}

			const expected = crypto
				.createHmac("sha256", this.webhookSecret)
				.update(rawBody)
				.digest("hex");

			if (
				!crypto.timingSafeEqual(
					Buffer.from(expected, "hex"),
					Buffer.from(sig, "hex"),
				)
			) {
				throw new Error("NotchPay webhook: invalid signature");
			}
		}

		const body = JSON.parse(rawBody) as Record<string, unknown>;
		const transaction = body.transaction as Record<string, unknown> | undefined;

		const reference = String(
			(body.reference as string | undefined) ??
				(transaction?.reference as string | undefined) ??
				"",
		);
		const rawStatus = String(
			(body.status as string | undefined) ??
				(transaction?.status as string | undefined) ??
				"",
		);

		return {
			reference,
			status: this.mapStatus(rawStatus),
			providerTransactionId: String(
				(transaction?.id as string | undefined) ?? reference,
			),
		};
	}

	private mapStatus(s: string): PaymentStatus {
		const lower = s.toLowerCase();
		if (["complete", "completed", "approved", "success"].includes(lower))
			return "completed";
		if (["failed", "expired", "error"].includes(lower)) return "failed";
		if (["cancelled", "canceled"].includes(lower)) return "cancelled";
		return "pending";
	}
}
