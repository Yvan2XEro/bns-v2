import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { CLIENT_MOVEMENT_TYPES, recordMovement } from "@/services/stock";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

// Shape only: which sign a type allows, and whether unitCost applies, stay
// the service's business rules (`parseMovementInput`).
const bodySchema = z.object({
	type: z.enum(CLIENT_MOVEMENT_TYPES),
	quantity: z.number(),
	unitCost: z.number().nullable().optional(),
	note: z.string().nullable().optional(),
});

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = await readBody(request);
	const parsedBody = bodySchema.safeParse(body);
	if (!parsedBody.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		const { movement, variant } = await recordMovement(
			ctx.payload,
			ctx.user,
			parsedParams.data.id,
			body,
		);
		return Response.json({ movement, variant }, { status: 201 });
	} catch (error) {
		return handleServiceError("stock:move", error);
	}
}
