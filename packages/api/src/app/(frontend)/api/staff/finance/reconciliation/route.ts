import config from "@payload-config";
import { getPayload } from "payload";
import { z } from "zod";
import { isAdmin } from "@/access/roles";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { reconciliationReport } from "@/services/reconciliation";

const query = z.object({
	run: z
		.string()
		.regex(/^[A-Za-z0-9_-]{1,64}$/)
		.optional(),
});

/** `GET /api/staff/finance/reconciliation?run=`: one run and its mismatches, the latest run without `run`. Admins only. */
export async function GET(request: Request) {
	const payload = await getPayload({ config });
	const { user } = await payload.auth({ headers: request.headers });
	if (!user) return errorResponse(ERROR_CODES.unauthorized, 401);
	if (!isAdmin(user as { role?: string })) {
		return errorResponse(ERROR_CODES.forbidden, 403);
	}

	const run = new URL(request.url).searchParams.get("run");
	const parsed = query.safeParse({ run: run ?? undefined });
	if (!parsed.success) return errorResponse(ERROR_CODES.validation, 400);

	try {
		const report = await reconciliationReport(payload, parsed.data.run);
		if (!report) return errorResponse(ERROR_CODES.notFound, 404);
		return Response.json(report);
	} catch (error) {
		console.error("[staff:reconciliation]", error);
		return errorResponse(ERROR_CODES.server, 500);
	}
}
