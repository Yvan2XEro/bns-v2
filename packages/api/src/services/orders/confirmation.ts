import type { Payload, PayloadRequest } from "payload";
import { ORDER_SERVICE_CONTEXT } from "../../collections/Orders";
import { ERROR_CODES } from "../../lib/errors";
import {
	CONFIRMATION_CODE_LENGTH,
	CONFIRMATION_MAX_ATTEMPTS,
	CONFIRMATION_TTL_MS,
	canResend,
	checkConfirmation,
	generateCode,
	hashConfirmationCode,
} from "../../lib/orderCodes";
import { ServiceError } from "../../lib/serviceError";
import { commitContextOf, onCommit } from "../../lib/transactions";
import type { Order } from "../../payload-types";
import { confirmationCodeSms, sendOrderSms } from "./sms";
import { appendOrderEvent } from "./transitions";

/**
 * `req.payload.config.secret` rather than `process.env.PAYLOAD_SECRET`
 * directly: the hash must be reproducible from whatever secret the running
 * Payload instance was actually initialised with, which is also what makes
 * it swappable in a test's fake.
 */
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

/** Mirrors `canResend` (Task 4) over an `Order`, for callers deciding whether to show a resend button before ever calling `issueConfirmationCode`. */
export function canResendConfirmation(order: Order, now: Date): boolean {
	return canResend(order.confirmation ?? {}, now);
}

/**
 * Generates a fresh six-digit code, stores only its salted hash, and queues
 * the SMS for after the caller's transaction commits — the function never
 * opens its own transaction, so a `ship`/`placeOrder`-style caller that wraps
 * several writes together gets this one write inside the same transaction
 * as the rest, and the SMS fires only once that whole operation is durable.
 *
 * Returns the plaintext code once; nothing it writes carries it.
 */
export async function issueConfirmationCode(
	req: PayloadRequest,
	order: Order,
	options: { resend: boolean },
): Promise<{ code: string; expiresAt: string }> {
	const now = new Date();
	if (options.resend && !canResend(order.confirmation ?? {}, now)) {
		throw new ServiceError(ERROR_CODES.orderCodeResendLimit, 429);
	}

	const secret = requireSecret(req.payload);
	const code = generateCode(CONFIRMATION_CODE_LENGTH);
	const codeHash = hashConfirmationCode(
		secret,
		String(order.id),
		order.delivery.phone,
		code,
	);
	const expiresAt = new Date(now.getTime() + CONFIRMATION_TTL_MS).toISOString();
	const resendCount = options.resend
		? (order.confirmation?.resendCount ?? 0) + 1
		: (order.confirmation?.resendCount ?? 0);

	await req.payload.update({
		collection: "orders",
		id: order.id,
		req,
		overrideAccess: true,
		context: ORDER_SERVICE_CONTEXT,
		data: {
			confirmation: {
				...order.confirmation,
				method: "sms_code",
				codeHash,
				codeExpiresAt: expiresAt,
				attempts: 0,
				sentAt: now.toISOString(),
				resendCount,
			},
		},
	});
	await appendOrderEvent(req, order, {
		type: "order.confirmation_code_sent",
		actorType: "system",
		visibility: "buyer",
	});

	const { orderNumber } = order;
	const phone = order.delivery.phone;
	const locale = localeOf(order);
	onCommit(commitContextOf(req), () =>
		sendOrderSms(req.payload, {
			to: phone,
			text: confirmationCodeSms({ orderNumber, code }, locale),
		}),
	);

	return { code, expiresAt };
}

/**
 * Verifies a buyer-supplied code against the stored hash. Writes nothing on
 * success — the transition that confirmation unlocks (placed → confirmed) is
 * a different service's job (Task 21), applied in its own transaction.
 *
 * A wrong code *does* write here, in its own single-write operation that
 * commits independently of whatever the caller does next: the attempt must
 * survive even though this function then throws and a caller that wrapped
 * this call in a transaction of its own would otherwise rolls it back.
 */
export async function verifyConfirmationCode(
	req: PayloadRequest,
	order: Order,
	code: string,
): Promise<{ ok: true }> {
	const now = new Date();
	const secret = requireSecret(req.payload);
	const candidateHash = hashConfirmationCode(
		secret,
		String(order.id),
		order.delivery.phone,
		code,
	);

	const check = checkConfirmation(order.confirmation ?? {}, candidateHash, now);
	if (check.ok) return { ok: true };

	if (check.reason === "invalid") {
		const attempts = (order.confirmation?.attempts ?? 0) + 1;
		const hitLimit = attempts >= CONFIRMATION_MAX_ATTEMPTS;
		await req.payload.update({
			collection: "orders",
			id: order.id,
			overrideAccess: true,
			context: ORDER_SERVICE_CONTEXT,
			data: { confirmation: { ...order.confirmation, attempts } },
		});
		if (hitLimit) throw new ServiceError(ERROR_CODES.phoneTooManyAttempts, 429);
		throw new ServiceError(ERROR_CODES.orderConfirmationCodeInvalid, 400);
	}

	if (check.reason === "attempts") {
		throw new ServiceError(ERROR_CODES.phoneTooManyAttempts, 429);
	}
	throw new ServiceError(ERROR_CODES.orderConfirmationCodeExpired, 400);
}
