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
		private readonly publicKey: string,
		private readonly baseUrl = "https://api.notchpay.co",
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

	/** Vérifie le statut d'un paiement en rappelant l'API NotchPay */
	async verifyPayment(reference: string): Promise<PaymentStatus> {
		const res = await fetch(`${this.baseUrl}/payments/${reference}`, {
			headers: {
				Authorization: this.publicKey,
				Accept: "application/json",
			},
		});

		if (!res.ok) {
			throw new Error(`NotchPay verify (${res.status}): ${res.statusText}`);
		}

		const data = (await res.json()) as Record<string, unknown>;
		const transaction = data.transaction as Record<string, unknown> | undefined;
		const status = String(
			(transaction?.status as string | undefined) ??
				(data.status as string | undefined) ??
				"",
		);

		return this.mapStatus(status);
	}

	// NotchPay n'utilise pas de POST webhook signé. La vérification se fait
	// en rappelant GET /payments/{reference}. Cette méthode n'est pas utilisée
	// pour NotchPay — elle existe uniquement pour satisfaire l'interface.
	async verifyWebhook(
		_rawBody: string,
		_headers: Record<string, string | undefined>,
	): Promise<WebhookEvent> {
		throw new Error("NotchPay ne supporte pas les webhooks POST signés");
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
