// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { releases, reconciles } = vi.hoisted(() => ({
	releases: { calls: 0, fail: false },
	reconciles: { calls: 0, fail: false },
}));

vi.mock("../../src/services/payouts", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/services/payouts")>()),
	releaseEligibleFunds: async () => {
		releases.calls++;
		if (releases.fail) throw new Error("batch failed");
		return { caughtUp: [], early: [], payouts: [{}], skipped: [] };
	},
}));
vi.mock("../../src/services/reconciliation", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/reconciliation")
	>()),
	runReconciliation: async () => {
		reconciles.calls++;
		if (reconciles.fail) throw new Error("run failed");
		return { id: "run-1", counts: { checked: 1 } };
	},
}));

import { reconcileLedgerTask } from "../../src/jobs/reconcileLedger";
import { releaseEligibleFundsTask } from "../../src/jobs/releaseEligibleFunds";
import { localDateAndHour } from "../../src/lib/localTime";
import { invalidateMarketCache } from "../../src/lib/marketCache";
import { migrateP10Markets } from "../../src/migrations/p10Markets";
import configPromise from "../../src/payload.config";
import { withRawMongo } from "./helpers/fakeMongo";
import { fakePayload } from "./helpers/fakePayload";

async function world(extra?: { timezone: string }) {
	const api = withRawMongo(fakePayload({ "market-cities": [] }));
	await migrateP10Markets(api);
	if (extra) {
		const cm = api.store.markets[0];
		api.store.markets.push({
			...JSON.parse(JSON.stringify(cm)),
			id: "market-br",
			countryCode: "BR",
			timezone: extra.timezone,
		});
	}
	return api;
}

const at = (iso: string) => vi.setSystemTime(new Date(iso));
const run = (task: { handler: unknown }, api: unknown) =>
	(task.handler as (a: unknown) => Promise<unknown>)({ req: { payload: api } });
const stampOf = (
	api: Awaited<ReturnType<typeof world>>,
	code: string,
	f: string,
) =>
	(
		api.store.markets.find((m) => m.countryCode === code)?.moneyCalendar as
			| Record<string, unknown>
			| undefined
	)?.[f];

beforeEach(() => {
	vi.useFakeTimers();
	releases.calls = reconciles.calls = 0;
	releases.fail = reconciles.fail = false;
});
afterEach(() => vi.useRealTimers());

describe("market money calendar", () => {
	it("pins both sweeps hourly", async () => {
		const tasks = (await configPromise).jobs?.tasks ?? [];
		for (const slug of ["releaseEligibleFunds", "reconcileLedger"]) {
			const task = tasks.find((t) => String(t.slug) === slug);
			expect(task?.schedule?.map((s) => [s.cron, s.queue])).toEqual([
				["0 * * * *", "payments"],
			]);
		}
	});

	it("CM fires at the hours the old UTC crons meant in Douala", async () => {
		const api = await world();
		const cm = api.store.markets[0].moneyCalendar as Record<string, number>;
		// old "0 9 * * *" and "30 1 * * *" UTC
		expect(
			localDateAndHour(new Date("2026-10-09T09:00:00Z"), "Africa/Douala").hour,
		).toBe(cm.releaseHourLocal);
		expect(
			localDateAndHour(new Date("2026-10-09T01:30:00Z"), "Africa/Douala").hour,
		).toBe(cm.reconcileHourLocal);
	});

	describe.each([
		[
			"release",
			releaseEligibleFundsTask,
			releases,
			"lastReleaseLocalDate",
			"09:00",
			"08:00",
		],
		[
			"reconcile",
			reconcileLedgerTask,
			reconciles,
			"lastReconcileLocalDate",
			"01:00",
			"00:00",
		],
	] as const)("%s", (_n, task, counter, stampField, hit, miss) => {
		it("runs at the market's local hour and skips the others", async () => {
			const api = await world();
			at(`2026-10-09T${miss}:00Z`);
			await run(task, api);
			expect(counter.calls).toBe(0);
			at(`2026-10-09T${hit}:00Z`);
			await run(task, api);
			expect(counter.calls).toBe(1);
			expect(stampOf(api, "CM", stampField)).toBe("2026-10-09");
		});

		it("catches up a missed hour later the same local day, once, and not before the hour", async () => {
			// Ruling (T18 checkpoint): the hour is a floor, not an equality. A worker
			// down through the market's hour still runs its day; the stamp keeps it
			// from running twice.
			const api = await world();
			at(`2026-10-09T${miss}:00Z`);
			await run(task, api);
			expect(counter.calls).toBe(0);
			at(
				`2026-10-09T${hit.replace(/^\d\d/, (h) => String(Number(h) + 3).padStart(2, "0"))}:00Z`,
			);
			await run(task, api);
			await run(task, api);
			expect(counter.calls).toBe(1);
			expect(stampOf(api, "CM", stampField)).toBe("2026-10-09");
		});

		it("run twice in the same hour is one batch and one stamp", async () => {
			const api = await world();
			at(`2026-10-09T${hit}:00Z`);
			await run(task, api);
			await run(task, api);
			expect(counter.calls).toBe(1);
			expect(stampOf(api, "CM", stampField)).toBe("2026-10-09");
		});

		it("the next local day runs again", async () => {
			const api = await world();
			at(`2026-10-09T${hit}:00Z`);
			await run(task, api);
			at(`2026-10-10T${hit}:00Z`);
			await run(task, api);
			expect(counter.calls).toBe(2);
		});

		it("a failed batch leaves no stamp, so the retry runs it", async () => {
			const api = await world();
			at(`2026-10-09T${hit}:00Z`);
			counter.fail = true;
			await expect(run(task, api)).rejects.toThrow();
			expect(stampOf(api, "CM", stampField)).toBeUndefined();
			counter.fail = false;
			await run(task, api);
			expect(counter.calls).toBe(2);
			expect(stampOf(api, "CM", stampField)).toBe("2026-10-09");
		});

		it("a second market at UTC-3 fires at its own hour, once per local day", async () => {
			const api = await world({ timezone: "America/Sao_Paulo" });
			const brHour = hit === "09:00" ? 13 : 5; // 10:00 / 02:00 at UTC-3
			const cmHit = `2026-10-09T${hit}:00Z`;
			at(cmHit);
			await run(task, api);
			expect(counter.calls).toBe(1);
			expect(stampOf(api, "CM", stampField)).toBe("2026-10-09");
			// Catch-up: reconcile's BR hour already passed on its previous local day,
			// so BR may stamp that day, but never CM's date.
			expect(stampOf(api, "BR", stampField)).not.toBe("2026-10-09");
			invalidateMarketCache(api);
			at(`2026-10-09T${String(brHour).padStart(2, "0")}:00:00Z`);
			await run(task, api);
			await run(task, api);
			expect(counter.calls).toBe(2);
			expect(stampOf(api, "BR", stampField)).toBe("2026-10-09");
		});
	});
});
