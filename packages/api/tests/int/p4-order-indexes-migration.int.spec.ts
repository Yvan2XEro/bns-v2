import { describe, expect, it, vi } from "vitest";
import {
	down,
	up,
} from "../../src/migrations/20261002_000000_p4_order_indexes";

/** The slice of `Payload` this migration actually reads. */
interface FakePayload {
	logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
	db: { collections: Record<string, { collection: unknown }> };
}

function fakeMongo() {
	const createdIndexes: Array<{ keys: unknown; options: unknown }> = [];
	const droppedIndexes: string[] = [];
	const collectionOf = () => ({
		createIndex: vi.fn(async (keys: unknown, options: unknown) => {
			createdIndexes.push({ keys, options });
			return "ok";
		}),
		dropIndex: vi.fn(async (name: string) => {
			droppedIndexes.push(name);
		}),
	});
	const collections = {
		carts: { collection: collectionOf() },
		orders: { collection: collectionOf() },
		"commission-lines": { collection: collectionOf() },
		"commission-invoices": { collection: collectionOf() },
	};
	const payload: FakePayload = {
		logger: { info: vi.fn(), error: vi.fn() },
		db: { collections },
	};
	return { createdIndexes, droppedIndexes, payload };
}

// `up`/`down` take Payload's own `MigrateUpArgs`/`MigrateDownArgs`, whose
// `payload` is the full `Payload` instance — far more than a raw-driver
// migration ever reads. One cast here, rather than one at every call site,
// is what the migration itself actually depends on: a logger and the raw
// Mongo driver's collections.
const runUp = (payload: FakePayload) =>
	up({ payload } as unknown as Parameters<typeof up>[0]);
const runDown = (payload: FakePayload) =>
	down({ payload } as unknown as Parameters<typeof down>[0]);

const byName = (
	indexes: Array<{ keys: unknown; options: unknown }>,
	name: string,
) => indexes.find((i) => (i.options as { name?: string }).name === name);

describe("p4 order indexes migration", () => {
	it("creates one active cart per user — only active carts are unique per user", async () => {
		const { payload, createdIndexes } = fakeMongo();
		await runUp(payload);
		const index = byName(createdIndexes, "carts_active_user_unique");
		expect(index?.keys).toEqual({ user: 1 });
		expect(index?.options).toMatchObject({
			unique: true,
			partialFilterExpression: { status: "active" },
		});
	});

	it("creates one order per (buyer, idempotencyKey), limited to rows that actually carry one", async () => {
		const { payload, createdIndexes } = fakeMongo();
		await runUp(payload);
		const index = byName(createdIndexes, "orders_buyer_idempotency_unique");
		expect(index?.keys).toEqual({ buyer: 1, idempotencyKey: 1 });
		expect(index?.options).toMatchObject({
			unique: true,
			partialFilterExpression: { idempotencyKey: { $type: "string" } },
		});
	});

	it("creates one charge commission line per order", async () => {
		const { payload, createdIndexes } = fakeMongo();
		await runUp(payload);
		const index = byName(createdIndexes, "commission_charge_per_order_unique");
		expect(index?.keys).toEqual({ order: 1, kind: 1 });
		expect(index?.options).toMatchObject({
			unique: true,
			partialFilterExpression: { kind: "charge" },
		});
	});

	it("creates one commission invoice per (shop, periodStart), with no partial filter needed", async () => {
		const { payload, createdIndexes } = fakeMongo();
		await runUp(payload);
		const index = byName(createdIndexes, "commission_invoice_period_unique");
		expect(index?.keys).toEqual({ shop: 1, periodStart: 1 });
		expect(index?.options).toMatchObject({ unique: true });
		expect(
			(index?.options as { partialFilterExpression?: unknown })
				.partialFilterExpression,
		).toBeUndefined();
	});

	it("logs all four index names", async () => {
		const { payload } = fakeMongo();
		await runUp(payload);
		expect(payload.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				indexes: [
					"carts_active_user_unique",
					"orders_buyer_idempotency_unique",
					"commission_charge_per_order_unique",
					"commission_invoice_period_unique",
				],
			}),
		);
	});

	it("a second run is a no-op: creating the same named index twice does not throw", async () => {
		const { payload } = fakeMongo();
		await runUp(payload);
		await expect(runUp(payload)).resolves.toBeUndefined();
	});

	it("down drops every index this migration created", async () => {
		const { payload, droppedIndexes } = fakeMongo();
		await runDown(payload);
		expect(droppedIndexes.sort()).toEqual(
			[
				"carts_active_user_unique",
				"orders_buyer_idempotency_unique",
				"commission_charge_per_order_unique",
				"commission_invoice_period_unique",
			].sort(),
		);
	});
});
