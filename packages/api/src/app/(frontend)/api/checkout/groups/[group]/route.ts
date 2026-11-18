import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { readCheckoutGroup } from "@/services/checkoutGroup";

const paramsSchema = z.object({ group: z.string().trim().min(1) });

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ group: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		return Response.json(
			await readCheckoutGroup(ctx.payload, ctx.user, parsed.data.group),
		);
	} catch (error) {
		return handleServiceError("checkout:group", error);
	}
}
