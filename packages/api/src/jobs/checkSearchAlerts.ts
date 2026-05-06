import type { TaskConfig } from "payload";

export const checkSearchAlertsTask: TaskConfig<"checkSearchAlerts"> = {
	slug: "checkSearchAlerts",
	retries: 1,
	inputSchema: [],
	schedule: [
		{
			cron: "0 */6 * * *",
			queue: "nightly",
		},
	],
	handler: async ({ req }) => {
		const now = new Date();
		const sixHoursAgo = new Date(
			now.getTime() - 6 * 60 * 60 * 1000,
		).toISOString();
		let notifiedCount = 0;
		let page = 1;
		let hasMore = true;

		while (hasMore) {
			const searches = await (req.payload as any).find({
				collection: "saved-searches",
				where: {
					alertEnabled: { equals: true },
				},
				limit: 100,
				page,
				depth: 0,
			});

			for (const search of searches.docs as any[]) {
				try {
					const filters = (search.filters ?? {}) as Record<string, unknown>;
					const since = (search.lastCheckedAt as string) || sixHoursAgo;
					const userId =
						typeof search.user === "string" ? search.user : search.user?.id;
					if (!userId) continue;

					const where: any[] = [
						{ status: { equals: "published" } },
						{ createdAt: { greater_than: since } },
					];

					if (search.query) {
						where.push({
							or: [
								{ title: { like: search.query } },
								{ description: { like: search.query } },
							],
						});
					}
					if (filters.category) {
						where.push({ category: { equals: filters.category } });
					}
					if (filters.minPrice) {
						where.push({
							price: { greater_than_equal: Number(filters.minPrice) },
						});
					}
					if (filters.maxPrice) {
						where.push({
							price: { less_than_equal: Number(filters.maxPrice) },
						});
					}
					if (filters.location) {
						where.push({ location: { like: filters.location as string } });
					}

					const matches = await req.payload.find({
						collection: "listings",
						where: { and: where } as any,
						limit: 1,
						depth: 0,
					});

					if (matches.totalDocs > 0) {
						const { triggerNotificationEvent } = await import(
							"../hooks/notificationEvents"
						);
						await triggerNotificationEvent({
							event: "search-alert",
							subscriberId: userId,
							payload: {
								searchName: search.name,
								matchCount: matches.totalDocs,
								searchUrl: search.url,
							},
						});
						notifiedCount++;
					}

					await (req.payload as any).update({
						collection: "saved-searches",
						id: search.id,
						data: { lastCheckedAt: now.toISOString() },
					});
				} catch (error) {
					console.error(
						`[checkSearchAlerts] Error processing search ${search.id}:`,
						error,
					);
				}
			}

			hasMore = searches.hasNextPage;
			page++;
		}

		return { output: { notifiedCount } };
	},
};
