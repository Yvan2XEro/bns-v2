import path from "node:path";
import { fileURLToPath } from "node:url";
import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";
import { BlockedUsers } from "./collections/BlockedUsers";
import { BoostPayments } from "./collections/BoostPayments";
import { Categories } from "./collections/Categories";
import { Conversations } from "./collections/Conversations";
import { Favorites } from "./collections/Favorites";
import { Listings } from "./collections/Listings";
import { Media } from "./collections/Media";
import { Messages } from "./collections/Messages";
import { Reports } from "./collections/Reports";
import { Reviews } from "./collections/Reviews";
import { SavedSearches } from "./collections/SavedSearches";
import { Users } from "./collections/Users";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
	admin: {
		user: Users.slug,
		importMap: {
			baseDir: path.resolve(dirname),
		},
		components: {
			views: {
				moderation: {
					Component: "@/components/views/ModerationQueue#ModerationQueue",
					path: "/moderation",
				},
				reports: {
					Component: "@/components/views/ReportsQueue#ReportsQueue",
					path: "/reports-queue",
				},
				usersManagement: {
					Component: "@/components/views/UserManagement#UserManagement",
					path: "/users-management",
				},
			},
			beforeDashboard: [
				"@/components/BeforeDashboard",
				"@/components/widgets/ModerationWidget",
			],
			afterNavLinks: ["@/components/nav/ModerationNav"],
		},
	},
	collections: [
		Users,
		Media,
		Listings,
		Categories,
		Favorites,
		Conversations,
		Messages,
		Reviews,
		Reports,
		BoostPayments,
		SavedSearches,
		BlockedUsers,
	],
	editor: lexicalEditor(),
	secret: process.env.PAYLOAD_SECRET || "default-secret-change-me",
	typescript: {
		outputFile: path.resolve(dirname, "payload-types.ts"),
	},
	db: mongooseAdapter({
		url: process.env.DATABASE_URI || "",
	}),
	sharp,
	plugins: [],
	cors: ["*", ...(process.env.PAYLOAD_ALLOWED_ORIGINS?.split(",") || [])],
	jobs: {
		tasks: [
			{
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

						// Notify seller about listing expiry
						if (process.env.NOVU_SECRET_KEY) {
							const sellerId =
								typeof listing.seller === "string"
									? listing.seller
									: (listing.seller as { id: string })?.id;
							if (sellerId) {
								try {
									const { triggerNovuEvent } = await import(
										"./hooks/novuEvents"
									);
									await triggerNovuEvent({
										event: "listing-expired",
										subscriberId: sellerId,
										payload: { listingTitle: listing.title },
									});
								} catch (error) {
									console.error(
										"[novu] Failed to notify listing expiry:",
										error,
									);
								}
							}
						}
					}

					return { output: { expiredCount } };
				},
			},
			{
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

					// saved-searches types not yet regenerated — use `as any` for collection references
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
								const filters = (search.filters ?? {}) as Record<
									string,
									unknown
								>;
								const since = (search.lastCheckedAt as string) || sixHoursAgo;
								const userId =
									typeof search.user === "string"
										? search.user
										: search.user?.id;
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
									where.push({
										category: { equals: filters.category },
									});
								}
								if (filters.minPrice) {
									where.push({
										price: {
											greater_than_equal: Number(filters.minPrice),
										},
									});
								}
								if (filters.maxPrice) {
									where.push({
										price: {
											less_than_equal: Number(filters.maxPrice),
										},
									});
								}
								if (filters.location) {
									where.push({
										location: { like: filters.location as string },
									});
								}

								const matches = await req.payload.find({
									collection: "listings",
									where: { and: where } as any,
									limit: 1,
									depth: 0,
								});

								if (matches.totalDocs > 0) {
									const { triggerNovuEvent } = await import(
										"./hooks/novuEvents"
									);
									await triggerNovuEvent({
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
			},
			{
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

						// Notify seller about boost expiry
						if (process.env.NOVU_SECRET_KEY) {
							const sellerId =
								typeof listing.seller === "string"
									? listing.seller
									: (listing.seller as { id: string })?.id;
							if (sellerId) {
								try {
									const { triggerNovuEvent } = await import(
										"./hooks/novuEvents"
									);
									await triggerNovuEvent({
										event: "boost-expired",
										subscriberId: sellerId,
										payload: { listingTitle: listing.title },
									});
								} catch (error) {
									console.error("[novu] Failed to notify boost expiry:", error);
								}
							}
						}
					}

					return { output: { expiredBoostCount } };
				},
			},
		],
		autoRun: [
			{
				cron: "0 0 * * *",
				queue: "nightly",
				limit: 10,
			},
			{
				cron: "0 */6 * * *",
				queue: "nightly",
				limit: 10,
			},
		],
	},
});
