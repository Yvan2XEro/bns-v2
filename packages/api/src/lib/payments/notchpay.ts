import { createHmac, timingSafeEqual } from "node:crypto";
import {
	type CreatePaymentParams,
	type CreatePaymentResult,
	isRecord,
	type NormalizedPayment,
	type NormalizedWebhookEvent,
	type PaymentProvider,
	type ProviderPaymentStatus,
	WebhookSignatureError,
} from "./types";

const EVENT_STATUSES: Record<string, ProviderPaymentStatus> = {
	"payment.complete": "succeeded",
	"payment.failed": "failed",
	"payment.canceled": "cancelled",
	"payment.cancelled": "cancelled",
	"payment.expired": "expired",
};

export function mapNotchPayStatus(value: string): ProviderPaymentStatus {
	const lower = value.toLowerCase();
	if (["complete", "completed", "approved", "success"].includes(lower))
		return "succeeded";
	if (["failed", "error"].includes(lower)) return "failed";
	if (lower === "expired") return "expired";
	if (["cancelled", "canceled"].includes(lower)) return "cancelled";
	return "pending";
}

const toText = (value: unknown): string =>
	typeof value === "string" ? value : "";

const toAmount = (value: unknown): number | null => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (
		typeof value === "string" &&
		value.trim() !== "" &&
		Number.isFinite(Number(value))
	)
		return Number(value);
	return null;
};

const toCurrency = (value: unknown): string | null =>
	typeof value === "string" && value ? value.toUpperCase() : null;

export class NotchPayProvider implements PaymentProvider {
	readonly id = "notchpay" as const;

	constructor(
		private readonly publicKey: string,
		private readonly baseUrl = "https://api.notchpay.co",
		private readonly hashKey?: string,
	) {}

	async createPayment(
		params: CreatePaymentParams,
	): Promise<CreatePaymentResult> {
		const res = await fetch(`${this.baseUrl}/payments`, {
			method: "POST",
			headers: {
				Authorization: this.publicKey,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				reference: params.reference,
				amount: params.amount,
				currency: params.currency,
				description: params.description,
				callback: params.callbackUrl,
				customer: params.customer,
			}),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(
				`NotchPay (${res.status}): ${(err as Record<string, string>).message ?? res.statusText}`,
			);
		}

		const data = (await res.json()) as Record<string, unknown>;
		const transaction = data.transaction as Record<string, unknown> | undefined;

		const checkoutUrl =
			(transaction?.authorization_url as string | undefined) ??
			(data.authorization_url as string | undefined);

		const providerReference =
			(transaction?.reference as string | undefined) ??
			(data.reference as string | undefined) ??
			params.reference;

		if (!checkoutUrl) {
			throw new Error("NotchPay: aucune URL de paiement dans la réponse");
		}

		return { checkoutUrl, providerReference };
	}

	async verifyPayment(providerReference: string): Promise<NormalizedPayment> {
		const res = await fetch(
			`${this.baseUrl}/payments/${encodeURIComponent(providerReference)}`,
			{
				headers: { Authorization: this.publicKey, Accept: "application/json" },
			},
		);
		if (!res.ok) {
			throw new Error(`NotchPay verify (${res.status})`);
		}

		const parsed: unknown = await res.json();
		const data = isRecord(parsed) ? parsed : {};
		const trx = isRecord(data.transaction) ? data.transaction : data;
		return {
			reference: toText(trx.merchant_reference) || toText(trx.trxref),
			status: mapNotchPayStatus(toText(trx.status)),
			amount: toAmount(trx.amount),
			currency: toCurrency(trx.currency),
			providerTransactionId: toText(trx.reference) || providerReference,
		};
	}

	async verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<NormalizedWebhookEvent> {
		if (!this.hashKey) {
			throw new Error("NotchPay webhook: NOTCHPAY_HASH_KEY is not configured");
		}

		// A SHA-256 HMAC is exactly 64 hex characters, which also guarantees
		// equal buffer lengths for timingSafeEqual.
		const signature = headers["x-notch-signature"] ?? "";
		if (!/^[0-9a-f]{64}$/i.test(signature)) throw new WebhookSignatureError();

		const expected = createHmac("sha256", this.hashKey)
			.update(rawBody)
			.digest();
		if (!timingSafeEqual(Buffer.from(signature, "hex"), expected)) {
			throw new WebhookSignatureError();
		}

		let raw: unknown;
		try {
			raw = JSON.parse(rawBody);
		} catch {
			throw new WebhookSignatureError();
		}
		return this.parseWebhookEvent(raw);
	}

	parseWebhookEvent(raw: unknown): NormalizedWebhookEvent {
		const event = isRecord(raw) ? raw : {};
		const data = isRecord(event.data) ? event.data : {};
		const type = toText(event.event);
		return {
			providerEventId: toText(event.id),
			type,
			reference: toText(data.merchant_reference) || toText(data.trxref),
			status: EVENT_STATUSES[type] ?? mapNotchPayStatus(toText(data.status)),
			amount: toAmount(data.amount),
			currency: toCurrency(data.currency),
			providerTransactionId: toText(data.reference) || null,
		};
	}
}
