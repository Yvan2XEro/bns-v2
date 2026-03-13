import path from "node:path";
import { fileURLToPath } from "node:url";
import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";
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
			beforeDashboard: ["@/components/BeforeDashboard"],
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
					}

					return { output: { expiredCount } };
				},
			},
		],
		autoRun: [
			{
				cron: "0 0 * * *",
				queue: "nightly",
				limit: 10,
			},
		],
	},
});
