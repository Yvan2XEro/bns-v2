import type { MongooseAdapter } from "@payloadcms/db-mongodb";
import type { Payload } from "payload";
import { ensureIndexes, INDEXES, mongoCollectionOf } from "../db/indexes";
import {
	type DeployTask,
	fingerprintOf,
	type LedgerCollection,
	mongoDeployLedger,
	runDeployTasks,
} from "../lib/deployTasks";
import {
	notificationWorkflowsFingerprint,
	syncNotificationWorkflows,
} from "../scripts/syncNotificationWorkflows";
import { seedMarkets } from "../seed/seedMarkets";
import {
	catchUpCategories,
	categoryCatchUpFingerprint,
} from "./categoryCatchUp";
import { isNotificationProviderConfigured } from "./notificationProvider";
import { importTaxonomy, taxonomyFingerprint } from "./taxonomyImport";

/**
 * What used to be the manual half of a release checklist, now run by the API
 * itself after it boots. Add a task here instead of writing "after deploying,
 * run …" in a runbook.
 */
export function bootTasks(): DeployTask<Payload>[] {
	return [
		{
			// The partial unique indexes and the TTL the collection configs
			// cannot declare (db/indexes.ts); a new database gets them first.
			name: "database-indexes",
			fingerprint: fingerprintOf(INDEXES),
			run: async (payload) => {
				const { created } = await ensureIndexes(mongoCollectionOf(payload));
				payload.logger.info(`[indexes] ${created} in place`);
			},
		},
		{
			// The Cameroon market and its launch cities: no price shows and no
			// order is placed without them (seed/seedMarkets.ts).
			name: "markets",
			fingerprint: "v1",
			run: seedMarkets,
		},
		{
			name: "notification-workflows",
			// The workflows and the instance they go to: moving to another Novu
			// (self-hosted, another environment) syncs them there too.
			fingerprint: notificationWorkflowsFingerprint(process.env),
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
			// The taxonomy extension (seed/taxonomy): new categories, attributes,
			// options, aliases and tags, added without touching what is there.
			// After the catch-up, whose attributes it builds on.
			name: "taxonomy-extension",
			fingerprint: taxonomyFingerprint(),
			run: async (payload) => {
				const report = await importTaxonomy(payload, {
					log: (line) => payload.logger.info(`[taxonomy] ${line}`),
				});
				// Failing leaves the task unrecorded: the next boot fetches the
				// pictures still missing (Pixabay limits its rate).
				if (report.picturesFailed > 0)
					throw new Error(`${report.picturesFailed} pictures not fetched`);
			},
		},
	];
}

export async function runBootTasks(payload: Payload): Promise<void> {
	const db = payload.db as unknown as MongooseAdapter;
	const collection: LedgerCollection = db.connection.collection("deploy_tasks");
	await runDeployTasks(bootTasks(), payload, mongoDeployLedger(collection), {
		info: (msg) => payload.logger.info(msg),
		error: (msg) => payload.logger.error(msg),
	});
}
