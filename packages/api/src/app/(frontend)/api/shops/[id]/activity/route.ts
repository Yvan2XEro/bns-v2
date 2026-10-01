import { z } from "zod";
import {
	SHOP_ACTIVITY_ACTIONS,
	SHOP_ACTIVITY_TARGET_TYPES,
} from "@/collections/ShopActivityLog";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listShopActivity } from "@/services/shopActivity";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const querySchema = z.object({
	actor: z.string().trim().min(1).optional(),
	action: z.enum(SHOP_ACTIVITY_ACTIONS).optional(),
	targetType: z.enum(SHOP_ACTIVITY_TARGET_TYPES).optional(),
	cursor: z.string().datetime().optional(),
});

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const search = new URL(request.url).searchParams;
	const query = querySchema.safeParse({
		actor: search.get("actor") ?? undefined,
		action: search.get("action") ?? undefined,
		targetType: search.get("targetType") ?? undefined,
		cursor: search.get("cursor") ?? undefined,
	});
	if (!query.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await listShopActivity(ctx.payload, ctx.user, parsed.data.id, query.data),
		);
	} catch (error) {
		return handleServiceError("team:activity", error);
	}
}
