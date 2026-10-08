import { handleModerationError, requireModerator } from "@/lib/moderationRoute";
import { pendingVerificationsWhere } from "@/lib/verificationQueue";

export async function GET(request: Request) {
	const ctx = await requireModerator(request);
	if (ctx instanceof Response) return ctx;

	try {
		const now = new Date().toISOString();
		const [
			listings,
			reports,
			verifications,
			payoutAccounts,
			disputes,
			overdue,
			openRiskFlags,
			highRiskFlags,
		] = await Promise.all([
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
			ctx.payload.count({
				collection: "disputes",
				overrideAccess: true,
				where: {
					status: {
						in: ["open", "awaiting_seller", "awaiting_buyer", "under_review"],
					},
				},
			}),
			ctx.payload.count({
				collection: "disputes",
				overrideAccess: true,
				where: {
					and: [
						{ status: { equals: "under_review" } },
						{ "deadlines.reviewDueAt": { less_than_equal: now } },
					],
				},
			}),
			ctx.payload.count({
				collection: "risk-flags",
				overrideAccess: true,
				where: { status: { equals: "open" } },
			}),
			ctx.payload.count({
				collection: "risk-flags",
				overrideAccess: true,
				where: {
					and: [
						{ status: { equals: "open" } },
						{ severity: { equals: "high" } },
					],
				},
			}),
		]);

		return Response.json({
			pendingListings: listings.totalDocs,
			pendingReports: reports.totalDocs,
			pendingVerifications: verifications.totalDocs,
			pendingPayoutAccounts: payoutAccounts.totalDocs,
			disputesPending: disputes.totalDocs,
			disputesOverdue: overdue.totalDocs,
			openRiskFlags: openRiskFlags.totalDocs,
			highRiskFlags: highRiskFlags.totalDocs,
			total:
				listings.totalDocs +
				reports.totalDocs +
				verifications.totalDocs +
				payoutAccounts.totalDocs +
				disputes.totalDocs +
				highRiskFlags.totalDocs,
		});
	} catch (error) {
		return handleModerationError("summary", error);
	}
}
