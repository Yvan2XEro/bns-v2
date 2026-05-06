import type { TaskConfig } from "payload";
import { isNotificationProviderConfigured } from "../services/notificationProvider";

export const expireListingsTask: TaskConfig<"expireListings"> = {
	slug: "expireListings",
	retries: 1,
	inputSchema: [],
	schedule: [
		{
			cron: "0 0 * * *",
			queue: "nightly",
		},
	],
	handler: async ({ req }) => {
		const now = new Date().toISOString();

		const expired = await req.payload.find({
			collection: "listings",
			where: {
				and: [
					{ expiresAt: { less_than_equal: now } },
					{ status: { in: ["published", "pending"] } },
				],
			},
			limit: 500,
		});

		let expiredCount = 0;
		for (const listing of expired.docs) {
			await req.payload.update({
				collection: "listings",
				id: listing.id,
				data: { status: "expired" },
			});
			expiredCount++;

			if (isNotificationProviderConfigured()) {
				const sellerId =
					typeof listing.seller === "string"
						? listing.seller
						: (listing.seller as { id: string })?.id;
				if (sellerId) {
					try {
						const { triggerNotificationEvent } = await import(
							"../hooks/notificationEvents"
						);
						await triggerNotificationEvent({
							event: "listing-expired",
							subscriberId: sellerId,
							payload: {
								listingId: listing.id as string,
								listingTitle: listing.title,
							},
						});
					} catch (error) {
						console.error(
							"[notifications] Failed to notify listing expiry:",
							error,
						);
					}
				}
			}
		}

		return { output: { expiredCount } };
	},
};
