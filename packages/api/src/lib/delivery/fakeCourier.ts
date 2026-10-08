import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
	CourierProvider,
	CourierQuote,
	CourierQuoteParams,
	CourierStatusSnapshot,
	CourierWebhookEvent,
	CreateCourierShipmentParams,
	CreateCourierShipmentResult,
} from "./types";
import { FAILURE_REASONS, SHIPMENT_STATUSES } from "./types";

export type FakeCourierMethod =
	| "quote"
	| "create"
	| "cancel"
	| "verifyWebhook"
	| "getStatus";

export interface FakeCourierCall {
	method: FakeCourierMethod;
	args: unknown[];
	rejected: boolean;
}

export interface SignedCourierEvent {
	event: CourierWebhookEvent;
	rawBody: string;
	headers: Record<string, string>;
}

const SIGNATURE_HEADER = "x-fake-courier-signature";
const DEFAULT_WEBHOOK_SECRET = "fake-courier-webhook-secret";

const webhookEventSchema = z.object({
	reference: z.string(),
	providerShipmentId: z.string(),
	providerStatus: z.string(),
	status: z.enum(SHIPMENT_STATUSES).nullable(),
	occurredAt: z.coerce.date(),
	rider: z
		.object({
			name: z.string(),
			phone: z.string().optional(),
			vehicle: z.string().optional(),
		})
		.optional(),
	attempt: z
		.object({
			reason: z.enum(FAILURE_REASONS),
			note: z.string().optional(),
		})
		.optional(),
	proof: z
		.object({
			podUrl: z.string().optional(),
			recipientName: z.string().optional(),
			gps: z.object({ lat: z.number(), lng: z.number() }).optional(),
		})
		.optional(),
	codCollectedAmount: z.number().optional(),
	providerEventId: z.string(),
	type: z.string(),
});

type ResultByMethod = {
	quote: CourierQuote;
	create: CreateCourierShipmentResult;
	cancel: { cancelled: boolean; cancellationFee?: number };
};

type ArgsByMethod = {
	quote: [CourierQuoteParams];
	create: [CreateCourierShipmentParams];
	cancel: [Parameters<CourierProvider["cancel"]>[0]];
	verifyWebhook: Parameters<CourierProvider["verifyWebhook"]>;
	getStatus: Parameters<CourierProvider["getStatus"]>;
};

export class FakeCourierProvider implements CourierProvider {
	readonly id = "manual" as const;
	readonly capabilities = {
		quote: true,
		webhooks: true,
		cancel: true,
		cod: true,
		intercity: true,
	};
	readonly calls: FakeCourierCall[] = [];
	private readonly secret: string;
	private readonly results: {
		[K in keyof ResultByMethod]: ResultByMethod[K][];
	} = {
		quote: [],
		create: [],
		cancel: [],
	};
	private readonly statusScripts = new Map<string, CourierStatusSnapshot[]>();
	private readonly referencesByShipment = new Map<string, string>();
	private readonly currentStatuses = new Map<
		string,
		CourierStatusSnapshot["status"]
	>();
	private readonly failedMethods = new Set<FakeCourierMethod>();

	constructor(options: { webhookSecret?: string } = {}) {
		this.secret = options.webhookSecret ?? DEFAULT_WEBHOOK_SECRET;
	}

	/** Scripts the chronological provider status snapshots for one shipment reference. */
	script(reference: string, snapshots: CourierStatusSnapshot[]): this {
		this.statusScripts.set(reference, structuredClone(snapshots));
		return this;
	}

	/** Scripts the next outcomes for quote, create or cancel. */
	scriptResult<K extends keyof ResultByMethod>(
		method: K,
		outcomes: ResultByMethod[K][],
	): this {
		this.results[method].push(...structuredClone(outcomes));
		return this;
	}

	failWhen(method: FakeCourierMethod): this {
		this.failedMethods.add(method);
		return this;
	}

	clearFailure(method: FakeCourierMethod): this {
		this.failedMethods.delete(method);
		return this;
	}

	emit(event: CourierWebhookEvent): SignedCourierEvent {
		const copy = structuredClone(event);
		const rawBody = JSON.stringify(copy);
		return { event: copy, rawBody, headers: this.sign(rawBody) };
	}

	async quote(params: CourierQuoteParams): Promise<CourierQuote> {
		return this.take("quote", [params], this.results.quote);
	}

	async create(
		params: CreateCourierShipmentParams,
	): Promise<CreateCourierShipmentResult> {
		const result = await this.take("create", [params], this.results.create);
		this.referencesByShipment.set(result.providerShipmentId, params.reference);
		this.currentStatuses.set(result.providerShipmentId, result.status);
		return result;
	}

	async cancel(
		params: Parameters<CourierProvider["cancel"]>[0],
	): ReturnType<CourierProvider["cancel"]> {
		return this.track("cancel", [params], () => {
			if (
				this.currentStatuses.has(params.providerShipmentId) &&
				this.currentStatuses.get(params.providerShipmentId) !== "pending"
			) {
				return { cancelled: false };
			}
			const result = this.results.cancel.shift();
			if (result === undefined) {
				throw new Error("fakeCourier: no scripted outcome left for cancel");
			}
			if (result.cancelled)
				this.currentStatuses.set(params.providerShipmentId, "cancelled");
			return result;
		});
	}

	async verifyWebhook(
		rawBody: string,
		headers: Record<string, string | undefined>,
	): Promise<CourierWebhookEvent> {
		return this.track("verifyWebhook", [rawBody, headers], () => {
			const signature = headers[SIGNATURE_HEADER] ?? "";
			if (!/^[0-9a-f]{64}$/i.test(signature)) {
				throw new Error("fakeCourier: invalid webhook signature");
			}
			const expected = createHmac("sha256", this.secret)
				.update(rawBody)
				.digest();
			if (!timingSafeEqual(Buffer.from(signature, "hex"), expected)) {
				throw new Error("fakeCourier: invalid webhook signature");
			}
			let body: unknown;
			try {
				body = JSON.parse(rawBody);
			} catch {
				throw new Error("fakeCourier: invalid webhook body");
			}
			const parsed = webhookEventSchema.safeParse(body);
			if (!parsed.success) throw new Error("fakeCourier: invalid webhook body");
			return parsed.data;
		});
	}

	async getStatus(
		providerShipmentId: string,
	): ReturnType<CourierProvider["getStatus"]> {
		return this.track("getStatus", [providerShipmentId], () => {
			const reference =
				this.referencesByShipment.get(providerShipmentId) ?? providerShipmentId;
			const snapshots = this.statusScripts.get(reference) ?? [];
			const snapshot = snapshots.shift();
			if (!snapshot) {
				throw new Error(
					`fakeCourier: no scripted outcome left for ${reference}`,
				);
			}
			this.currentStatuses.set(providerShipmentId, snapshot.status);
			return structuredClone(snapshot);
		});
	}

	callsTo<K extends FakeCourierMethod>(method: K): ArgsByMethod[K][] {
		return this.calls.flatMap((call) =>
			call.method === method ? [call.args as ArgsByMethod[K]] : [],
		);
	}

	private sign(rawBody: string): Record<string, string> {
		return {
			[SIGNATURE_HEADER]: createHmac("sha256", this.secret)
				.update(rawBody)
				.digest("hex"),
		};
	}

	private async take<K extends keyof ResultByMethod>(
		method: K,
		args: ArgsByMethod[K],
		queue: ResultByMethod[K][],
	): Promise<ResultByMethod[K]> {
		return this.track(method, args, () => {
			const result = queue.shift();
			if (result === undefined) {
				throw new Error(`fakeCourier: no scripted outcome left for ${method}`);
			}
			return result;
		});
	}

	private async track<T>(
		method: FakeCourierMethod,
		args: unknown[],
		operation: () => T,
	): Promise<T> {
		const snapshot = structuredClone(args);
		try {
			if (this.failedMethods.has(method)) {
				throw new Error(`fakeCourier: scripted failure for ${method}`);
			}
			const result = operation();
			this.calls.push({ method, args: snapshot, rejected: false });
			return structuredClone(result);
		} catch (error) {
			this.calls.push({ method, args: snapshot, rejected: true });
			throw error;
		}
	}
}
