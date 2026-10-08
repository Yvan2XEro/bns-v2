import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, requireUser } from "@/lib/shopRoute";
import { updateSupplierResaleSettings } from "@/services/resaleSupplier";

const bodySchema = z.object({
	enabled: z.boolean(),
	approvalRequired: z.boolean(),
	handlingHours: z.number().int().min(4).max(120),
	codAccepted: z.boolean(),
	resellerNotes: z.string().max(1000),
	variants: z
		.array(
			z.object({
				id: z.string().trim().min(1),
				enabled: z.boolean(),
				supplierPrice: z.number().int().positive(),
				minRetailPrice: z.number().int().positive(),
				suggestedRetailPrice: z.number().int().positive(),
			}),
		)
		.min(1),
});

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const required = await requireUser(request);
	if (required instanceof Response) return required;
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const { id } = await params;
	try {
		await updateSupplierResaleSettings(
			required.payload,
			required.user,
			id,
			body.data,
		);
		return Response.json({ ok: true });
	} catch (error) {
		return handleServiceError("resale:update-supplier-settings", error);
	}
}
