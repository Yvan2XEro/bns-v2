import { describe, expect, it, vi } from "vitest";
import {
	down,
	FEE_INVOICE_INDEX,
	up,
	WEEKLY_PERIOD_INDEX,
} from "../../src/migrations/20261003_000000_p5_invoice_indexes";

interface Index {
	collection: string;
	keys: unknown;
	options: unknown;
}

/** The slice of `Payload` this migration reads: two raw Mongo collections. */
function fakeMongo() {
	const created: Index[] = [];
	const dropped: Array<[string, string]> = [];
	const updates: Array<{ filter: unknown; update: unknown }> = [];
	const mongoCollection = (name: string) => ({
		createIndex: vi.fn(async (keys: unknown, options: unknown) => {
			created.push({ collection: name, keys, options });
			return "ok";
		}),
		dropIndex: vi.fn(async (index: string) => {
			dropped.push([name, index]);
		}),
		updateMany: vi.fn(async (filter: unknown, update: unknown) => {
			updates.push({ filter, update });
			return { modifiedCount: 2 };
		}),
	});
	const payload = {
		logger: { info: vi.fn(), error: vi.fn() },
		db: {
			collections: {
				"commission-invoices": {
					collection: mongoCollection("commission-invoices"),
				},
				"buyer-fee-invoices": {
					collection: mongoCollection("buyer-fee-invoices"),
				},
			},
		},
	};
	return { created, dropped, updates, payload };
}

// One cast for Payload's full `MigrateUpArgs`, as the P4 migration specs do.
const runUp = (payload: ReturnType<typeof fakeMongo>["payload"]) =>
	up({ payload } as unknown as Parameters<typeof up>[0]);
const runDown = (payload: ReturnType<typeof fakeMongo>["payload"]) =>
	down({ payload } as unknown as Parameters<typeof down>[0]);

describe("p5 invoice indexes migration", () => {
	it("stamps pre-P5 invoices weekly, then narrows (shop, periodStart) to them and adds one fee invoice per order", async () => {
		const { payload, created, dropped, updates } = fakeMongo();
		await runUp(payload);

		expect(updates).toEqual([
			{
				filter: { settlement: { $exists: false } },
				update: { $set: { settlement: "mobile_money" } },
			},
		]);
		expect(dropped).toEqual([
			["commission-invoices", "commission_invoice_period_unique"],
		]);
		expect(created).toEqual([
			{
				collection: "commission-invoices",
				keys: { shop: 1, periodStart: 1 },
				options: {
					unique: true,
					name: WEEKLY_PERIOD_INDEX,
					partialFilterExpression: { settlement: "mobile_money" },
				},
			},
			{
				collection: "buyer-fee-invoices",
				keys: { order: 1 },
				options: {
					unique: true,
					name: FEE_INVOICE_INDEX,
					partialFilterExpression: { kind: "invoice" },
				},
			},
		]);
		expect(payload.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({ stamped: 2 }),
		);
	});

	it("restores P4's unconditional index on the way down", async () => {
		const { payload, created, dropped } = fakeMongo();
		await runDown(payload);

		expect(dropped).toEqual([
			["buyer-fee-invoices", FEE_INVOICE_INDEX],
			["commission-invoices", WEEKLY_PERIOD_INDEX],
		]);
		expect(created).toEqual([
			{
				collection: "commission-invoices",
				keys: { shop: 1, periodStart: 1 },
				options: { unique: true, name: "commission_invoice_period_unique" },
			},
		]);
	});
});
