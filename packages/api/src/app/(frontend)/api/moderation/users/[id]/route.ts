import { suspensionSummary } from "@/access/roles";
import {
	handleModerationError,
	parseSuspensionAction,
	requireModerator,
} from "@/lib/moderationRoute";
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

		const [published, pending, reports, history] = await Promise.all([
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
					and: [{ seller: { equals: id } }, { status: { equals: "pending" } }],
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
		]);

		return Response.json({
			user: {
				id: String(user.id),
				name: user.name,
				email: user.email,
				role: user.role,
				avatar: user.avatar,
				verified: user.verified,
				createdAt: user.createdAt,
			},
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
