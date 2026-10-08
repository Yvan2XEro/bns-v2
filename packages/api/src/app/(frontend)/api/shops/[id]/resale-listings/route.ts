import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { createResaleListing } from "@/services/resaleListings";

const bodySchema = z.object({
	productId: z.string().trim().min(1),
	prices: z
		.array(
			z.object({
				variantId: z.string().trim().min(1),
				price: z.number().int().positive(),
			}),
		)
		.min(1),
	desiredStatus: z.enum(["published", "draft"]),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const required = await requireUser(request);
	if (required instanceof Response) return required;
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const { id } = await params;
	try {
		const listing = await createResaleListing(
			required.payload,
			required.user,
			id,
			body.data,
		);
		return Response.json({ listing }, { status: 201 });
	} catch (error) {
		return handleServiceError("resale:create-listing", error);
	}
}
