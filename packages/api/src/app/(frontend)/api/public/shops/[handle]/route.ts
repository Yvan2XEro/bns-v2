import config from "@payload-config";
import { getPayload } from "payload";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError } from "@/lib/shopRoute";
import { resolvePublicShop } from "@/services/shops";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ handle: string }> },
) {
	const { handle } = await params;
	let decoded: string;
	try {
		decoded = decodeURIComponent(handle);
	} catch {
		// A malformed percent-escape is never a real handle: answer the same
		// "not found" a stranger gets for any other handle that doesn't exist,
		// not a 500.
		return errorResponse(ERROR_CODES.shopNotFound, 404);
	}
	try {
		const payload = await getPayload({ config });
		const result = await resolvePublicShop(payload, decoded);
		if (!result) return errorResponse(ERROR_CODES.shopNotFound, 404);
		return Response.json(result);
	} catch (error) {
		return handleServiceError("public", error);
	}
}
