import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleServiceError, readBody, requireUser } from "@/lib/shopRoute";
import {
	getOrderSettingsView,
	updateOrderSettings,
} from "@/services/shopOrderSettings";

const paramsSchema = z.object({ id: z.string().trim().min(1) });

const nullableText = (max: number) =>
	z.string().trim().max(max).nullable().optional();

/**
 * Bounds are the collection's own (`deliveryFee` 0–20 000, `salesTermsExtra`
 * 2 000 characters); `deliveryEtaText` has none there, so none is invented
 * here beyond the length a single line of free text can honestly be.
 */
const bodySchema = z
	.object({
		codEnabled: z.boolean().optional(),
		sellerDeliveryEnabled: z.boolean().optional(),
		deliveryFee: z.number().int().min(0).max(20_000).nullable().optional(),
		deliveryEtaText: nullableText(120),
		pickupEnabled: z.boolean().optional(),
		pickupPoint: z
			.object({
				address: nullableText(200),
				landmark: nullableText(200),
				// Nullable members on purpose: this is the shape the generated
				// `Shop["orderSettings"]` the clients edit actually has.
				gps: z
					.object({
						lat: z.number().nullable().optional(),
						lng: z.number().nullable().optional(),
					})
					.nullable()
					.optional(),
				hours: nullableText(200),
			})
			.nullable()
			.optional(),
		salesTermsExtra: nullableText(2000),
	})
	.strict();

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	try {
		return Response.json(
			await getOrderSettingsView(ctx.payload, ctx.user, parsedParams.data.id),
		);
	} catch (error) {
		return handleServiceError("orderSettings:get", error);
	}
}

export async function PATCH(request: Request, { params }: Params) {
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);

	const ctx = await requireUser(request);
	if (ctx instanceof Response) return ctx;

	const body = bodySchema.safeParse(await readBody(request));
	if (!body.success) return errorResponse(ERROR_CODES.validation, 400);

	try {
		return Response.json(
			await updateOrderSettings(
				ctx.payload,
				ctx.user,
				parsedParams.data.id,
				body.data,
			),
		);
	} catch (error) {
		return handleServiceError("orderSettings:patch", error);
	}
}
