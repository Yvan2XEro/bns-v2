import { handleModerationError, requireModerator } from "@/lib/moderationRoute";

export async function GET(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	try {
		const [listings, reports] = await Promise.all([
			ctx.payload.count({
				collection: "listings",
				overrideAccess: true,
				where: { status: { equals: "pending" } },
			}),
			ctx.payload.count({
				collection: "reports",
				overrideAccess: true,
				where: { status: { equals: "pending" } },
			}),
		]);

		return Response.json({
			pendingListings: listings.totalDocs,
			pendingReports: reports.totalDocs,
			total: listings.totalDocs + reports.totalDocs,
		});
	} catch (error) {
		return handleModerationError("summary", error);
	}
}
