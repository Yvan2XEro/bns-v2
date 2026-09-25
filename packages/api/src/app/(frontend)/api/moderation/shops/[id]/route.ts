import type { Where } from "payload";
import { suspensionSummary } from "@/access/roles";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	handleModerationError,
	parseSuspensionAction,
	requireModerator,
} from "@/lib/moderationRoute";
import { toMediaRef } from "@/lib/publicShop";
import { relationId } from "@/lib/relationId";
import { suspendShop, unsuspendShop } from "@/services/moderation";

type Params = { params: Promise<{ id: string }> };

/** Shop sheet: identity, owner, counts, reports against the shop or its listings, history. */
export async function GET(request: Request, { params }: Params) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const { id } = await params;

	const shop = await ctx.payload
		.findByID({ collection: "shops", id, depth: 1, overrideAccess: true })
		.catch(() => null);
	if (!shop) return errorResponse(ERROR_CODES.moderationTargetNotFound, 404);

	try {
		const ownerId = relationId(shop.owner) ?? "";
		const [owner, listings] = await Promise.all([
			ctx.payload
				.findByID({
					collection: "users",
					id: ownerId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null),
			ctx.payload.find({
				collection: "listings",
				where: { shop: { equals: id } },
				depth: 0,
				limit: 0,
				pagination: false,
				overrideAccess: true,
			}),
		]);
		const listingIds = listings.docs.map((doc) => String(doc.id));
		const reportsWhere: Where = {
			or: [
				{
					and: [
						{ targetType: { equals: "shop" } },
						{ targetId: { equals: String(id) } },
					],
				},
				...(listingIds.length
					? [
							{
								and: [
									{ targetType: { equals: "listing" } },
									{ targetId: { in: listingIds } },
								],
							},
						]
					: []),
			],
		};
		const [activeProducts, draftProducts, reports, history] = await Promise.all(
			[
				ctx.payload.count({
					collection: "products",
					where: {
						and: [{ shop: { equals: id } }, { status: { equals: "active" } }],
					},
					overrideAccess: true,
				}),
				ctx.payload.count({
					collection: "products",
					where: {
						and: [{ shop: { equals: id } }, { status: { equals: "draft" } }],
					},
					overrideAccess: true,
				}),
				ctx.payload.find({
					collection: "reports",
					where: reportsWhere,
					sort: "-createdAt",
					limit: 10,
					depth: 1,
					overrideAccess: true,
				}),
				ctx.payload.find({
					collection: "moderation-log",
					where: {
						and: [
							{ targetType: { equals: "shop" } },
							{ targetId: { equals: String(id) } },
						],
					},
					sort: "-createdAt",
					limit: 20,
					depth: 1,
					overrideAccess: true,
				}),
			],
		);

		return Response.json({
			shop: {
				id: String(shop.id),
				handle: shop.handle,
				name: shop.name,
				status: shop.status,
				level: shop.level ?? 1,
				logo: toMediaRef(shop.logo),
				createdAt: shop.createdAt,
			},
			owner: owner
				? {
						id: String(owner.id),
						name: owner.name,
						email: owner.email,
						role: owner.role,
						createdAt: owner.createdAt,
					}
				: null,
			suspension: {
				...suspensionSummary(shop as never),
				reason: shop.suspendedReason ?? null,
				note: shop.suspendedNote ?? null,
				by: shop.suspendedBy ?? null,
			},
			counts: {
				publishedListings: listings.docs.filter(
					(doc) => doc.status === "published",
				).length,
				activeProducts: activeProducts.totalDocs,
				draftProducts: draftProducts.totalDocs,
				reportsAgainst: reports.totalDocs,
			},
			reports: reports.docs,
			history: history.docs,
		});
	} catch (error) {
		return handleModerationError("shops:get", error);
	}
}

export async function POST(request: Request, { params }: Params) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;
	const { id } = await params;
	const parsed = await parseSuspensionAction(request);
	if (parsed instanceof Response) return parsed;

	try {
		if (parsed.action === "suspend") {
			return Response.json(
				await suspendShop(ctx.payload, ctx.actor, id, parsed),
			);
		}
		return Response.json(
			await unsuspendShop(ctx.payload, ctx.actor, id, parsed),
		);
	} catch (error) {
		return handleModerationError("shops:post", error);
	}
}
