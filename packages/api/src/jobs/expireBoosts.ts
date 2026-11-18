import type { TaskConfig } from "payload";
import { isNotificationProviderConfigured } from "../services/notificationProvider";

export const expireBoostsTask: TaskConfig<"expireBoosts"> = {
	slug: "expireBoosts",
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

		const boosted = await req.payload.find({
			collection: "listings",
			where: {
				and: [
					{ boostedUntil: { less_than_equal: now } },
					{ boostedUntil: { exists: true } },
				],
			},
			limit: 500,
		});

		let expiredBoostCount = 0;
		for (const listing of boosted.docs) {
			await req.payload.update({
				collection: "listings",
				id: listing.id,
				data: { boostedUntil: null },
			});
			expiredBoostCount++;

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
							event: "boost-expired",
							subscriberId: sellerId,
							payload: {
								listingId: listing.id as string,
								listingTitle: listing.title,
							},
						});
					} catch (error) {
						console.error(
							"[notifications] Failed to notify boost expiry:",
							error,
						);
					}
				}
			}
		}

		return { output: { expiredBoostCount } };
	},
};
