import { describe, expect, it } from "vitest";
import {
	type DeployLedger,
	type DeployTask,
	fingerprintOf,
	type LedgerCollection,
	mongoDeployLedger,
	runDeployTasks,
} from "../../src/lib/deployTasks";
import { afterCollectionsReady } from "../../src/lib/migrationsReady";
import { categoryCatchUpFingerprint } from "../../src/services/categoryCatchUp";
import { automaticBackfillStart } from "../../src/services/shopDailyStatsBackfill";

function memoryLedger(): DeployLedger & { done: Map<string, string> } {
	const done = new Map<string, string>();
	const leased = new Set<string>();
	return {
		done,
		async claim(name, fingerprint) {
			if (done.get(name) === fingerprint || leased.has(name)) return false;
			leased.add(name);
			return true;
		},
		async complete(name, fingerprint) {
			leased.delete(name);
			done.set(name, fingerprint);
		},
		async fail(name) {
			leased.delete(name);
		},
	};
}

const silent = { info: () => undefined, error: () => undefined };

function task(
	name: string,
	fingerprint: string,
	runs: string[],
	extra: Partial<DeployTask<null>> = {},
): DeployTask<null> {
	return {
		name,
		fingerprint,
		run: async () => {
			runs.push(name);
		},
		...extra,
	};
}

describe("runDeployTasks", () => {
	it("runs each task once per fingerprint", async () => {
		const ledger = memoryLedger();
		const runs: string[] = [];
		const tasks = [task("a", "1", runs), task("b", "1", runs)];

		expect(await runDeployTasks(tasks, null, ledger, silent)).toEqual({
			a: "done",
			b: "done",
		});
		expect(await runDeployTasks(tasks, null, ledger, silent)).toEqual({
			a: "skipped",
			b: "skipped",
		});
		expect(runs).toEqual(["a", "b"]);

		await runDeployTasks([task("a", "2", runs)], null, ledger, silent);
		expect(runs).toEqual(["a", "b", "a"]);
	});

	it("records nothing for a failed task, so the next boot retries it, and carries on", async () => {
		const ledger = memoryLedger();
		const runs: string[] = [];
		const broken = task("a", "1", runs, {
			run: async () => {
				throw new Error("novu down");
			},
		});

		expect(
			await runDeployTasks(
				[broken, task("b", "1", runs)],
				null,
				ledger,
				silent,
			),
		).toEqual({ a: "failed", b: "done" });
		expect(ledger.done.has("a")).toBe(false);

		await runDeployTasks([task("a", "1", runs)], null, ledger, silent);
		expect(runs).toEqual(["b", "a"]);
	});

	it("leaves a disabled task unrecorded", async () => {
		const ledger = memoryLedger();
		const runs: string[] = [];
		const outcome = await runDeployTasks(
			[task("a", "1", runs, { enabled: () => false })],
			null,
			ledger,
			silent,
		);
		expect(outcome).toEqual({ a: "disabled" });
		expect(runs).toEqual([]);
		expect(ledger.done.size).toBe(0);
	});
});

describe("mongoDeployLedger", () => {
	const at = new Date("2026-10-14T10:00:00.000Z");

	function recorder(
		result: { modifiedCount: number; upsertedCount: number } | Error,
	) {
		const calls: Array<{
			filter: Record<string, unknown>;
			update: Record<string, unknown>;
			options?: { upsert?: boolean };
		}> = [];
		const collection: LedgerCollection = {
			async updateOne(filter, update, options) {
				calls.push({ filter, update, options });
				if (result instanceof Error) throw result;
				return result;
			},
		};
		return { calls, ledger: mongoDeployLedger(collection, () => at) };
	}

	it("claims with one conditional upsert: other fingerprint, no live lease", async () => {
		const { calls, ledger } = recorder({ modifiedCount: 0, upsertedCount: 1 });
		expect(await ledger.claim("a", "fp", 60_000)).toBe(true);
		expect(calls[0]?.filter).toEqual({
			_id: "a",
			fingerprint: { $ne: "fp" },
			$or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: at } }],
		});
		expect(calls[0]?.options).toEqual({ upsert: true });
		expect(calls[0]?.update).toMatchObject({
			$set: { lockedUntil: new Date(at.getTime() + 60_000) },
		});
	});

	it("reads a duplicate-key upsert as 'already done or leased'", async () => {
		const duplicate = Object.assign(new Error("E11000"), { code: 11000 });
		const { ledger } = recorder(duplicate);
		expect(await ledger.claim("a", "fp", 60_000)).toBe(false);
	});

	it("rethrows any other database error", async () => {
		const { ledger } = recorder(new Error("network"));
		await expect(ledger.claim("a", "fp", 60_000)).rejects.toThrow("network");
	});
});

describe("fingerprints", () => {
	it("are stable for equal values and differ for different ones", () => {
		expect(fingerprintOf({ a: 1 })).toBe(fingerprintOf({ a: 1 }));
		expect(fingerprintOf({ a: 1 })).not.toBe(fingerprintOf({ a: 2 }));
		expect(categoryCatchUpFingerprint()).toMatch(/^[0-9a-f]{16}$/);
	});
});

describe("automaticBackfillStart", () => {
	const now = new Date("2026-10-14T10:00:00.000Z");

	it("starts on the first shop's Douala day", () => {
		expect(
			automaticBackfillStart(new Date("2026-09-30T23:30:00.000Z"), now),
		).toBe("2026-10-01");
	});

	it("never reaches back more than a year", () => {
		expect(
			automaticBackfillStart(new Date("2020-01-01T00:00:00.000Z"), now),
		).toBe("2025-10-14");
	});

	it("has nothing to do without a shop or a completed day", () => {
		expect(automaticBackfillStart(null, now)).toBeNull();
		expect(
			automaticBackfillStart(new Date("2026-10-14T08:00:00.000Z"), now),
		).toBeNull();
	});
});

describe("afterCollectionsReady", () => {
	it("lets every model finish creating its collection before a migration runs", async () => {
		const order: string[] = [];
		const model = (name: string) => ({
			init: async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				order.push(`init:${name}`);
			},
		});
		const payload = {
			db: {
				collections: { a: model("a"), "payload-migrations": model("m") },
				versions: { a: model("va") },
				globals: model("g"),
			},
		};
		const [wrapped] = afterCollectionsReady([
			{
				name: "x",
				up: async (_args: unknown) => {
					order.push("up");
				},
				down: async () => undefined,
			},
		]);

		await wrapped?.up({ payload });

		expect(order.at(-1)).toBe("up");
		expect(order).toHaveLength(5);
	});
});
