import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
	CourierCapabilityError,
	CourierNotConfiguredError,
} from "./providerErrors";
import type {
	CourierProvider,
	CourierProviderId,
	CourierQuoteParams,
	CourierWebhookEvent,
	CreateCourierShipmentParams,
	ShipmentStatus,
} from "./types";
import { FAILURE_REASONS } from "./types";

// Before enabling this adapter, confirm quote/create endpoints, cancellation fees,
// webhook signing or polling limits, status and failure vocabularies, COD and
// remittance support, proof format, rider-phone exposure, sandbox, and billing.
// P7 excludes platform_account: delivery charges must not transit BuyNSellem.
export const STATUS_MAP: Record<string, ShipmentStatus> = {};

const incomingEvent = z.object({
	providerEventId: z.string(),
	type: z.string(),
	reference: z.string(),
	providerShipmentId: z.string(),
	providerStatus: z.string(),
	occurredAt: z.coerce.date(),
	rider: z
		.object({
			name: z.string(),
			phone: z.string().optional(),
			vehicle: z.string().optional(),
		})
		.optional(),
	attempt: z
		.object({ reason: z.enum(FAILURE_REASONS), note: z.string().optional() })
		.optional(),
});

export class YangoCourierProvider implements CourierProvider {
	readonly id = "yango" as const;
	readonly capabilities = {
		quote: false,
		webhooks: false,
		cancel: false,
		cod: false,
		intercity: false,
	};
	private readonly config: {
		baseUrl?: string;
		apiKey?: string;
		webhookSecret?: string;
	};

	constructor(env: NodeJS.ProcessEnv = process.env) {
		this.config = {
			baseUrl: env.YANGO_DELIVERY_BASE_URL,
			apiKey: env.YANGO_DELIVERY_API_KEY,
			webhookSecret: env.YANGO_DELIVERY_WEBHOOK_SECRET,
		};
	}

	private assertConfigured(): void {
		if (
			!this.config.baseUrl ||
			!this.config.apiKey ||
			!this.config.webhookSecret
		) {
			throw new CourierNotConfiguredError("yango");
		}
	}

	async quote(_params: CourierQuoteParams): Promise<never> {
		this.assertConfigured();
		throw new CourierCapabilityError("yango", "quote");
	}

	async create(_params: CreateCourierShipmentParams): Promise<never> {
		this.assertConfigured();
		throw new CourierCapabilityError("yango", "create");
	}

	async cancel(_params: {
		providerShipmentId: string;
		reason: string;
	}): Promise<never> {
		this.assertConfigured();
		throw new CourierCapabilityError("yango", "cancel");
	}

	async verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<CourierWebhookEvent> {
		this.assertConfigured();
		const signature = headers["x-yango-signature"] ?? "";
		if (!/^[0-9a-f]{64}$/i.test(signature)) {
			throw new Error("Yango webhook signature is invalid");
		}
		const expected = createHmac("sha256", this.config.webhookSecret ?? "")
			.update(rawBody)
			.digest();
		if (!timingSafeEqual(Buffer.from(signature, "hex"), expected)) {
			throw new Error("Yango webhook signature is invalid");
		}
		let decoded: unknown;
		try {
			decoded = JSON.parse(rawBody);
		} catch {
			throw new Error("Yango webhook body is invalid");
		}
		const parsed = incomingEvent.safeParse(decoded);
		if (!parsed.success) throw new Error("Yango webhook body is invalid");
		return {
			...parsed.data,
			status: STATUS_MAP[parsed.data.providerStatus] ?? null,
		};
	}

	async getStatus(_providerShipmentId: string): Promise<never> {
		this.assertConfigured();
		throw new CourierCapabilityError("yango", "getStatus");
	}
}

export function courierProviderId(value: string): value is CourierProviderId {
	return value === "manual" || value === "yango" || value === "campost";
}
