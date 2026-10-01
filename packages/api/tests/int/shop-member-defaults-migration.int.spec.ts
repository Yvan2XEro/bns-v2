import { describe, expect, it, vi } from "vitest";
import { up } from "../../src/migrations/20261001_000200_p3_shop_member_defaults";

function fakeMongo() {
	const rows: Record<string, unknown>[] = [
		{
			// P1 owner row: neither field existed yet.
			_id: "m-owner-old",
			shop: "s-1",
			user: "u-owner",
			role: "owner",
			status: "active",
			createdAt: new Date("2026-08-01T00:00:00.000Z"),
		},
		{
			// Already carries inboxNotifications (e.g. written by a dry-run
			// re-apply) but is still missing joinedAt.
			_id: "m-half-a",
			shop: "s-2",
			user: "u-a",
			role: "owner",
			status: "active",
			createdAt: new Date("2026-08-02T00:00:00.000Z"),
			inboxNotifications: "assigned",
		},
		{
			// Already carries joinedAt but is still missing inboxNotifications.
			_id: "m-half-b",
			shop: "s-3",
			user: "u-b",
			role: "owner",
			status: "active",
			createdAt: new Date("2026-08-03T00:00:00.000Z"),
			joinedAt: new Date("2026-08-03T00:00:00.000Z"),
		},
		{
			// Already fully written by the P3 code path: must be left alone.
			_id: "m-complete",
			shop: "s-4",
			user: "u-c",
			role: "owner",
			status: "active",
			createdAt: new Date("2026-09-01T00:00:00.000Z"),
			joinedAt: new Date("2026-09-01T00:00:00.000Z"),
			inboxNotifications: "none",
		},
	];

	const collection = {
		find: () => ({ toArray: async () => rows }),
		updateOne: vi.fn(
			async (
				filter: { _id: string },
				update: { $set?: Record<string, unknown> },
			) => {
				const doc = rows.find((d) => d._id === filter._id);
				if (doc && update.$set) Object.assign(doc, update.$set);
			},
		),
	};

	return {
		rows,
		payload: {
			logger: { info: vi.fn(), error: vi.fn() },
			db: { collections: { "shop-members": { collection } } },
		},
	};
}

describe("p3 shop-member defaults migration", () => {
	it("backfills joinedAt from createdAt on a row that predates the field", async () => {
		const { payload, rows } = fakeMongo();
		await up({ payload } as never);
		expect(rows.find((r) => r._id === "m-owner-old")).toMatchObject({
			joinedAt: new Date("2026-08-01T00:00:00.000Z"),
		});
	});

	it("defaults inboxNotifications to 'all' on a row that predates the field", async () => {
		const { payload, rows } = fakeMongo();
		await up({ payload } as never);
		expect(rows.find((r) => r._id === "m-owner-old")).toMatchObject({
			inboxNotifications: "all",
		});
	});

	it("only fills the one missing field on a row that already carries the other", async () => {
		const { payload, rows } = fakeMongo();
		await up({ payload } as never);
		expect(rows.find((r) => r._id === "m-half-a")).toMatchObject({
			joinedAt: new Date("2026-08-02T00:00:00.000Z"),
			inboxNotifications: "assigned",
		});
		expect(rows.find((r) => r._id === "m-half-b")).toMatchObject({
			joinedAt: new Date("2026-08-03T00:00:00.000Z"),
			inboxNotifications: "all",
		});
	});

	it("leaves a row that already carries both fields untouched", async () => {
		const { payload, rows } = fakeMongo();
		await up({ payload } as never);
		expect(rows.find((r) => r._id === "m-complete")).toMatchObject({
			joinedAt: new Date("2026-09-01T00:00:00.000Z"),
			inboxNotifications: "none",
		});
	});

	it("logs exactly how many rows each backfill touched", async () => {
		const { payload } = fakeMongo();
		await up({ payload } as never);
		expect(payload.logger.info).toHaveBeenCalledWith(
			expect.objectContaining({
				joinedAtBackfilled: 2,
				inboxNotificationsBackfilled: 2,
			}),
		);
	});
});
