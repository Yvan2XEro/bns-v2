import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import { handleModerationError } from "../../src/lib/moderationRoute";
import { ServiceError } from "../../src/lib/serviceError";
import { ModerationError } from "../../src/services/moderation";

async function bodyOf(response: Response): Promise<{ code?: string }> {
	return (await response.json()) as { code?: string };
}

/**
 * `handleModerationError` used to match `ModerationError` alone. Every
 * moderation route that calls a service raising the BASE class — which
 * `services/verification.ts` does on every business refusal — therefore
 * answered 500, so a caller could not tell "you may not do that" from
 * "we broke". These pin both classes reaching their own code.
 */
describe("handleModerationError", () => {
	it("keeps the code of a ModerationError", async () => {
		const response = handleModerationError(
			"scope",
			new ModerationError(ERROR_CODES.forbidden, 403),
		);
		expect(response.status).toBe(403);
		expect((await bodyOf(response)).code).toBe(ERROR_CODES.forbidden);
	});

	it("keeps the code of a plain ServiceError, which a verification refusal is", async () => {
		const response = handleModerationError(
			"scope",
			new ServiceError(ERROR_CODES.verificationInvalidTransition, 409),
		);
		expect(response.status).toBe(409);
		expect((await bodyOf(response)).code).toBe(
			ERROR_CODES.verificationInvalidTransition,
		);
	});

	it("still hides an unexpected failure behind a generic 500", async () => {
		const response = handleModerationError(
			"scope",
			new Error("driver blew up"),
		);
		expect(response.status).toBe(500);
		expect((await bodyOf(response)).code).toBe(ERROR_CODES.server);
	});
});
