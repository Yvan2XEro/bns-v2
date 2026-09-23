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
	try {
		const payload = await getPayload({ config });
		const result = await resolvePublicShop(payload, decodeURIComponent(handle));
		if (!result) return errorResponse(ERROR_CODES.shopNotFound, 404);
		return Response.json(result);
	} catch (error) {
		return handleServiceError("public", error);
	}
}
