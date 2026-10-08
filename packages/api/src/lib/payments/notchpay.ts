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

export const toText = (value: unknown): string =>
	typeof value === "string" ? value : "";

export const toAmount = (value: unknown): number | null => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (
		typeof value === "string" &&
		value.trim() !== "" &&
		Number.isFinite(Number(value))
	)
		return Number(value);
	return null;
};

export const toCurrency = (value: unknown): string | null =>
	typeof value === "string" && value ? value.toUpperCase() : null;

/**
 * Pure so it can also run outside a configured provider instance — the
 * account-deletion cascade rebuilds a kept webhook body from exactly this
 * shape, without needing NOTCHPAY_PUBLIC_KEY/NOTCHPAY_HASH_KEY to exist.
 */
export function parseNotchPayWebhookEvent(
	raw: unknown,
): NormalizedWebhookEvent {
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

export class NotchPayProvider implements PaymentProvider {
	readonly id = "notchpay" as const;

	constructor(
		private readonly publicKey: string,
		private readonly baseUrl = "https://api.notchpay.co",
		private readonly hashKey?: string,
		private readonly grantKey?: string,
	) {}

	async createTransfer(input: {
		reference: string;
		amount: number;
		currency: string;
		channel: string;
		phone: string;
		name: string;
		idempotencyKey: string;
	}): Promise<{ transferId: string; reference: string }> {
		if (!this.grantKey) {
			throw new Error("NotchPay transfer requires NOTCHPAY_PRIVATE_KEY");
		}
		const response = await fetch(`${this.baseUrl}/transfers`, {
			method: "POST",
			headers: {
				Authorization: this.publicKey,
				"X-Grant": this.grantKey,
				"Idempotency-Key": input.idempotencyKey,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				reference: input.reference,
				amount: input.amount,
				currency: input.currency,
				channel: input.channel,
				phone: input.phone,
				name: input.name,
			}),
			signal: AbortSignal.timeout(15_000),
		});
		const body: unknown = await response.json().catch(() => null);
		if (!response.ok) {
			const error = isRecord(body) ? body : {};
			throw new Error(
				`NotchPay transfer (${response.status}): ${toText(error.message) || response.statusText}`,
			);
		}
		const envelope = isRecord(body) ? body : {};
		const transfer = isRecord(envelope.transfer)
			? envelope.transfer
			: isRecord(envelope.data)
				? envelope.data
				: envelope;
		const transferId = toText(transfer.id) || toText(transfer.transfer_id);
		const reference = toText(transfer.reference) || input.reference;
		if (!transferId || reference !== input.reference) {
			throw new Error("NotchPay returned an invalid transfer response");
		}
		return { transferId, reference };
	}

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
		return parseNotchPayWebhookEvent(raw);
	}
}
