import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { listShopAds } from "@/services/shopListings";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

/** The shop's ads that are not products, for its workspace (`?filter=&page=`). */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const search = new URL(request.url).searchParams;
	try {
		return Response.json(
			await listShopAds(ctx.payload, ctx.user, parsedParams.data.id, {
				filter: search.get("filter"),
				page: search.get("page"),
			}),
		);
	} catch (error) {
		return handleServiceError("listings:list", error);
	}
}
