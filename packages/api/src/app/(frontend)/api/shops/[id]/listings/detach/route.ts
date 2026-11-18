import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { detachListings } from "@/services/shopListings";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = await readBody(request);
	try {
		return Response.json(
			await detachListings(ctx.payload, ctx.user, parsedParams.data.id, {
				listingIds: body.listingIds,
			}),
		);
	} catch (error) {
		return handleServiceError("listings:detach", error);
	}
}
