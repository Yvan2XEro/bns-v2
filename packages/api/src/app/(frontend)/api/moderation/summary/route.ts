import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import { pendingVerificationsWhere } from "@/lib/verificationQueue";

export async function GET(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	try {
		const [listings, reports, verifications, payoutAccounts] =
			await Promise.all([
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
				ctx.payload.count({
					collection: "verification-requests",
					overrideAccess: true,
					where: pendingVerificationsWhere(new Date()),
				}),
				ctx.payload.count({
					collection: "payout-accounts",
					overrideAccess: true,
					where: { status: { equals: "pending_review" } },
				}),
			]);

		return Response.json({
			pendingListings: listings.totalDocs,
			pendingReports: reports.totalDocs,
			pendingVerifications: verifications.totalDocs,
			pendingPayoutAccounts: payoutAccounts.totalDocs,
			total:
				listings.totalDocs +
				reports.totalDocs +
				verifications.totalDocs +
				payoutAccounts.totalDocs,
		});
	} catch (error) {
		return handleModerationError("summary", error);
	}
}
