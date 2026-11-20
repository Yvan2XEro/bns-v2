import { createHmac, timingSafeEqual } from "node:crypto";
import { toAmount, toCurrency, toText } from "./notchpay";
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

/**
 * CamPay (Cameroon mobile money: MTN, Orange), for the money BuyNSellem
 * collects for itself — boosts, commission invoices, reseller charges.
 *
 * API (https://documenter.getpostman.com/view/2391374/T1LV8PVA):
 * - `POST /api/token/` {username, password} → {token, expires_in}; or a
 *   permanent token from the dashboard ("APP KEYS"), which never expires.
 *   Every call sends `Authorization: Token <token>`.
 * - `POST /api/get_payment_link/` → {link, reference}: the hosted page where
 *   the payer picks MTN or Orange; `external_reference` carries ours
 *   (`PI-{id}`) and comes back on every report.
 * - `GET /api/transaction/{reference}/` → the transaction, `status`
 *   PENDING | SUCCESSFUL | FAILED.
 * - The callback (GET query or POST body, as set on the CamPay app) carries
 *   the same fields plus `signature`: a JWT signed HS256 with the app's
 *   webhook key. It is sent once and never retried, so reconciliation polls
 *   the status endpoint for anything a lost callback leaves pending.
 *
 * Amounts are whole XAF (CamPay refuses decimals, ER201); CamPay handles no
 * other currency.
 *
 * Production host: https://www.campay.net (sandbox https://demo.campay.net).
 * `api.campay.net` does not exist.
 */

export interface CamPayConfig {
	baseUrl: string;
	/** Permanent token ("APP KEYS"); when set, username/password are unused. */
	permanentToken?: string;
	username?: string;
	password?: string;
	/** Signs the callbacks' JWT; required to accept any callback. */
	webhookKey?: string;
	fetch?: typeof fetch;
	now?: () => number;
}

const TIMEOUT_MS = 15_000;
/** A temporary token is renewed this long before CamPay says it expires. */
const TOKEN_MARGIN_S = 300;
/** Clock skew tolerated on the callback JWT's `iat`/`nbf`/`exp`. */
const JWT_LEEWAY_S = 300;

export function mapCamPayStatus(value: string): ProviderPaymentStatus {
	const upper = value.toUpperCase();
	if (upper === "SUCCESSFUL" || upper === "SUCCESS") return "succeeded";
	if (upper === "FAILED") return "failed";
	if (upper === "EXPIRED") return "expired";
	if (upper === "CANCELLED" || upper === "CANCELED") return "cancelled";
	return "pending";
}

/**
 * The status endpoint's transaction, or a callback (same fields), as a P0
 * event. Pure, so a stored body re-parses without a configured provider.
 * `providerEventId` is the reference and the status: CamPay has no event id,
 * and one transaction reports each status at most once.
 */
export function parseCamPayTransaction(raw: unknown): NormalizedWebhookEvent {
	const data = isRecord(raw) ? raw : {};
	const providerReference = toText(data.reference);
	const rawStatus = toText(data.status).toUpperCase();
	const endpoint = toText(data.endpoint) || "collect";
	return {
		providerEventId: providerReference
			? `campay:${providerReference}:${rawStatus || "UNKNOWN"}`
			: "",
		type: `${endpoint}.${(rawStatus || "unknown").toLowerCase()}`,
		reference: toText(data.external_reference),
		status: mapCamPayStatus(rawStatus),
		amount: toAmount(data.amount),
		currency: toCurrency(data.currency),
		providerTransactionId: providerReference || null,
	};
}

const base64url = (value: string): Buffer =>
	Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/**
 * Verifies the callback's `signature` JWT: HS256 only (no `none`, no
 * algorithm switch), the webhook key, and `exp`/`nbf`/`iat` when present.
 * Throws `WebhookSignatureError` on any failure.
 */
export function verifyCamPayJwt(
	token: string,
	webhookKey: string,
	nowSeconds: number,
): Record<string, unknown> {
	const parts = token.split(".");
	if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p)))
		throw new WebhookSignatureError();
	const [headerPart, bodyPart, signaturePart] = parts as [
		string,
		string,
		string,
	];
	let header: unknown;
	let claims: unknown;
	try {
		header = JSON.parse(base64url(headerPart).toString("utf8"));
		claims = JSON.parse(base64url(bodyPart).toString("utf8"));
	} catch {
		throw new WebhookSignatureError();
	}
	if (!isRecord(header) || header.alg !== "HS256" || !isRecord(claims))
		throw new WebhookSignatureError();

	const expected = createHmac("sha256", webhookKey)
		.update(`${headerPart}.${bodyPart}`)
		.digest();
	const given = base64url(signaturePart);
	if (given.length !== expected.length || !timingSafeEqual(given, expected))
		throw new WebhookSignatureError();

	const num = (v: unknown) => (typeof v === "number" ? v : null);
	const exp = num(claims.exp);
	const nbf = num(claims.nbf);
	const iat = num(claims.iat);
	if (exp !== null && nowSeconds > exp + JWT_LEEWAY_S)
		throw new WebhookSignatureError();
	if (nbf !== null && nowSeconds < nbf - JWT_LEEWAY_S)
		throw new WebhookSignatureError();
	if (iat !== null && iat > nowSeconds + JWT_LEEWAY_S)
		throw new WebhookSignatureError();
	return claims;
}

/** `237` + 9 digits, CamPay's only accepted shape (ER101); else null. */
export function campayPhone(phone: string | undefined): string | null {
	const digits = (phone ?? "").replace(/\D/g, "");
	if (/^237[26]\d{8}$/.test(digits)) return digits;
	if (/^[26]\d{8}$/.test(digits)) return `237${digits}`;
	return null;
}

/** Callback fields from a GET query string, or a POST JSON or form body. */
export function campayCallbackFields(
	rawBody: string,
	query?: URLSearchParams,
): Record<string, string> {
	if (query && [...query.keys()].length > 0)
		return Object.fromEntries(query.entries());
	const body = rawBody.trim();
	if (body.startsWith("{")) {
		try {
			const parsed: unknown = JSON.parse(body);
			if (isRecord(parsed))
				return Object.fromEntries(
					Object.entries(parsed).map(([k, v]) => [
						k,
						v === null || v === undefined ? "" : String(v),
					]),
				);
		} catch {
			return {};
		}
	}
	return Object.fromEntries(new URLSearchParams(body).entries());
}

export class CamPayProvider implements PaymentProvider {
	readonly id = "campay" as const;
	private readonly fetchImpl: typeof fetch;
	private readonly now: () => number;
	private token: { value: string; expiresAt: number } | null = null;
	private tokenRequest: Promise<string> | null = null;

	constructor(private readonly config: CamPayConfig) {
		this.fetchImpl = config.fetch ?? fetch;
		this.now = config.now ?? Date.now;
	}

	private async authToken(): Promise<string> {
		if (this.config.permanentToken) return this.config.permanentToken;
		if (this.token && this.now() < this.token.expiresAt)
			return this.token.value;
		this.tokenRequest ??= this.requestToken().finally(() => {
			this.tokenRequest = null;
		});
		return this.tokenRequest;
	}

	private async requestToken(): Promise<string> {
		const { username, password } = this.config;
		if (!username || !password)
			throw new Error("CamPay: no permanent token and no username/password");
		const res = await this.fetchImpl(`${this.config.baseUrl}/api/token/`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ username, password }),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		const body: unknown = await res.json().catch(() => null);
		const token = isRecord(body) ? toText(body.token) : "";
		if (!res.ok || !token) throw new Error(`CamPay token (${res.status})`);
		const lifetime = isRecord(body)
			? (toAmount(body.expires_in) ?? 3600)
			: 3600;
		this.token = {
			value: token,
			expiresAt: this.now() + Math.max(lifetime - TOKEN_MARGIN_S, 60) * 1000,
		};
		return token;
	}

	private async call(
		method: "GET" | "POST",
		path: string,
		body?: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		const send = async (token: string) =>
			this.fetchImpl(`${this.config.baseUrl}${path}`, {
				method,
				headers: {
					Authorization: `Token ${token}`,
					Accept: "application/json",
					...(body ? { "Content-Type": "application/json" } : {}),
				},
				body: body ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		let res = await send(await this.authToken());
		// An expired temporary token: one fresh token, one retry.
		if (res.status === 401 && !this.config.permanentToken) {
			this.token = null;
			res = await send(await this.authToken());
		}
		const parsed: unknown = await res.json().catch(() => null);
		const data = isRecord(parsed) ? parsed : {};
		if (!res.ok) {
			const message =
				toText(data.message) || toText(data.detail) || toText(data.error_code);
			throw new Error(
				`CamPay ${path} (${res.status})${message ? `: ${message}` : ""}`,
			);
		}
		return data;
	}

	async createPayment(
		params: CreatePaymentParams,
	): Promise<CreatePaymentResult> {
		if (params.currency.toUpperCase() !== "XAF")
			throw new Error(`CamPay only collects XAF, not ${params.currency}`);
		if (!Number.isInteger(params.amount) || params.amount <= 0)
			throw new Error("CamPay amounts are whole, positive XAF");

		const [firstName, ...rest] = (params.customer.name ?? "")
			.trim()
			.split(/\s+/);
		const phone = campayPhone(params.customer.phone);
		const returnUrl = params.returnUrl ?? params.callbackUrl;
		const data = await this.call("POST", "/api/get_payment_link/", {
			amount: String(params.amount),
			currency: "XAF",
			description: params.description.slice(0, 255),
			external_reference: params.reference,
			redirect_url: returnUrl,
			failure_redirect_url: returnUrl,
			payment_options: "MOMO",
			...(params.customer.email.includes("@")
				? { email: params.customer.email }
				: {}),
			...(firstName ? { first_name: firstName } : {}),
			...(rest.length ? { last_name: rest.join(" ") } : {}),
			...(phone ? { from: phone } : {}),
		});
		const link = toText(data.link);
		const reference = toText(data.reference);
		if (!link || !reference)
			throw new Error("CamPay: no payment link in the response");
		return { checkoutUrl: link, providerReference: reference };
	}

	/** The transaction itself, as CamPay reports it now. */
	async getTransaction(
		providerReference: string,
	): Promise<Record<string, unknown>> {
		if (!/^[A-Za-z0-9-]+$/.test(providerReference))
			throw new Error("CamPay: invalid transaction reference");
		return this.call("GET", `/api/transaction/${providerReference}/`);
	}

	async verifyPayment(providerReference: string): Promise<NormalizedPayment> {
		const {
			providerEventId: _id,
			type: _type,
			...payment
		} = parseCamPayTransaction(await this.getTransaction(providerReference));
		return {
			...payment,
			providerTransactionId: payment.providerTransactionId ?? providerReference,
		};
	}

	/**
	 * A callback, checked twice: its JWT must carry the webhook key's HS256
	 * signature, and its content is never trusted — the transaction is read
	 * back from CamPay by its reference. Returns that authoritative record,
	 * which is what gets stored and settled.
	 */
	async verifyCallback(fields: Record<string, string>): Promise<{
		event: NormalizedWebhookEvent;
		transaction: Record<string, unknown>;
	}> {
		const key = this.config.webhookKey;
		if (!key) throw new Error("CamPay webhook: CAMPAY_WEBHOOK_KEY is not set");
		verifyCamPayJwt(fields.signature ?? "", key, Math.floor(this.now() / 1000));
		const reference = fields.reference ?? "";
		if (!/^[A-Za-z0-9-]+$/.test(reference)) throw new WebhookSignatureError();
		const transaction = await this.getTransaction(reference);
		// Kept: identifiers, status, amounts. Dropped: the payer's phone, name
		// and e-mail, and the signature.
		const kept = Object.fromEntries(
			[
				"reference",
				"external_reference",
				"status",
				"amount",
				"app_amount",
				"currency",
				"operator",
				"code",
				"operator_reference",
				"endpoint",
				"reason",
			]
				.filter((k) => transaction[k] !== undefined && transaction[k] !== null)
				.map((k) => [k, transaction[k]]),
		);
		if (toText(kept.reference) !== reference) kept.reference = reference;
		return { event: parseCamPayTransaction(kept), transaction: kept };
	}

	async verifyWebhook(
		rawBody: string,
		_headers: Record<string, string | undefined>,
	): Promise<NormalizedWebhookEvent> {
		const { event } = await this.verifyCallback(campayCallbackFields(rawBody));
		return event;
	}

	parseWebhookEvent(raw: unknown): NormalizedWebhookEvent {
		return parseCamPayTransaction(raw);
	}
}
