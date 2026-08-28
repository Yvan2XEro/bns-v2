import { suspensionSummary } from "@/access/roles";
import { ERROR_CODES, errorResponse } from "@/lib/errors";
import {
	handleModerationError,
	readJson,
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
	const body = await readJson(request);
	const note = typeof body.note === "string" ? body.note : null;

	try {
		if (body.action === "suspend") {
			// `durationDays: null` is an explicit request for an indefinite
			// suspension and is distinct from the key being absent, which is a
			// malformed body.
			if (!("durationDays" in body)) {
				return errorResponse(ERROR_CODES.moderationDurationInvalid, 400);
			}
			const durationDays =
				body.durationDays === null ? null : Number(body.durationDays);

			return Response.json(
				await suspendUser(ctx.payload, ctx.actor, id, {
					reason: typeof body.reason === "string" ? body.reason : "",
					durationDays,
					note,
				}),
			);
		}

		if (body.action === "unsuspend") {
			return Response.json(
				await unsuspendUser(ctx.payload, ctx.actor, id, {
					note,
					restoreListings: body.restoreListings !== false,
				}),
			);
		}

		return errorResponse(ERROR_CODES.badRequest, 400);
	} catch (error) {
		return handleModerationError("users:post", error);
	}
}
