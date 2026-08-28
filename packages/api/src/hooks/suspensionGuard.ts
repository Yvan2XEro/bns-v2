import { APIError, type Payload } from "payload";
import { isSuspended } from "../access/roles";
import { ERROR_CODES, fallbackMessage } from "../lib/errors";

export class SuspendedAccountError extends APIError {
	constructor() {
		super(fallbackMessage(ERROR_CODES.accountSuspended), 403, {
			code: ERROR_CODES.accountSuspended,
		});
	}
}

export interface SuspensionCheckable {
	id?: string;
	role?: string | null;
	suspendedAt?: string | Date | null;
	suspendedUntil?: string | Date | null;
}

/**
 * `known` short-circuits the lookup when the acting user is the subject, which
 * is the common case. The round-trip only happens where the writer is not the
 * subject — today, messages persisted by chat-service under a service token.
 */
export async function resolveSuspension(
	payload: Payload,
	userId: string,
	known?: SuspensionCheckable | null,
): Promise<boolean> {
	if (known?.id && String(known.id) === String(userId)) {
		return isSuspended(known);
	}

	try {
		const user = await payload.findByID({
			collection: "users",
			id: userId,
			depth: 0,
			overrideAccess: true,
			select: { suspendedAt: true, suspendedUntil: true },
		});
		return isSuspended(user as SuspensionCheckable);
	} catch {
		// A missing user is a validation problem, not a moderation one.
		return false;
	}
}

export async function assertNotSuspended(
	payload: Payload,
	userId: string,
	known?: SuspensionCheckable | null,
): Promise<void> {
	if (await resolveSuspension(payload, userId, known)) {
		throw new SuspendedAccountError();
	}
}
