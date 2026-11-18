import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/shopRoute";
import { declineInvitation } from "@/services/shopMembers";

const paramsSchema = z.object({ token: z.string().trim().min(1).max(128) });

/**
 * Deliberately unauthenticated: someone who does not want to join should not
 * have to create an account to say so. Possession of the token is the
 * authority, and declining destroys nothing that cannot be reissued.
 */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		const payload = await getPayload({ config });
		return Response.json(await declineInvitation(payload, parsed.data.token));
	} catch (error) {
		return handleServiceError("invitation:decline", error);
	}
}
