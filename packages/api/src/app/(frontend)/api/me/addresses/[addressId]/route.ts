import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { deleteAddress, updateAddress } from "@/services/addresses";

const paramsSchema = z.object({ addressId: z.string().trim().min(1) });
const bodySchema = z.record(z.unknown());
type Params = { params: Promise<{ addressId: string }> };

export async function PATCH(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		return Response.json(
			await updateAddress(
				ctx.payload,
				ctx.user,
				parsed.data.addressId,
				body.data,
			),
		);
	} catch (error) {
		return handleServiceError("addresses:update", error);
	}
}

export async function DELETE(request: Request, { params }: Params) {
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	try {
		await deleteAddress(ctx.payload, ctx.user, parsed.data.addressId);
		return Response.json({ ok: true });
	} catch (error) {
		return handleServiceError("addresses:delete", error);
	}
}
