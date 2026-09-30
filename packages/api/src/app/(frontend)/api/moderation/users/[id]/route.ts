import { suspensionSummary } from "@/access/roles";
import {
	handleModerationError,
	parseSuspensionAction,
	requireModerator,
} from "@/lib/moderationRoute";
import { shopCapabilities } from "@/lib/shopCapabilities";
import { suspendUser, unsuspendUser } from "@/services/moderation";

/** Account sheet: identity, current sanction, listing counts, action history. */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const { id } = await params;

	try {
		const user = await ctx.payload.findByID({
			collection: "users",
			id,
			depth: 1,
			overrideAccess: true,
		});

		const [published, pending, reports, history, ownedShops] =
			await Promise.all([
				ctx.payload.count({
					collection: "listings",
					overrideAccess: true,
					where: {
						and: [
							{ seller: { equals: id } },
							{ status: { equals: "published" } },
						],
					},
				}),
				ctx.payload.count({
					collection: "listings",
					overrideAccess: true,
					where: {
						and: [
							{ seller: { equals: id } },
							{ status: { equals: "pending" } },
						],
					},
				}),
				ctx.payload.count({
					collection: "reports",
					overrideAccess: true,
					where: {
						and: [
							{ targetType: { equals: "user" } },
							{ targetId: { equals: String(id) } },
						],
					},
				}),
				ctx.payload.find({
					collection: "moderation-log",
					depth: 1,
					limit: 20,
					sort: "-createdAt",
					overrideAccess: true,
					where: {
						and: [
							{ targetType: { equals: "user" } },
							{ targetId: { equals: String(id) } },
						],
					},
				}),
				// The badge belongs to the shop, read through `shopCapabilities` so
				// an expired or suspended shop never reports one here either — the
				// same rule every other surface uses, not a copy of it.
				ctx.payload.find({
					collection: "shops",
					depth: 0,
					limit: 1,
					sort: "-createdAt",
					overrideAccess: true,
					where: {
						and: [
							{ owner: { equals: id } },
							{ status: { in: ["active", "suspended"] } },
						],
					},
				}),
			]);

		const ownedShop = ownedShops.docs[0] ?? null;

		return Response.json({
			user: {
				id: String(user.id),
				name: user.name,
				email: user.email,
				role: user.role,
				avatar: user.avatar,
				identityVerifiedAt: user.identityVerifiedAt ?? null,
				createdAt: user.createdAt,
			},
			shopBadge: ownedShop ? shopCapabilities(ownedShop).badge : null,
			suspension: {
				...suspensionSummary(user as never),
				reason: user.suspendedReason ?? null,
				note: user.suspendedNote ?? null,
				by: user.suspendedBy ?? null,
			},
			counts: {
				publishedListings: published.totalDocs,
				pendingListings: pending.totalDocs,
				reportsAgainst: reports.totalDocs,
			},
			history: history.docs,
		});
	} catch (error) {
		return handleModerationError("users:get", error);
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	const { id } = await params;
	const parsed = await parseSuspensionAction(request);
	if (parsed instanceof Response) return parsed;

	try {
		if (parsed.action === "suspend") {
			return Response.json(
				await suspendUser(ctx.payload, ctx.actor, id, parsed),
			);
		}
		return Response.json(
			await unsuspendUser(ctx.payload, ctx.actor, id, parsed),
		);
	} catch (error) {
		return handleModerationError("users:post", error);
	}
}
