import { describe, expect, it, vi } from "vitest";
import {
	OPEN_STOCK_COUNT_INDEX,
	up,
} from "../../src/migrations/20261015_000000_p10_stock_count_open_index";

function fakeMongo(groups: unknown[] = []) {
	const sessions = {
		aggregate: vi.fn(() => ({ toArray: async () => groups })),
		updateMany: vi.fn(async () => ({})),
		createIndex: vi.fn(async () => "ok"),
	};
	const payload = {
		logger: { info: vi.fn(), warn: vi.fn() },
		db: { collections: { "stock-count-sessions": { collection: sessions } } },
	};
	return { payload, sessions };
}

const runUp = (payload: unknown) =>
	up({ payload } as unknown as Parameters<typeof up>[0]);

describe("one open stock count per shop migration", () => {
	it("builds a unique index on shop over open sessions only", async () => {
		const { payload, sessions } = fakeMongo();
		await runUp(payload);

		expect(sessions.updateMany).not.toHaveBeenCalled();
		expect(sessions.createIndex).toHaveBeenCalledWith(
			{ shop: 1 },
			{
				unique: true,
				name: OPEN_STOCK_COUNT_INDEX,
				partialFilterExpression: { status: "open" },
			},
		);
	});

	it("cancels all but the newest open session of a shop first", async () => {
		const { payload, sessions } = fakeMongo([
			{ _id: "s-1", ids: ["newest", "older", "oldest"] },
		]);
		await runUp(payload);

		expect(sessions.updateMany).toHaveBeenCalledWith(
			{ _id: { $in: ["older", "oldest"] } },
			expect.objectContaining({
				$set: expect.objectContaining({ status: "cancelled" }),
			}),
		);
		expect(sessions.createIndex).toHaveBeenCalled();
	});
});
