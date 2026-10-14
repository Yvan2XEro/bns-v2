import { createHash } from "node:crypto";
import { hostname } from "node:os";

/**
 * One-off work a deploy used to need someone to run by hand — syncing the
 * Novu workflows, catching the category tree up with the seed, backfilling a
 * new aggregate. Each task runs once per `fingerprint`: change what it does
 * (new workflows, new seed attributes) and the fingerprint changes with it, so
 * the next boot runs it again; leave it alone and every later boot skips it.
 *
 * Schema and data migrations are not tasks: they stay Payload migrations,
 * applied before the server takes traffic. Tasks run after, in the
 * background, and must be idempotent — a crash between "done" and "recorded"
 * runs them twice.
 */
export interface DeployTask<Ctx> {
	name: string;
	fingerprint: string;
	/** False skips the task without recording it (e.g. Novu not configured). */
	enabled?: () => boolean;
	run: (ctx: Ctx) => Promise<void>;
}

/** Where completed fingerprints and the run lease live. */
export interface DeployLedger {
	/** True when this process may run the task now. */
	claim(name: string, fingerprint: string, leaseMs: number): Promise<boolean>;
	complete(name: string, fingerprint: string): Promise<void>;
	fail(name: string, error: string): Promise<void>;
}

export type DeployTaskOutcome = "done" | "skipped" | "disabled" | "failed";

interface Logger {
	info: (msg: string) => void;
	error: (msg: string) => void;
}

const LEASE_MS = 30 * 60 * 1000;

export function fingerprintOf(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(value))
		.digest("hex")
		.slice(0, 16);
}

/**
 * Runs every pending task in order. A failing task is logged and recorded,
 * never thrown: the API is already serving, and the next boot retries it.
 */
export async function runDeployTasks<Ctx>(
	tasks: DeployTask<Ctx>[],
	ctx: Ctx,
	ledger: DeployLedger,
	log: Logger,
): Promise<Record<string, DeployTaskOutcome>> {
	const outcomes: Record<string, DeployTaskOutcome> = {};
	for (const task of tasks) {
		if (task.enabled && !task.enabled()) {
			outcomes[task.name] = "disabled";
			continue;
		}
		if (!(await ledger.claim(task.name, task.fingerprint, LEASE_MS))) {
			outcomes[task.name] = "skipped";
			continue;
		}
		log.info(`[deploy] ${task.name} (${task.fingerprint}) starting`);
		try {
			await task.run(ctx);
			await ledger.complete(task.name, task.fingerprint);
			outcomes[task.name] = "done";
			log.info(`[deploy] ${task.name} done`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await ledger.fail(task.name, message).catch(() => undefined);
			outcomes[task.name] = "failed";
			log.error(`[deploy] ${task.name} failed, retried next boot: ${message}`);
		}
	}
	return outcomes;
}

// ─── Mongo ledger ────────────────────────────────────────────────────────────

/** The slice of a MongoDB driver collection the ledger uses. */
export interface LedgerCollection {
	updateOne(
		filter: Record<string, unknown>,
		update: Record<string, unknown>,
		options?: { upsert?: boolean },
	): Promise<{ modifiedCount: number; upsertedCount: number }>;
}

function isDuplicateKey(error: unknown): boolean {
	return (
		!!error &&
		typeof error === "object" &&
		"code" in error &&
		(error as { code: unknown }).code === 11000
	);
}

/**
 * A `deploy_tasks` document per task. The claim is one conditional upsert:
 * it matches only while the recorded fingerprint differs and no live lease is
 * held, so two API containers booting together never both run a task.
 */
export function mongoDeployLedger(
	collection: LedgerCollection,
	now: () => Date = () => new Date(),
): DeployLedger {
	const holder = `${hostname()}:${process.pid}`;
	return {
		async claim(name, fingerprint, leaseMs) {
			const at = now();
			try {
				const result = await collection.updateOne(
					{
						_id: name,
						fingerprint: { $ne: fingerprint },
						$or: [
							{ lockedUntil: { $exists: false } },
							{ lockedUntil: { $lt: at } },
						],
					},
					{
						$set: {
							lockedUntil: new Date(at.getTime() + leaseMs),
							lockedBy: holder,
						},
					},
					{ upsert: true },
				);
				return result.modifiedCount + result.upsertedCount > 0;
			} catch (error) {
				// The document exists but the filter did not match (done, or
				// leased elsewhere): the upsert tried to insert a second `_id`.
				if (isDuplicateKey(error)) return false;
				throw error;
			}
		},
		async complete(name, fingerprint) {
			await collection.updateOne(
				{ _id: name },
				{
					$set: { fingerprint, completedAt: now() },
					$unset: {
						lockedUntil: "",
						lockedBy: "",
						lastError: "",
						failedAt: "",
					},
				},
			);
		},
		async fail(name, error) {
			await collection.updateOne(
				{ _id: name },
				{
					$set: { lastError: error.slice(0, 2000), failedAt: now() },
					$unset: { lockedUntil: "", lockedBy: "" },
				},
			);
		},
	};
}
