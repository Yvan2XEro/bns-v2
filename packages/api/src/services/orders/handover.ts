import type { Payload, PayloadRequest } from "payload";
import type { ORDER_EVENT_TYPES } from "../../collections/OrderEvents";
import { ORDER_SERVICE_CONTEXT } from "../../collections/Orders";
import { ERROR_CODES } from "../../lib/errors";
import {
	canRegenerate,
	checkHandover,
	generateCode,
	HANDOVER_CODE_LENGTH,
	HANDOVER_MAX_ATTEMPTS,
	hashHandoverCode,
} from "../../lib/orderCodes";
import { ServiceError } from "../../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	withTransaction,
} from "../../lib/transactions";
import type { Order } from "../../payload-types";
import { handoverCodeSms, sendOrderSms } from "./sms";

/** The same actor shapes `order-events.actorType`/`actor` already carry; a
 * courier has no account in this system, so `id` is optional. */
export type HandoverActor = {
	type: "buyer" | "seller" | "staff" | "system" | "courier";
	id?: string;
};

function requireSecret(payload: Payload): string {
	const secret = payload.config.secret;
	if (!secret) {
		throw new Error("[orders] PAYLOAD_SECRET is not configured");
	}
	return secret;
}

function localeOf(order: Order): "fr" | "en" {
	return order.contract?.locale === "en" ? "en" : "fr";
}

/** Mirrors `canRegenerate` (Task 4) over an `Order`. */
export function canRegenerateHandover(order: Order): boolean {
	return canRegenerate(order.handover ?? {});
}

/**
 * Generates a fresh four-digit handover code, stores only its salted hash,
 * and queues the SMS for after the caller's transaction commits. Like
 * `issueConfirmationCode`, this writes through the `req` it is given rather
 * than opening its own transaction, so a `ship` transition that issues the
 * first code gets it inside the same commit as the rest of shipping, and a
 * buyer-initiated regenerate (its own, single-operation request) gets its
 * own.
 *
 * Returns the plaintext code once, for the regenerate response to show the
 * buyer who just asked for it — the initial, ship-time call simply discards
 * it and lets the SMS carry the code instead.
 */
export async function issueHandoverCode(
	req: PayloadRequest,
	order: Order,
	options: { regenerate: boolean },
): Promise<{ code: string }> {
	if (options.regenerate && !canRegenerate(order.handover ?? {})) {
		throw new ServiceError(ERROR_CODES.orderHandoverLocked, 429);
	}

	const secret = requireSecret(req.payload);
	const code = generateCode(HANDOVER_CODE_LENGTH);
	const codeHash = hashHandoverCode(secret, String(order.id), code);
	const now = new Date();
	const regenerateCount = options.regenerate
		? (order.handover?.regenerateCount ?? 0) + 1
		: (order.handover?.regenerateCount ?? 0);

	await req.payload.update({
		collection: "orders",
		id: order.id,
		req,
		overrideAccess: true,
		context: ORDER_SERVICE_CONTEXT,
		data: {
			handover: {
				...order.handover,
				codeHash,
				attempts: 0,
				lockedAt: null,
				sentAt: now.toISOString(),
				regenerateCount,
			},
		},
	});
	await req.payload.create({
		collection: "order-events",
		req,
		overrideAccess: true,
		data: {
			order: order.id,
			type: options.regenerate
				? "order.handover_code_regenerated"
				: "order.handover_code_sent",
			actorType: "system",
			visibility: "both",
		},
	});

	const { orderNumber } = order;
	const phone = order.delivery.phone;
	const total = order.amounts?.total ?? 0;
	const locale = localeOf(order);
	onCommit(commitContextOf(req), () =>
		sendOrderSms(req.payload, {
			to: phone,
			text: handoverCodeSms({ orderNumber, code, total }, locale),
		}),
	);

	return { code };
}

/**
 * Verifies a courier-supplied code against the stored hash. Writes nothing
 * on success — `delivery.ts` (Task 20) applies the actual delivery
 * transition, in its own transaction, once this has answered `ok`.
 *
 * A wrong code writes an attempt (and, at the budget, the lock) together
 * with the order event that records who tried — both in one transaction
 * that this function opens and commits on its own, so the record survives
 * regardless of what the caller does after this throws.
 */
export async function verifyHandoverCode(
	req: PayloadRequest,
	order: Order,
	code: string,
	options: { actor: HandoverActor; shipmentId?: string },
): Promise<{ ok: true }> {
	const secret = requireSecret(req.payload);
	const candidateHash = hashHandoverCode(secret, String(order.id), code);

	const check = checkHandover(order.handover ?? {}, candidateHash);
	if (check.ok) return { ok: true };

	if (check.reason === "invalid") {
		const attempts = (order.handover?.attempts ?? 0) + 1;
		const hitLock = attempts >= HANDOVER_MAX_ATTEMPTS;
		const eventType: (typeof ORDER_EVENT_TYPES)[number] = hitLock
			? "order.handover_locked"
			: "order.handover_failed_attempt";

		await withTransaction(
			req.payload,
			async (txReq) => {
				await txReq.payload.update({
					collection: "orders",
					id: order.id,
					req: txReq,
					overrideAccess: true,
					context: ORDER_SERVICE_CONTEXT,
					data: {
						handover: {
							...order.handover,
							attempts,
							...(hitLock ? { lockedAt: new Date().toISOString() } : {}),
						},
					},
				});
				await txReq.payload.create({
					collection: "order-events",
					req: txReq,
					overrideAccess: true,
					data: {
						order: order.id,
						type: eventType,
						actorType: options.actor.type,
						actor: options.actor.id,
						visibility: "both",
						metadata: options.shipmentId
							? { shipmentId: options.shipmentId }
							: null,
					},
				});
			},
			{ user: req.user ?? null },
		);

		if (hitLock) throw new ServiceError(ERROR_CODES.orderHandoverLocked, 429);
		throw new ServiceError(ERROR_CODES.orderHandoverCodeInvalid, 400);
	}

	throw new ServiceError(ERROR_CODES.orderHandoverLocked, 429);
}
