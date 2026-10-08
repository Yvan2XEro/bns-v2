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
import {
	shopPaymentsSheet,
	suspendShop,
	unsuspendShop,
} from "@/services/moderation";
import { recentShopActivity } from "@/services/shopActivity";

type Params = { params: Promise<{ id: string }> };

const SHOP_TEAM_ACTIVITY_LIMIT = 20;

interface ShopTeamMemberView {
	id: string;
	name: string | null;
	role: string;
	joinedAt: string | null;
}

/**
 * The moderator's Team section. A moderator is not a shop member —
 * `resolveShopRole` answers `null` for them — so this does not go through
 * `getShopTeam`/`requireShopPermission`: both key off a shop role the
 * moderator does not and must not hold. The route's own moderator check
 * (`requireModerator`, already run before this is reached) is the only
 * authorisation that applies here, the same way `recentShopActivity` takes
 * no permission argument for the same reason. Reads only active members —
 * a revoked one has left the team — and leaves out `inboxNotifications` and
 * `revokedBy`, which Task 5 made readable only to the member and to managers.
 */
async function shopTeamMembers(
	payload: import("payload").Payload,
	shopId: string,
): Promise<ShopTeamMemberView[]> {
	const members = await payload.find({
		collection: "shop-members",
		where: {
			and: [{ shop: { equals: shopId } }, { status: { equals: "active" } }],
		},
		sort: "joinedAt",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});

	const userIds = [
		...new Set(
			members.docs
				.map((row) => relationId(row.user))
				.filter((userId): userId is string => Boolean(userId)),
		),
	];
	const names = new Map<string, string | null>();
	if (userIds.length > 0) {
		const users = await payload.find({
			collection: "users",
			where: { id: { in: userIds } },
			depth: 0,
			limit: userIds.length,
			overrideAccess: true,
		});
		for (const user of users.docs)
			names.set(String(user.id), user.name ?? null);
	}

	return members.docs.map((row) => ({
		id: String(row.id),
		name: names.get(relationId(row.user) ?? "") ?? null,
		role: row.role,
		joinedAt: row.joinedAt ?? null,
	}));
}

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
		const [
			activeProducts,
			draftProducts,
			reports,
			history,
			team,
			rawActivity,
			payments,
		] = await Promise.all([
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
			shopTeamMembers(ctx.payload, id),
			recentShopActivity(ctx.payload, id, SHOP_TEAM_ACTIVITY_LIMIT),
			shopPaymentsSheet(ctx.payload, String(id)),
		]);

		// A moderator reviewing a shop has no business reading its margins: the
		// cost figures `variant.cost_changed` carries in `metadata` are stripped
		// here, for this reader only — the service's own write-time guard
		// (`assertNoCostLeak`) stops a cost value leaking into any other action.
		const activity = rawActivity.map((entry) =>
			entry.action === "variant.cost_changed"
				? { ...entry, metadata: null }
				: entry,
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
			team,
			activity,
			payments,
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
			const result = await suspendShop(ctx.payload, ctx.actor, id, parsed);
			return Response.json({
				shopId: result.shopId,
				until: result.until,
				unpublishedListingIds: result.unpublishedListingIds,
			});
		}
		return Response.json(
			await unsuspendShop(ctx.payload, ctx.actor, id, parsed),
		);
	} catch (error) {
		return handleModerationError("shops:post", error);
	}
}
