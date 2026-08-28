import config from "@payload-config";
import { getPayload, type Payload } from "payload";
import { isModerator } from "../access/roles";
import type { Actor } from "../services/moderation";
import { ModerationError } from "../services/moderation";
import { ERROR_CODES, errorResponse } from "./errors";

export interface ModerationContext {
	payload: Payload;
	actor: Actor;
}

/**
 * Resolves the caller and refuses anyone below moderator. Returns a Response
 * on refusal so handlers can `if (ctx instanceof Response) return ctx`.
 */
export async function requireModerator(
	request: Request,
): Promise<ModerationContext | Response> {
	const payload = await getPayload({ config });
	const { user } = await payload.auth({ headers: request.headers });

	if (!user) return errorResponse(ERROR_CODES.unauthorized, 401);
	if (!isModerator(user as { role?: string })) {
		return errorResponse(ERROR_CODES.moderationForbidden, 403);
	}

	return {
		payload,
		actor: { id: String(user.id), role: (user as { role?: string }).role },
	};
}

export async function readJson(
	request: Request,
): Promise<Record<string, unknown>> {
	try {
		const body = await request.json();
		return body && typeof body === "object"
			? (body as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

/**
 * Business failures keep their code so the clients can translate them;
 * anything else is logged and reported as a generic 500 so a driver message
 * can never reach a client.
 */
export function handleModerationError(scope: string, error: unknown): Response {
	if (error instanceof ModerationError) {
		return errorResponse(error.code, error.status);
	}
	console.error(`[moderation:${scope}]`, error);
	return errorResponse(ERROR_CODES.server, 500);
}
