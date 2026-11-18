import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { updateResaleListingPrices } from "@/services/resaleResold";

const bodySchema = z.object({
	prices: z
		.array(
			z.object({
				variantId: z.string().trim().min(1),
				price: z.number().int().positive(),
			}),
		)
		.min(1),
});

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string; listingId: string }> },
) {
	const required = await requireUser(request);
	if (required instanceof Response) return required;
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const { id, listingId } = await params;
	try {
		await updateResaleListingPrices(
			required.payload,
			required.user,
			id,
			listingId,
			body.data,
		);
		return Response.json({ ok: true });
	} catch (error) {
		return handleServiceError("resale:update-listing-prices", error);
	}
}
