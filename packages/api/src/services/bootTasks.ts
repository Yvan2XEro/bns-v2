import type { MongooseAdapter } from "@payloadcms/db-mongodb";
import type { Payload } from "payload";
import {
	type DeployTask,
	type LedgerCollection,
	mongoDeployLedger,
	runDeployTasks,
} from "../lib/deployTasks";
import {
	notificationWorkflowsFingerprint,
	syncNotificationWorkflows,
} from "../scripts/syncNotificationWorkflows";
import {
	catchUpCategories,
	categoryCatchUpFingerprint,
} from "./categoryCatchUp";
import { isNotificationProviderConfigured } from "./notificationProvider";
import { aggregateShopDailyStatsForDay } from "./shopDailyAggregation";
import {
	automaticBackfillStart,
	listShopStatsBackfillDates,
} from "./shopDailyStatsBackfill";

/**
 * What used to be the manual half of a release checklist, now run by the API
 * itself after it boots. Add a task here instead of writing "after deploying,
 * run …" in a runbook.
 */
export function bootTasks(): DeployTask<Payload>[] {
	return [
		{
			name: "notification-workflows",
			fingerprint: notificationWorkflowsFingerprint(),
			enabled: isNotificationProviderConfigured,
			run: async (payload) => {
				await syncNotificationWorkflows({
					log: (line) => payload.logger.info(line),
				});
			},
		},
		{
			name: "category-catch-up",
			fingerprint: categoryCatchUpFingerprint(),
			run: async (payload) => {
				await catchUpCategories(payload, {
					log: (line) => payload.logger.info(`[categories] ${line.trim()}`),
				});
			},
		},
		{
			// The nightly job fills each day from then on; this fills the days
			// before the aggregate existed. Bump the fingerprint to refill.
			name: "shop-daily-stats-backfill",
			fingerprint: "v1",
			run: backfillShopDailyStats,
		},
	];
}

async function backfillShopDailyStats(payload: Payload): Promise<void> {
	const first = await payload.find({
		collection: "shops",
		sort: "createdAt",
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const createdAt = first.docs[0]?.createdAt;
	const from = automaticBackfillStart(createdAt ? new Date(createdAt) : null);
	if (!from) return;
	for (const date of listShopStatsBackfillDates(from)) {
		const result = await aggregateShopDailyStatsForDay(payload, date);
		payload.logger.info({
			msg: "[shop-daily-stats] backfill day complete",
			date,
			...result,
		});
	}
}

export async function runBootTasks(payload: Payload): Promise<void> {
	const db = payload.db as unknown as MongooseAdapter;
	const collection: LedgerCollection = db.connection.collection("deploy_tasks");
	await runDeployTasks(bootTasks(), payload, mongoDeployLedger(collection), {
		info: (msg) => payload.logger.info(msg),
		error: (msg) => payload.logger.error(msg),
	});
}
