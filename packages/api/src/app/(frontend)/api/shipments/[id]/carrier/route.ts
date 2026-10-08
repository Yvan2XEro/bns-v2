import { z } from "zod";
import {
	CourierCapabilityError,
	CourierNotConfiguredError,
	CourierUnavailableError,
} from "@/lib/delivery/registry";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import { withTransaction } from "@/lib/transactions";
import {
	flagCourierCancellationRefused,
	switchShipmentCarrier,
} from "@/services/delivery/courierShipments";
import { requireShopShipment } from "@/services/delivery/routeAccess";
import { nextNumber } from "@/services/sequences";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.discriminatedUnion("carrier", [
	z.object({ carrier: z.literal("self") }).strict(),
	z
		.object({
			carrier: z.literal("courier"),
			courierId: z.string().trim().min(1),
		})
		.strict(),
]);

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
		const shipmentNumber = await nextNumber(ctx.payload, "SHP", new Date());
		const result = await withTransaction(
			ctx.payload,
			async (req) => {
				const { shipment } = await requireShopShipment(
					ctx.payload,
					ctx.user,
					parsedParams.data.id,
					"orders.process",
					req,
				);
				return switchShipmentCarrier(req, shipment, body.data, shipmentNumber);
			},
			{ user: ctx.user },
		);
		return Response.json({
			id: String(result.shipment.id),
			shipmentNumber: result.shipment.shipmentNumber,
			carrier: result.shipment.carrier,
			status: result.shipment.status,
			quote: result.quote,
		});
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			error.code === ERROR_CODES.courierCancelRefused
		) {
			try {
				await flagCourierCancellationRefused(ctx.payload, parsedParams.data.id);
			} catch (flagError) {
				console.error("shipments:carrier:flag-cancel-refused", flagError);
			}
		}
		if (error instanceof CourierNotConfiguredError) {
			return errorResponse(ERROR_CODES.courierNotConfigured, 503);
		}
		if (error instanceof CourierUnavailableError) {
			return errorResponse(ERROR_CODES.courierUnavailable, 409);
		}
		if (error instanceof CourierCapabilityError) {
			return errorResponse(ERROR_CODES.courierProviderError, 502);
		}
		return handleServiceError("shipments:carrier", error);
	}
}
