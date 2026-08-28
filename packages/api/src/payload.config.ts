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
import { ModerationLog } from "./collections/ModerationLog";
import { Reports } from "./collections/Reports";
import { Reviews } from "./collections/Reviews";
import { SavedSearches } from "./collections/SavedSearches";
import { Tags } from "./collections/Tags";
import { Users } from "./collections/Users";
import { AppSettings } from "./globals/AppSettings";
import {
	checkSearchAlertsTask,
	expireBoostsTask,
	expireListingsTask,
} from "./jobs";
import { buildStoragePlugin } from "./plugins/storage";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const storagePlugin = await buildStoragePlugin();

export default buildConfig({
	admin: {
		user: Users.slug,
		meta: {
			icons: [{ url: "/logo.png" }],
		},
		importMap: {
			baseDir: path.resolve(dirname),
		},
		components: {
			graphics: {
				Icon: "@/components/branding/AdminLogo#Icon",
				Logo: "@/components/branding/AdminLogo#Logo",
			},
			beforeLogin: ["@/components/auth/AdminSocialLogin"],
			views: {
				moderation: {
					Component: "@/components/views/ModerationQueue",
					path: "/moderation",
				},
				reports: {
					Component: "@/components/views/ReportsQueue",
					path: "/reports-queue",
				},
				usersManagement: {
					Component: "@/components/views/UserManagement",
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
		Tags,
		ModerationLog,
	],
	globals: [AppSettings],
	editor: lexicalEditor(),
	secret: process.env.PAYLOAD_SECRET || "default-secret-change-me",
	typescript: {
		outputFile: path.resolve(dirname, "payload-types.ts"),
	},
	db: mongooseAdapter({
		url: process.env.DATABASE_URI || "",
	}),
	sharp,
	plugins: storagePlugin ? [storagePlugin] : [],
	cors: ["*", ...(process.env.PAYLOAD_ALLOWED_ORIGINS?.split(",") || [])],
	jobs: {
		tasks: [expireListingsTask, expireBoostsTask, checkSearchAlertsTask],
		autoRun: [
			{ cron: "0 0 * * *", queue: "nightly", limit: 10 },
			{ cron: "0 */6 * * *", queue: "nightly", limit: 10 },
		],
	},
});
