import config from "@payload-config";
import { getPayload, type Payload } from "payload";
import { isModerator } from "../access/roles";
import type { Actor } from "../services/moderation";
import { ModerationError } from "../services/moderation";
import { ERROR_CODES, errorResponse } from "./errors";
import { readJsonBody } from "./readJsonBody";

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

export { readJsonBody as readJson } from "./readJsonBody";

export type SuspensionAction =
	| {
			action: "suspend";
			reason: string;
			durationDays: number | null;
			note: string | null;
	  }
	| { action: "unsuspend"; note: string | null; restoreListings: boolean };

/**
 * Shared by the user and shop moderation routes: both POST bodies are
 * `{ action: "suspend" | "unsuspend", ... }` with the same fields either
 * side of that split.
 */
export async function parseSuspensionAction(
	request: Request,
): Promise<SuspensionAction | Response> {
	const body = await readJsonBody(request);
	const note = typeof body.note === "string" ? body.note : null;

	if (body.action === "suspend") {
		// `durationDays: null` is an explicit request for an indefinite
		// suspension and is distinct from the key being absent, which is a
		// malformed body.
		if (!("durationDays" in body)) {
			return errorResponse(ERROR_CODES.moderationDurationInvalid, 400);
		}
		const durationDays =
			body.durationDays === null ? null : Number(body.durationDays);
		return {
			action: "suspend",
			reason: typeof body.reason === "string" ? body.reason : "",
			durationDays,
			note,
		};
	}

	if (body.action === "unsuspend") {
		return {
			action: "unsuspend",
			note,
			restoreListings: body.restoreListings !== false,
		};
	}

	return errorResponse(ERROR_CODES.badRequest, 400);
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
