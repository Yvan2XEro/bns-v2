import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { changeShopHandle } from "@/services/shops";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/** Owner only; `changeShopHandle` enforces it. */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = await readBody(request);
	try {
		return Response.json(
			await changeShopHandle(
				ctx.payload,
				ctx.user,
				parsed.data.id,
				body.handle,
			),
		);
	} catch (error) {
		return handleServiceError("handle", error);
	}
}
