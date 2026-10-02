import path from "node:path";
import { fileURLToPath } from "node:url";
import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";
import { BlockedUsers } from "./collections/BlockedUsers";
import { BoostPayments } from "./collections/BoostPayments";
import { Categories } from "./collections/Categories";
import { ContactReveals } from "./collections/ContactReveals";
import { ConversationReads } from "./collections/ConversationReads";
import { Conversations } from "./collections/Conversations";
import { Favorites } from "./collections/Favorites";
import { Listings } from "./collections/Listings";
import { Media } from "./collections/Media";
import { Messages } from "./collections/Messages";
import { ModerationLog } from "./collections/ModerationLog";
import { PaymentIntents } from "./collections/PaymentIntents";
import { Products } from "./collections/Products";
import { ProductVariants } from "./collections/ProductVariants";
import { Reports } from "./collections/Reports";
import { Reviews } from "./collections/Reviews";
import { SavedSearches } from "./collections/SavedSearches";
import { Sequences } from "./collections/Sequences";
import { ShopActivityLog } from "./collections/ShopActivityLog";
import { ShopInvitations } from "./collections/ShopInvitations";
import { ShopMembers } from "./collections/ShopMembers";
import { Shops } from "./collections/Shops";
import { StockMovements } from "./collections/StockMovements";
import { Tags } from "./collections/Tags";
import { Users } from "./collections/Users";
import { VerificationDocuments } from "./collections/VerificationDocuments";
import { VerificationDocumentViews } from "./collections/VerificationDocumentViews";
import { VerificationRequests } from "./collections/VerificationRequests";
import { WebhookEvents } from "./collections/WebhookEvents";
import { AppSettings } from "./globals/AppSettings";
import {
	checkSearchAlertsTask,
	expireBoostsTask,
	expireListingsTask,
	liftExpiredShopSuspensionsTask,
	processKycEventTask,
	processWebhookEventTask,
	purgeShopActivityTask,
	purgeVerificationDataTask,
	reconcilePendingPaymentsTask,
} from "./jobs";
import { migrations } from "./migrations";
import { buildStoragePlugins } from "./plugins/storage";
import { registerShopTeamLevelListener } from "./services/shopTeamLevel";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

// P3's reaction to a level change. Explicit rather than a module side effect,
// so nothing depends on which file happened to be imported first.
registerShopTeamLevelListener();

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
		ConversationReads,
		Messages,
		Reviews,
		Reports,
		BoostPayments,
		PaymentIntents,
		WebhookEvents,
		ContactReveals,
		SavedSearches,
		BlockedUsers,
		Tags,
		ModerationLog,
		Shops,
		ShopMembers,
		ShopActivityLog,
		ShopInvitations,
		Products,
		ProductVariants,
		StockMovements,
		VerificationRequests,
		VerificationDocuments,
		VerificationDocumentViews,
		Sequences,
	],
	globals: [AppSettings],
	editor: lexicalEditor(),
	// One knob for every `logger.debug`/`info`/`warn` call in the app, rather
	// than a feature-specific env var per thing that wants to be visible in
	// `docker compose logs api`.
	logger: {
		options: {
			level: process.env.LOG_LEVEL || "info",
		},
	},
	secret: process.env.PAYLOAD_SECRET || "default-secret-change-me",
	typescript: {
		outputFile: path.resolve(dirname, "payload-types.ts"),
	},
	db: mongooseAdapter({
		url: process.env.DATABASE_URI || "",
		migrationDir: path.resolve(dirname, "migrations"),
		// Applied at startup when NODE_ENV=production, before the API serves traffic.
		prodMigrations: migrations,
	}),
	sharp,
	plugins: await buildStoragePlugins(),
	cors: ["*", ...(process.env.PAYLOAD_ALLOWED_ORIGINS?.split(",") || [])],
	jobs: {
		tasks: [
			expireListingsTask,
			expireBoostsTask,
			checkSearchAlertsTask,
			processWebhookEventTask,
			reconcilePendingPaymentsTask,
			liftExpiredShopSuspensionsTask,
			processKycEventTask,
			purgeVerificationDataTask,
			purgeShopActivityTask,
		],
		autoRun: [
			{ cron: "0 0 * * *", queue: "nightly", limit: 10 },
			{ cron: "0 */6 * * *", queue: "nightly", limit: 10 },
			{ cron: "* * * * *", queue: "payments", limit: 20 },
			// A vendor result must reach a person promptly, not on the nightly
			// sweep: `processKycEvent` is queued on the default queue (Payload's
			// implicit target when `payload.jobs.queue()` gets no `queue`), so
			// that queue needs its own frequent run alongside "payments".
			{ cron: "* * * * *", queue: "default", limit: 20 },
		],
	},
});
