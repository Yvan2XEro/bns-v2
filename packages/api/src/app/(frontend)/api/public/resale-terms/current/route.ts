import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { getCurrentResaleTerms } from "@/services/resale";

const roleSchema = z.enum(["supplier", "reseller"]);

export async function GET(request: Request) {
	const role = roleSchema.safeParse(
		new URL(request.url).searchParams.get("role"),
	);
	if (!role.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		const payload = await getPayload({ config });
		const terms = await getCurrentResaleTerms(payload, role.data);
		if (!terms) return errorResponse(ERROR_CODES.notFound, 404);
		return Response.json(terms);
	} catch {
		return errorResponse(ERROR_CODES.server, 500);
	}
}
