import path from "node:path";
import { fileURLToPath } from "node:url";
import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";
import { BlockedUsers } from "./collections/BlockedUsers";
import { BoostPayments } from "./collections/BoostPayments";
import { BuyerFeeInvoiceFiles } from "./collections/BuyerFeeInvoiceFiles";
import { BuyerFeeInvoices } from "./collections/BuyerFeeInvoices";
import { BuyerPhoneScores } from "./collections/BuyerPhoneScores";
import { Carts } from "./collections/Carts";
import { Categories } from "./collections/Categories";
import { CommissionInvoices } from "./collections/CommissionInvoices";
import { CommissionLines } from "./collections/CommissionLines";
import { ConnectedAccounts } from "./collections/ConnectedAccounts";
import { ContactReveals } from "./collections/ContactReveals";
import { ConversationReads } from "./collections/ConversationReads";
import { Conversations } from "./collections/Conversations";
import { CourierMembers } from "./collections/CourierMembers";
import { Couriers } from "./collections/Couriers";
import { DeliveryProofs } from "./collections/DeliveryProofs";
import { DeliveryZones } from "./collections/DeliveryZones";
import { DisputeEvidence } from "./collections/DisputeEvidence";
import { DisputeEvidenceViews } from "./collections/DisputeEvidenceViews";
import { DisputeGateEvidence } from "./collections/DisputeGateEvidence";
import { DisputeMessages } from "./collections/DisputeMessages";
import { Disputes } from "./collections/Disputes";
import { Favorites } from "./collections/Favorites";
import { LedgerAccounts } from "./collections/LedgerAccounts";
import { LedgerTransactions } from "./collections/LedgerTransactions";
import { Listings } from "./collections/Listings";
import { ListingViewFlushes } from "./collections/ListingViewFlushes";
import { Media } from "./collections/Media";
import { Messages } from "./collections/Messages";
import { ModerationLog } from "./collections/ModerationLog";
import { OrderEvents } from "./collections/OrderEvents";
import { OrderItems } from "./collections/OrderItems";
import { Orders } from "./collections/Orders";
import { PaymentGateEvidence } from "./collections/PaymentGateEvidence";
import { PaymentIntents } from "./collections/PaymentIntents";
import { PayoutAccounts } from "./collections/PayoutAccounts";
import { PayoutHolds } from "./collections/PayoutHolds";
import { Payouts } from "./collections/Payouts";
import { Products } from "./collections/Products";
import { ProductVariants } from "./collections/ProductVariants";
import { PurchaseOrders } from "./collections/PurchaseOrders";
import { ReconciliationMismatches } from "./collections/ReconciliationMismatches";
import { ReconciliationRuns } from "./collections/ReconciliationRuns";
import { Refunds } from "./collections/Refunds";
import { Reports } from "./collections/Reports";
import { ResaleLinks } from "./collections/ResaleLinks";
import { ResaleTerms } from "./collections/ResaleTerms";
import { ResaleTermsAcceptances } from "./collections/ResaleTermsAcceptances";
import { ResellerCharges } from "./collections/ResellerCharges";
import { ResellerCommissions } from "./collections/ResellerCommissions";
import { ResellerPayouts } from "./collections/ResellerPayouts";
import { ReturnCases } from "./collections/ReturnCases";
import { Reviews } from "./collections/Reviews";
import { RiskFlags } from "./collections/RiskFlags";
import { RiskSignalOutbox } from "./collections/RiskSignalOutbox";
import { SavedSearches } from "./collections/SavedSearches";
import { Sequences } from "./collections/Sequences";
import { ShipmentEvents } from "./collections/ShipmentEvents";
import { Shipments } from "./collections/Shipments";
import { ShopActivityLog } from "./collections/ShopActivityLog";
import { ShopDailyStats } from "./collections/ShopDailyStats";
import { ShopInvitations } from "./collections/ShopInvitations";
import { ShopLocations } from "./collections/ShopLocations";
import { ShopMembers } from "./collections/ShopMembers";
import { ShopStrikes } from "./collections/ShopStrikes";
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
	abandonCartsTask,
	advanceDisputesTask,
	advanceReturnCasesTask,
	aggregateShopDailyStatsTask,
	applyResalePriceChangesTask,
	checkSearchAlertsTask,
	completeOrdersTask,
	consumeRiskSignalOutboxTask,
	dispatchOrderEventTask,
	enforceCommissionOverdueTask,
	enforceResaleTermsTask,
	expireBoostsTask,
	expireListingsTask,
	expireOrdersTask,
	expirePayoutHoldsTask,
	expirePickupHoldsTask,
	expirePurchaseOrdersTask,
	expireRiderLinksTask,
	expireStrikesTask,
	failStaleOrdersTask,
	finalizeFailedShipmentsTask,
	flagLateShipmentsTask,
	flushListingViewsTask,
	issueCommissionInvoicesTask,
	liftExpiredShopSuspensionsTask,
	markOverdueResellerChargesTask,
	payResellerCommissionsTask,
	pollCourierShipmentsTask,
	processCourierWebhookEventTask,
	processKycEventTask,
	processWebhookEventTask,
	publishHeldReviewsTask,
	purgeCaseEvidenceTask,
	purgeDeliveryProofsTask,
	purgeRiskDataTask,
	purgeShopActivityTask,
	purgeVerificationDataTask,
	reconcileLedgerTask,
	reconcilePendingPaymentsTask,
	reconcileStockCachesTask,
	recoverSellerReceivablesTask,
	refreshResaleLinkStatsTask,
	releaseEligibleFundsTask,
	releaseResellerCommissionsTask,
	remindReturnsTask,
	renderDisputeCertificateTask,
	retryResellerPayoutsTask,
	sendWeeklyInsightsTask,
	submitRefundTask,
	sweepBuyerFeeInvoicesTask,
	syncConnectedAccountTask,
} from "./jobs";
import { registerResaleAdjuster } from "./lib/resale";
import { migrations } from "./migrations";
import { buildStoragePlugins } from "./plugins/storage";
import { registerShipmentOrderEvents } from "./services/delivery/shipments";
import {
	adjustResellerCommission,
	registerPurchaseOrderOrderEvents,
} from "./services/purchaseOrders";
import { registerRefundSubmissionQueue } from "./services/refunds";
import { registerShopTeamLevelListener } from "./services/shopTeamLevel";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

// P3's reaction to a level change. Explicit rather than a module side effect,
// so nothing depends on which file happened to be imported first.
registerShopTeamLevelListener();
registerShipmentOrderEvents();
registerPurchaseOrderOrderEvents();
registerResaleAdjuster({ adjustResellerCommission });
registerRefundSubmissionQueue((payload, { refundId, waitUntil }) =>
	payload.jobs.queue({
		task: "submitRefund",
		queue: "payments",
		input: { refundId },
		waitUntil,
	}),
);

// Payload's scheduler reads crons in the server's zone, which is UTC in the
// api image; Africa/Douala is UTC+1 all year, so each daily time below is the
// Douala hour minus one. The P5 jobs are scheduled here rather than in their
// own files so the whole money calendar reads in one place.
const PAYMENTS = "payments";
const paymentTasks = [
	submitRefundTask,
	{
		...syncConnectedAccountTask,
		schedule: [{ cron: "0 */6 * * *", queue: PAYMENTS }],
	},
	{
		...releaseEligibleFundsTask,
		schedule: [{ cron: "0 9 * * *", queue: PAYMENTS }], // 10:00 Douala
	},
	{
		...expirePayoutHoldsTask,
		schedule: [{ cron: "*/15 * * * *", queue: PAYMENTS }],
	},
	{
		...reconcileLedgerTask,
		schedule: [{ cron: "30 1 * * *", queue: PAYMENTS }], // 02:30 Douala
	},
	{
		...recoverSellerReceivablesTask,
		schedule: [{ cron: "0 2 * * *", queue: PAYMENTS }], // 03:00 Douala
	},
	{
		...sweepBuyerFeeInvoicesTask,
		schedule: [{ cron: "0 * * * *", queue: PAYMENTS }],
	},
];

// Delivery calendar, same UTC rule as the money calendar above. The polling
// task rides the frequent "delivery" queue; the lifecycle sweeps share the
// hourly queue and the nightly ones the nightly queue.
const deliveryTasks = [
	processCourierWebhookEventTask,
	{
		...pollCourierShipmentsTask,
		schedule: [{ cron: "*/15 * * * *", queue: "delivery" }],
	},
	{
		...finalizeFailedShipmentsTask,
		schedule: [{ cron: "0 * * * *", queue: "hourly" }],
	},
	{
		...expirePickupHoldsTask,
		schedule: [{ cron: "0 * * * *", queue: "hourly" }],
	},
	{
		...flagLateShipmentsTask,
		schedule: [{ cron: "0 * * * *", queue: "hourly" }],
	},
	{
		...remindReturnsTask,
		schedule: [{ cron: "30 6 * * *", queue: "nightly" }], // 07:30 Douala
	},
	{
		...expireRiderLinksTask,
		schedule: [{ cron: "45 2 * * *", queue: "nightly" }], // 03:45 Douala
	},
	{
		...purgeDeliveryProofsTask,
		schedule: [{ cron: "15 2 * * *", queue: "nightly" }], // 03:15 Douala
	},
];

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
		ListingViewFlushes,
		Categories,
		Favorites,
		Conversations,
		ConversationReads,
		Messages,
		Reviews,
		Reports,
		ResaleLinks,
		ResaleTerms,
		ResaleTermsAcceptances,
		BoostPayments,
		PaymentIntents,
		WebhookEvents,
		ContactReveals,
		DeliveryZones,
		ShopLocations,
		Couriers,
		CourierMembers,
		Shipments,
		ShipmentEvents,
		DeliveryProofs,
		SavedSearches,
		BlockedUsers,
		Tags,
		ModerationLog,
		Shops,
		ShopMembers,
		ShopActivityLog,
		ShopInvitations,
		Products,
		PurchaseOrders,
		ResellerCommissions,
		ResellerCharges,
		ResellerPayouts,
		ProductVariants,
		StockMovements,
		VerificationRequests,
		VerificationDocuments,
		VerificationDocumentViews,
		Sequences,
		Carts,
		Orders,
		OrderItems,
		OrderEvents,
		BuyerPhoneScores,
		CommissionLines,
		CommissionInvoices,
		ReturnCases,
		ShopDailyStats,
		RiskFlags,
		PaymentGateEvidence,
		DisputeGateEvidence,
		Disputes,
		DisputeMessages,
		DisputeEvidence,
		DisputeEvidenceViews,
		ShopStrikes,
		RiskSignalOutbox,
		ConnectedAccounts,
		PayoutAccounts,
		Refunds,
		Payouts,
		PayoutHolds,
		LedgerAccounts,
		LedgerTransactions,
		BuyerFeeInvoices,
		BuyerFeeInvoiceFiles,
		ReconciliationRuns,
		ReconciliationMismatches,
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
			consumeRiskSignalOutboxTask,
			processWebhookEventTask,
			reconcilePendingPaymentsTask,
			liftExpiredShopSuspensionsTask,
			processKycEventTask,
			purgeVerificationDataTask,
			purgeShopActivityTask,
			purgeRiskDataTask,
			abandonCartsTask,
			applyResalePriceChangesTask,
			advanceReturnCasesTask,
			advanceDisputesTask,
			purgeCaseEvidenceTask,
			expireStrikesTask,
			publishHeldReviewsTask,
			issueCommissionInvoicesTask,
			enforceCommissionOverdueTask,
			enforceResaleTermsTask,
			refreshResaleLinkStatsTask,
			reconcileStockCachesTask,
			renderDisputeCertificateTask,
			dispatchOrderEventTask,
			expireOrdersTask,
			expirePurchaseOrdersTask,
			failStaleOrdersTask,
			flushListingViewsTask,
			aggregateShopDailyStatsTask,
			sendWeeklyInsightsTask,
			completeOrdersTask,
			markOverdueResellerChargesTask,
			payResellerCommissionsTask,
			releaseResellerCommissionsTask,
			retryResellerPayoutsTask,
			...paymentTasks,
			...deliveryTasks,
		],
		autoRun: [
			{ cron: "0 0 * * *", queue: "nightly", limit: 10 },
			{ cron: "0 */6 * * *", queue: "nightly", limit: 10 },
			{ cron: "* * * * *", queue: PAYMENTS, limit: 50 },
			// A vendor result must reach a person promptly, not on the nightly
			// sweep: `processKycEvent` is queued on the default queue (Payload's
			// implicit target when `payload.jobs.queue()` gets no `queue`), so
			// that queue needs its own frequent run alongside "payments".
			{ cron: "* * * * *", queue: "default", limit: 20 },
			// Commission runs on its own queue so a weekly invoicing pass can
			// never be starved by, or starve, the nightly sweeps.
			{ cron: "*/15 * * * *", queue: "commission", limit: 20 },
			{ cron: "0 5 * * 1", queue: "commission", limit: 20 },
			// Weekly seller summaries: the schedule queues at 07:00 UTC Monday and
			// this drains it, retrying through the morning.
			{ cron: "*/15 7-8 * * 1", queue: "insights", limit: 20 },
			{ cron: "0 6 * * *", queue: "commission", limit: 20 },
			// The order lifecycle: `expireOrders` and the `dispatchOrderEvent`
			// retries it enqueues share the five-minute "orders" queue, while
			// `failStaleOrders` and `completeOrders` only ever act on deadlines
			// measured in days.
			{ cron: "*/5 * * * *", queue: "orders", limit: 50 },
			{ cron: "0 * * * *", queue: "hourly", limit: 20 },
			{ cron: "*/15 * * * *", queue: "cases", limit: 50 },
			{ cron: "*/5 * * * *", queue: "cases", limit: 100 },
			{ cron: "*/15 * * * *", queue: "delivery", limit: 50 },
		],
	},
});
