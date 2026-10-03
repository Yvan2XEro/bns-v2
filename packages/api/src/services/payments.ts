import type { Payload, PayloadRequest } from "payload";
import { ERROR_CODES } from "../lib/errors";
import type { NormalizedPayment, ProviderName } from "../lib/payments/types";
import {
	canTransition,
	type IntentStatus,
	transitionPath,
} from "../lib/paymentTransitions";
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
	/** Overrides the P0 default of `now + INTENT_TTL_MS` (checkout uses its own window). */
	expiresAt?: Date;
	/** The marketplace fields a `checkout` intent carries from its first write. */
	checkout?: Pick<
		PaymentIntent,
		| "channel"
		| "payerPhone"
		| "connectedAccount"
		| "destinationAmount"
		| "applicationFee"
		| "attempt"
	>;
}

export type FailureCode = NonNullable<PaymentIntent["failureCode"]>;

export interface StatusReport {
	status: IntentStatus;
	source: StatusSource;
	at?: Date;
	amount?: number | null;
	currency?: string | null;
	note?: string;
	/** Stored on the intent when the report fails it. */
	failureCode?: FailureCode | null;
}

export interface SettleInput extends NormalizedPayment {
	source: StatusSource;
	at?: Date;
	failureCode?: FailureCode | null;
}

export type AppliedOutcome = {
	outcome:
		| "applied"
		| "unchanged"
		| "ignored"
		| "amount_mismatch"
		| "late_success";
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
	req?: TxReq,
): Promise<IntentDoc | null> {
	const result = await payload.find({
		collection: COLLECTION,
		where: { [field]: { equals: value } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return result.docs[0] ?? null;
}

/**
 * Compare-and-swap: the write applies only while the intent still holds the
 * status it was read with. `db.updateOne` with a `where` is a single
 * `findOneAndUpdate`, unlike the collection-level bulk update, which finds and
 * then writes by id — the predicate has to reach the database to serialise two
 * reports arriving together, which is the case on a deployment without
 * `replicaSet` (see `lib/transactions.ts`). Returns null when the intent moved
 * under us and the caller has to decide again.
 */
async function saveIntentIf(
	payload: Payload,
	id: string,
	expectedStatus: IntentStatus,
	data: Partial<PaymentIntent>,
	req?: TxReq,
): Promise<IntentDoc | null> {
	const swapped = await payload.db.updateOne({
		collection: COLLECTION,
		where: {
			and: [{ id: { equals: id } }, { status: { equals: expectedStatus } }],
		},
		data: { ...data },
		req,
	});
	// The adapter returns the raw document; read it back through the collection
	// so the caller gets the same shape every other read gives.
	return swapped ? loadIntent(payload, id, req) : null;
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
			currency: input.currency.toUpperCase(),
			provider: input.provider,
			idempotencyKey: input.idempotencyKey,
			status: "created",
			statusHistory: [
				{ status: "created", source: "system", at: now.toISOString() },
			],
			expiresAt: (
				input.expiresAt ?? new Date(now.getTime() + INTENT_TTL_MS)
			).toISOString(),
			...(input.checkout ?? {}),
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
	req?: TxReq,
): Promise<IntentDoc | null> {
	return findOne(payload, "idempotencyKey", key, req);
}

/** Resolves `PI-{id}`, legacy `BOOST-{id}`, then the provider's own id. */
export async function findIntentByReference(
	payload: Payload,
	{
		reference,
		providerReference,
	}: { reference?: string | null; providerReference?: string | null },
	req?: TxReq,
): Promise<IntentDoc | null> {
	if (reference?.startsWith("PI-")) {
		const byId = await loadIntent(payload, reference.slice(3), req).catch(
			() => null,
		);
		if (byId) return byId;
	}
	if (reference) {
		const byReference = await findOne(payload, "reference", reference, req);
		if (byReference) return byReference;
	}
	if (providerReference)
		return findOne(payload, "providerReference", providerReference, req);
	return null;
}

async function moveIntentToPending(
	payload: Payload,
	intentId: string,
	details: {
		providerReference: string;
		checkoutUrl: string | null;
		now?: Date;
	},
	req: TxReq,
): Promise<IntentDoc> {
	const intent = await loadIntent(payload, intentId, req);
	const data: Partial<PaymentIntent> = {
		providerReference: details.providerReference,
		checkoutUrl: details.checkoutUrl,
	};
	if (transitionPath(intent.status, "pending").length > 0) {
		const moved = await saveIntentIf(
			payload,
			intentId,
			intent.status,
			{
				...data,
				status: "pending",
				statusHistory: [
					...(intent.statusHistory ?? []),
					{
						status: "pending",
						source: "system",
						at: (details.now ?? new Date()).toISOString(),
					},
				],
			},
			req,
		);
		if (moved) return moved;
	}
	// A fast webhook may already have settled the intent; keep its status and
	// record only what the provider call told us.
	return saveIntent(payload, intentId, data, req);
}

/**
 * Moves the intent to `pending` with the provider's checkout details. Pass an
 * existing `req` to fold this into a caller's own transaction (so a sibling
 * write, e.g. the legacy `boost-payments` fields, lands atomically with it);
 * without one, it opens and commits its own.
 */
export function markIntentPending(
	payload: Payload,
	intentId: string,
	details: {
		providerReference: string;
		checkoutUrl: string | null;
		now?: Date;
	},
	req?: TxReq,
): Promise<IntentDoc> {
	if (req) return moveIntentToPending(payload, intentId, details, req);
	return withTransaction(payload, (txReq) =>
		moveIntentToPending(payload, intentId, details, txReq),
	);
}

/**
 * Fails an intent the provider never accepted (`created`/`pending` → `failed`)
 * with a failure code. The purpose handler runs as for any failure, so a
 * checkout's last attempt failing at the provider still ends the order. Null
 * when the intent had already moved on.
 */
export async function failIntentBeforeProvider(
	payload: Payload,
	intentId: string,
	details: {
		failureCode: NonNullable<PaymentIntent["failureCode"]>;
		providerReference?: string | null;
		note?: string;
		now?: Date;
	},
): Promise<IntentDoc | null> {
	return withTransaction(payload, async (req) => {
		const intent = await loadIntent(payload, intentId, req);
		if (!canTransition(intent.status, "failed")) return null;
		const failed = await saveIntentIf(
			payload,
			intentId,
			intent.status,
			{
				status: "failed",
				failureCode: details.failureCode,
				...(details.providerReference
					? { providerReference: details.providerReference }
					: {}),
				statusHistory: [
					...(intent.statusHistory ?? []),
					{
						status: "failed",
						source: "system",
						at: (details.now ?? new Date()).toISOString(),
						note: details.note ?? null,
					},
				],
			},
			req,
		);
		if (failed)
			await PURPOSE_HANDLERS[failed.purpose].onFailed(payload, failed, req);
		return failed;
	});
}

/** Kept out of `statusHistory`: a customer can read their own intent in full. */
const MISMATCH_NOTE = "the provider reported a different amount";

const reportedOf = (report: StatusReport) => ({
	amount: report.amount ?? null,
	currency: report.currency?.toUpperCase() ?? null,
});

const matchesIntent = (intent: IntentDoc, report: StatusReport) => {
	const reported = reportedOf(report);
	return (
		reported.amount === intent.amount && reported.currency === intent.currency
	);
};

/**
 * A success reported on an intent already closed. A purpose that knows what
 * to do with the money (`onLateSuccess`) gets the intent flagged once —
 * status kept, `lateSuccess: true` — and a replay of the same success finds
 * the flag and writes nothing. Any other purpose keeps P0's ignore-and-alert.
 */
async function closedSuccess(
	payload: Payload,
	intent: IntentDoc,
	report: StatusReport,
	history: HistoryEntry[],
	at: string,
	req: PayloadRequest,
): Promise<AppliedOutcome | null> {
	const handler = PURPOSE_HANDLERS[intent.purpose];
	const id = String(intent.id);
	if (!handler.onLateSuccess || intent.status === "succeeded") return null;
	if (intent.lateSuccess) return { outcome: "unchanged", intent };
	if (!matchesIntent(intent, report)) {
		logMismatch(payload, intent, report);
		await handler.onAmountMismatch?.(payload, intent, reportedOf(report), req);
		return { outcome: "amount_mismatch", intent };
	}
	history.push({
		status: "succeeded",
		source: report.source,
		at,
		note: `late success: intent is ${intent.status}`,
	});
	const updated = await saveIntentIf(
		payload,
		id,
		intent.status,
		{
			statusHistory: history,
			lateSuccess: true,
			settledAmount: report.amount ?? null,
			settledCurrency: reportedOf(report).currency,
		},
		req,
	);
	if (!updated) return null;
	await handler.onLateSuccess(payload, updated, req);
	return { outcome: "late_success", intent: updated };
}

function logMismatch(
	payload: Payload,
	intent: IntentDoc,
	report: StatusReport,
): void {
	payload.logger.error({
		msg: "[payments] provider amount does not match the intent",
		code: ERROR_CODES.paymentAmountMismatch,
		intentId: String(intent.id),
		expected: { amount: intent.amount, currency: intent.currency },
		reported: reportedOf(report),
	});
}

async function attemptStatus(
	payload: Payload,
	intentId: string,
	report: StatusReport,
	req: PayloadRequest,
): Promise<AppliedOutcome | null> {
	const intent = await loadIntent(payload, intentId, req);
	const at = (report.at ?? new Date()).toISOString();
	const history: HistoryEntry[] = [...(intent.statusHistory ?? [])];
	const target = report.status;
	const handler = PURPOSE_HANDLERS[intent.purpose];
	const path = transitionPath(intent.status, target);

	// Only a report that could actually settle the intent is worth comparing:
	// on a closed intent the success belongs to the ignored branch below, which
	// alerts staff instead of writing a settled amount.
	if (target === "succeeded" && path.length > 0) {
		const currency = reportedOf(report).currency;
		if (!matchesIntent(intent, report)) {
			logMismatch(payload, intent, report);
			history.push({
				status: "succeeded",
				source: report.source,
				at,
				note: MISMATCH_NOTE,
			});
			const updated = await saveIntentIf(
				payload,
				intentId,
				intent.status,
				{
					statusHistory: history,
					settledAmount: report.amount ?? null,
					settledCurrency: currency,
				},
				req,
			);
			if (!updated) return null;
			await handler.onAmountMismatch?.(
				payload,
				updated,
				reportedOf(report),
				req,
			);
			return { outcome: "amount_mismatch", intent: updated };
		}
	}

	// Replaying a report re-runs its purpose handler, which is idempotent, so a
	// crash between the two writes heals on the next report — for a failure as
	// much as for a success.
	if (intent.status === target) {
		if (target === "succeeded") await handler.onSucceeded(payload, intent, req);
		else if (target !== "created" && target !== "pending")
			await handler.onFailed(payload, intent, req);
		return { outcome: "unchanged", intent };
	}

	if (path.length === 0 && target === "succeeded") {
		const late = await closedSuccess(payload, intent, report, history, at, req);
		if (late) return late;
	}

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
		const updated = await saveIntentIf(
			payload,
			intentId,
			intent.status,
			{ statusHistory: history },
			req,
		);
		return updated ? { outcome: "ignored", intent: updated } : null;
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
	if (target === "failed" && report.failureCode) {
		data.failureCode = report.failureCode;
	}
	const updated = await saveIntentIf(
		payload,
		intentId,
		intent.status,
		data,
		req,
	);
	if (!updated) return null;

	if (target === "succeeded") await handler.onSucceeded(payload, updated, req);
	else if (target !== "pending") await handler.onFailed(payload, updated, req);
	return { outcome: "applied", intent: updated };
}

export function applyStatus(
	payload: Payload,
	intentId: string,
	report: StatusReport,
): Promise<AppliedOutcome> {
	return withTransaction(payload, async (req) => {
		// A swap that matched nothing means another report moved the intent
		// between the read and the write, so the decision is taken again.
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const outcome = await attemptStatus(payload, intentId, report, req);
			if (outcome) return outcome;
		}
		throw new Error(
			`Could not apply status ${report.status} to intent ${intentId}`,
		);
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
		failureCode: input.failureCode ?? null,
	});
}
