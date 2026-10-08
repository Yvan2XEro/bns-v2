import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import { confirmShipmentRemittance } from "@/services/delivery/codRemittance";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z
	.object({
		action: z.enum(["confirm", "dispute"]),
		note: z.string().trim().max(500).optional(),
	})
	.strict();

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;
	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const shipment = await withTransaction(
			ctx.payload,
			async (req) => {
				const current = await req.payload.findByID({
					collection: "shipments",
					id: parsedParams.data.id,
					depth: 0,
					overrideAccess: true,
					req,
				});
				return confirmShipmentRemittance(
					req,
					current,
					ctx.user,
					body.data.action,
					body.data.note,
				);
			},
			{ user: ctx.user },
		);
		return Response.json({
			id: String(shipment.id),
			remittanceStatus: shipment.codCollection?.remittanceStatus ?? null,
		});
	} catch (error) {
		return handleServiceError("shipments:cod-remittance", error);
	}
}
