import type { Payload } from "payload";
import { ERROR_CODES } from "../lib/errors";
import type { NormalizedPayment, ProviderName } from "../lib/payments/types";
import { type IntentStatus, transitionPath } from "../lib/paymentTransitions";
import { type TxReq, withTransaction } from "../lib/transactions";
import type { PaymentIntent } from "../payload-types";
import { PURPOSE_HANDLERS } from "./paymentPurposes";

export const INTENT_TTL_MS = 24 * 60 * 60 * 1000;

export type IntentDoc = PaymentIntent;
type HistoryEntry = NonNullable<PaymentIntent["statusHistory"]>[number];
export type StatusSource = HistoryEntry["source"];

export interface CreateIntentInput {
	purpose: PaymentIntent["purpose"];
	targetType: PaymentIntent["targetType"];
	targetId: string;
	customerId: string;
	amount: number;
	currency: string;
	provider: ProviderName;
	idempotencyKey: string;
	now?: Date;
}

export interface StatusReport {
	status: IntentStatus;
	source: StatusSource;
	at?: Date;
	amount?: number | null;
	currency?: string | null;
	note?: string;
}

export interface SettleInput extends NormalizedPayment {
	source: StatusSource;
	at?: Date;
}

export type AppliedOutcome = {
	outcome: "applied" | "unchanged" | "ignored" | "amount_mismatch";
	intent: IntentDoc;
};
export type SettleOutcome = { outcome: "unknown_reference" } | AppliedOutcome;

const COLLECTION = "payment-intents" as const;

async function loadIntent(
	payload: Payload,
	id: string,
	req?: TxReq,
): Promise<IntentDoc> {
	return payload.findByID({
		collection: COLLECTION,
		id,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

async function saveIntent(
	payload: Payload,
	id: string,
	data: Partial<PaymentIntent>,
	req?: TxReq,
): Promise<IntentDoc> {
	return payload.update({
		collection: COLLECTION,
		id,
		data,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

async function findOne(
	payload: Payload,
	field: "reference" | "providerReference" | "idempotencyKey",
	value: string,
): Promise<IntentDoc | null> {
	const result = await payload.find({
		collection: COLLECTION,
		where: { [field]: { equals: value } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	return result.docs[0] ?? null;
}

export async function createPaymentIntent(
	payload: Payload,
	input: CreateIntentInput,
	req?: TxReq,
): Promise<IntentDoc> {
	if (!Number.isInteger(input.amount) || input.amount <= 0) {
		throw new Error("Payment amount must be a positive integer");
	}
	const now = input.now ?? new Date();
	const created = await payload.create({
		collection: COLLECTION,
		depth: 0,
		overrideAccess: true,
		req,
		data: {
			purpose: input.purpose,
			targetType: input.targetType,
			targetId: input.targetId,
			customer: input.customerId,
			amount: input.amount,
			currency: input.currency,
			provider: input.provider,
			idempotencyKey: input.idempotencyKey,
			status: "created",
			statusHistory: [
				{ status: "created", source: "system", at: now.toISOString() },
			],
			expiresAt: new Date(now.getTime() + INTENT_TTL_MS).toISOString(),
		},
	});
	// The reference embeds the id, so it can only be written once the id exists.
	return saveIntent(
		payload,
		String(created.id),
		{ reference: `PI-${created.id}` },
		req,
	);
}

export function findIntentByIdempotencyKey(
	payload: Payload,
	key: string,
): Promise<IntentDoc | null> {
	return findOne(payload, "idempotencyKey", key);
}

/** Resolves `PI-{id}`, legacy `BOOST-{id}`, then the provider's own id. */
export async function findIntentByReference(
	payload: Payload,
	{
		reference,
		providerReference,
	}: { reference?: string | null; providerReference?: string | null },
): Promise<IntentDoc | null> {
	if (reference?.startsWith("PI-")) {
		const byId = await loadIntent(payload, reference.slice(3)).catch(
			() => null,
		);
		if (byId) return byId;
	}
	if (reference) {
		const byReference = await findOne(payload, "reference", reference);
		if (byReference) return byReference;
	}
	if (providerReference)
		return findOne(payload, "providerReference", providerReference);
	return null;
}

export function markIntentPending(
	payload: Payload,
	intentId: string,
	details: {
		providerReference: string;
		checkoutUrl: string | null;
		now?: Date;
	},
): Promise<IntentDoc> {
	return withTransaction(payload, async (req) => {
		const intent = await loadIntent(payload, intentId, req);
		const data: Partial<PaymentIntent> = {
			providerReference: details.providerReference,
			checkoutUrl: details.checkoutUrl,
		};
		// A fast webhook may already have settled the intent; keep its status.
		if (transitionPath(intent.status, "pending").length > 0) {
			data.status = "pending";
			data.statusHistory = [
				...(intent.statusHistory ?? []),
				{
					status: "pending",
					source: "system",
					at: (details.now ?? new Date()).toISOString(),
				},
			];
		}
		return saveIntent(payload, intentId, data, req);
	});
}

export function applyStatus(
	payload: Payload,
	intentId: string,
	report: StatusReport,
): Promise<AppliedOutcome> {
	return withTransaction(payload, async (req) => {
		const intent = await loadIntent(payload, intentId, req);
		const at = (report.at ?? new Date()).toISOString();
		const history: HistoryEntry[] = [...(intent.statusHistory ?? [])];
		const target = report.status;
		const handler = PURPOSE_HANDLERS[intent.purpose];

		if (target === "succeeded" && intent.status !== "succeeded") {
			const currency = report.currency?.toUpperCase() ?? null;
			if (report.amount !== intent.amount || currency !== intent.currency) {
				payload.logger.error({
					msg: "[payments] provider amount does not match the intent",
					code: ERROR_CODES.paymentAmountMismatch,
					intentId,
					expected: { amount: intent.amount, currency: intent.currency },
					reported: { amount: report.amount ?? null, currency },
				});
				history.push({
					status: "succeeded",
					source: report.source,
					at,
					note: ERROR_CODES.paymentAmountMismatch,
				});
				const updated = await saveIntent(
					payload,
					intentId,
					{
						statusHistory: history,
						settledAmount: report.amount ?? null,
						settledCurrency: currency,
					},
					req,
				);
				return { outcome: "amount_mismatch", intent: updated };
			}
		}

		if (intent.status === target) {
			if (target === "succeeded")
				await handler.onSucceeded(payload, intent, req);
			return { outcome: "unchanged", intent };
		}

		const path = transitionPath(intent.status, target);
		if (path.length === 0) {
			if (target === "succeeded") {
				payload.logger.error({
					msg: "[payments] provider reports a success on a closed intent",
					intentId,
					status: intent.status,
				});
			}
			history.push({
				status: target,
				source: report.source,
				at,
				note: `ignored: intent is ${intent.status}`,
			});
			const updated = await saveIntent(
				payload,
				intentId,
				{ statusHistory: history },
				req,
			);
			return { outcome: "ignored", intent: updated };
		}

		for (const status of path) {
			history.push({
				status,
				source: report.source,
				at,
				note: report.note ?? null,
			});
		}
		const data: Partial<PaymentIntent> = {
			status: target,
			statusHistory: history,
		};
		if (target === "succeeded") {
			data.settledAmount = report.amount ?? null;
			data.settledCurrency = report.currency?.toUpperCase() ?? null;
		}
		const updated = await saveIntent(payload, intentId, data, req);

		if (target === "succeeded")
			await handler.onSucceeded(payload, updated, req);
		else if (target !== "pending")
			await handler.onFailed(payload, updated, req);
		return { outcome: "applied", intent: updated };
	});
}

export async function settlePayment(
	payload: Payload,
	input: SettleInput,
): Promise<SettleOutcome> {
	const intent = await findIntentByReference(payload, {
		reference: input.reference,
		providerReference: input.providerTransactionId,
	});
	if (!intent) {
		payload.logger.warn({
			msg: "[payments] report for an unknown reference",
			reference: input.reference,
			providerTransactionId: input.providerTransactionId,
			source: input.source,
		});
		return { outcome: "unknown_reference" };
	}
	return applyStatus(payload, String(intent.id), {
		status: input.status,
		source: input.source,
		at: input.at,
		amount: input.amount,
		currency: input.currency,
	});
}
