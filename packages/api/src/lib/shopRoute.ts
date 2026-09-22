import type { Payload } from "payload";
import { SuspendedAccountError } from "../hooks/suspensionGuard";
import { ModerationError } from "../services/moderation";
import type { ServiceUser } from "../services/shops";
import { ERROR_CODES, errorResponse } from "./errors";
import { ServiceError } from "./serviceError";

export function toServiceUser(user: unknown): ServiceUser {
	const u = user as ServiceUser & { id: unknown };
	return {
		id: String(u.id),
		role: u.role ?? null,
		name: u.name ?? null,
		suspendedAt: u.suspendedAt ?? null,
		suspendedUntil: u.suspendedUntil ?? null,
	};
}

/**
 * `config` and `getPayload` are loaded lazily so importing this module never
 * pulls in `@payload-config`: `endpoints/shops.ts` reaches this file from
 * inside the Shops collection, which `@payload-config` itself builds, and a
 * top-level import here would make that a circular load.
 */
export async function requireUser(
	request: Request,
): Promise<{ payload: Payload; user: ServiceUser } | Response> {
	const [{ default: config }, { getPayload }] = await Promise.all([
		import("@payload-config"),
		import("payload"),
	]);
	const payload = await getPayload({ config });
	const { user } = await payload.auth({ headers: request.headers });
	if (!user) return errorResponse(ERROR_CODES.unauthorized, 401);
	return { payload, user: toServiceUser(user) };
}

/**
 * Business failures keep their code; anything else is logged and reported as
 * generic.server so driver text never reaches a client.
 */
export function handleServiceError(scope: string, error: unknown): Response {
	if (error instanceof ServiceError || error instanceof ModerationError) {
		return errorResponse(error.code, error.status);
	}
	if (error instanceof SuspendedAccountError) {
		return errorResponse(ERROR_CODES.accountSuspended, 403);
	}
	console.error(`[shops:${scope}]`, error);
	return errorResponse(ERROR_CODES.server, 500);
}
