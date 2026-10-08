import { z } from "zod";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import { relationId } from "@/lib/relationId";
import { suspendResaleLink, unsuspendResaleLink } from "@/services/moderation";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("suspend"),
		reason: z.enum(["quality", "pricing", "fraud_review", "terms", "other"]),
		note: z.string().trim().max(2000).nullable().optional(),
	}),
	z.object({
		action: z.literal("unsuspend"),
		note: z.string().trim().max(2000).nullable().optional(),
		releaseCommissions: z.boolean().optional(),
	}),
]);

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const parsed = paramsSchema.safeParse(await params);
	if (!parsed.success) return errorResponse(ERROR_CODES.badRequest, 400);

	try {
		const link = await ctx.payload
			.findByID({
				collection: "resale-links",
				id: parsed.data.id,
				depth: 0,
				overrideAccess: true,
			})
			.catch(() => null);
		if (!link) return errorResponse(ERROR_CODES.moderationTargetNotFound, 404);
		const supplierShopId = relationId(link.supplierShop);
		const resellerShopId = relationId(link.resellerShop);
		if (!supplierShopId || !resellerShopId) {
			return errorResponse(ERROR_CODES.moderationTargetNotFound, 404);
		}
		const [supplier, reseller, history, orders] = await Promise.all([
			ctx.payload.findByID({
				collection: "shops",
				id: supplierShopId,
				depth: 1,
				overrideAccess: true,
			}),
			ctx.payload.findByID({
				collection: "shops",
				id: resellerShopId,
				depth: 1,
				overrideAccess: true,
			}),
			ctx.payload.find({
				collection: "moderation-log",
				where: {
					and: [
						{ targetType: { equals: "resale-link" } },
						{ targetId: { equals: parsed.data.id } },
					],
				},
				sort: "-createdAt",
				limit: 50,
				depth: 1,
				overrideAccess: true,
			}),
			ctx.payload.find({
				collection: "purchase-orders",
				where: { link: { equals: parsed.data.id } },
				sort: "-createdAt",
				limit: 50,
				depth: 0,
				overrideAccess: true,
			}),
		]);
		const orderIds = orders.docs.map((order) => String(order.id));
		const commissions = orderIds.length
			? await ctx.payload.find({
					collection: "reseller-commissions",
					where: { purchaseOrder: { in: orderIds } },
					sort: "-createdAt",
					limit: 100,
					depth: 0,
					overrideAccess: true,
				})
			: { docs: [] };
		return Response.json({
			link,
			supplier: {
				id: String(supplier.id),
				name: supplier.name,
				level: supplier.level ?? 1,
			},
			reseller: {
				id: String(reseller.id),
				name: reseller.name,
				level: reseller.level ?? 1,
			},
			history: history.docs,
			purchaseOrders: orders.docs,
			commissions: commissions.docs,
		});
	} catch (error) {
		return handleModerationError("resale-links:detail", error);
	}
}

export async function POST(request: Request, { params }: Params) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const parsedParams = paramsSchema.safeParse(await params);
	if (!parsedParams.success) return errorResponse(ERROR_CODES.badRequest, 400);
	const body = bodySchema.safeParse(await request.json().catch(() => null));
	if (!body.success) return errorResponse(ERROR_CODES.badRequest, 400);
	try {
		const updated =
			body.data.action === "suspend"
				? await suspendResaleLink(
						ctx.payload,
						ctx.actor,
						parsedParams.data.id,
						{ reason: body.data.reason, note: body.data.note },
					)
				: await unsuspendResaleLink(
						ctx.payload,
						ctx.actor,
						parsedParams.data.id,
						{
							note: body.data.note,
							releaseCommissions: body.data.releaseCommissions ?? false,
						},
					);
		return Response.json(updated);
	} catch (error) {
		return handleModerationError("resale-links:action", error);
	}
}
