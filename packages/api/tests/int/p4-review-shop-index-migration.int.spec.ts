import { describe, expect, it, vi } from "vitest";
import {
	down,
	up,
} from "../../src/migrations/20261002_000100_p4_review_shop_index";

/** The slice of `Payload` this migration actually reads. */
interface FakePayload {
	logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
	db: { collections: Record<string, { collection: unknown }> };
}

function fakeMongo() {
	const createdIndexes: Array<{ keys: unknown; options: unknown }> = [];
	const droppedIndexes: string[] = [];
	const reviews = {
		createIndex: vi.fn(async (keys: unknown, options: unknown) => {
			createdIndexes.push({ keys, options });
			return "ok";
		}),
		dropIndex: vi.fn(async (name: string) => {
			droppedIndexes.push(name);
		}),
	};
	const payload: FakePayload = {
		logger: { info: vi.fn(), error: vi.fn() },
		db: { collections: { reviews: { collection: reviews } } },
	};
	return { createdIndexes, droppedIndexes, payload, reviews };
}

// `up`/`down` take Payload's own `MigrateUpArgs`/`MigrateDownArgs`, whose
// `payload` is the full `Payload` instance — far more than this migration
// ever reads. One cast here, mirroring `p4-order-indexes-migration.int.spec.ts`,
// rather than one at every call site.
const runUp = (payload: FakePayload) =>
	up({ payload } as unknown as Parameters<typeof up>[0]);
const runDown = (payload: FakePayload) =>
	down({ payload } as unknown as Parameters<typeof down>[0]);

const byName = (
	indexes: Array<{ keys: unknown; options: unknown }>,
	name: string,
) => indexes.find((i) => (i.options as { name?: string }).name === name);

describe("p4 review shop index migration", () => {
	it("drops P0's two-field index and creates the three-field (reviewer, reviewedUser, shop) one", async () => {
		const { payload, droppedIndexes, createdIndexes } = fakeMongo();
		await runUp(payload);

		expect(droppedIndexes).toEqual(["reviewer_1_reviewedUser_1_unique"]);

		const index = byName(
			createdIndexes,
			"reviewer_1_reviewedUser_1_shop_1_unique",
		);
		expect(index?.keys).toEqual({ reviewer: 1, reviewedUser: 1, shop: 1 });
		expect(index?.options).toMatchObject({ unique: true });
	});

	it("preserves P0's rule when shop is null: no sparse flag, no partial filter excluding it", async () => {
		const { payload, createdIndexes } = fakeMongo();
		await runUp(payload);

		const index = byName(
			createdIndexes,
			"reviewer_1_reviewedUser_1_shop_1_unique",
		);
		const options = index?.options as {
			sparse?: boolean;
			partialFilterExpression?: unknown;
		};
		expect(options.sparse).toBeUndefined();
		expect(options.partialFilterExpression).toBeUndefined();
	});

	it("logs the new index name", async () => {
		const { payload } = fakeMongo();
		await runUp(payload);

		expect(payload.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				index: "reviewer_1_reviewedUser_1_shop_1_unique",
			}),
		);
	});

	it("is idempotent: a second run does not throw and produces the same index twice", async () => {
		const { payload, createdIndexes } = fakeMongo();
		await runUp(payload);
		await expect(runUp(payload)).resolves.toBeUndefined();

		const matches = createdIndexes.filter(
			(index) =>
				(index.options as { name?: string }).name ===
				"reviewer_1_reviewedUser_1_shop_1_unique",
		);
		expect(matches).toHaveLength(2);
	});

	it("down drops the three-field index and restores P0's two-field one", async () => {
		const { payload, droppedIndexes, createdIndexes } = fakeMongo();
		await runDown(payload);

		expect(droppedIndexes).toEqual(["reviewer_1_reviewedUser_1_shop_1_unique"]);
		const restored = byName(createdIndexes, "reviewer_1_reviewedUser_1_unique");
		expect(restored?.keys).toEqual({ reviewer: 1, reviewedUser: 1 });
		expect(restored?.options).toMatchObject({ unique: true });
	});
});
