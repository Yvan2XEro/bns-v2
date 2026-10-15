// @vitest-environment node
import { describe, expect, it } from "vitest";
import { courierStats } from "../../src/services/delivery/courierStats";
import { fakePayload } from "./helpers/fakePayload";

const shop = {
	id: "shop-1",
	owner: "u-owner",
	status: "active",
	level: 2,
	location: { city: "douala" },
};
const members = [
	{
		id: "m-1",
		shop: shop.id,
		user: "u-owner",
		role: "owner",
		status: "active",
	},
	{
		id: "m-2",
		shop: shop.id,
		user: "u-mgr",
		role: "manager",
		status: "active",
	},
];

function shipment(
	id: string,
	status: string,
	createdAt: string,
	extra: Record<string, unknown> = {},
) {
	return {
		id,
		fulfillingShop: shop.id,
		carrier: "courier",
		status,
		courierCost: 3000,
		createdAt,
		...extra,
	};
}

function seed() {
	return fakePayload({
		users: [
			{ id: "u-owner", role: "user" },
			{ id: "u-mgr", role: "user" },
		],
		shops: [shop],
		"shop-members": members,
		shipments: [
			shipment("s-1", "delivered", "2026-09-03T10:00:00.000Z"),
			shipment("s-2", "failed", "2026-09-05T10:00:00.000Z", {
				courierCost: 2000,
			}),
			shipment("s-3", "in_transit", "2026-09-10T10:00:00.000Z"),
			shipment("s-4", "delivered", "2026-08-20T10:00:00.000Z"),
			shipment("s-5", "delivered", "2026-09-04T10:00:00.000Z", {
				carrier: "self",
			}),
			shipment("s-6", "delivered", "2026-09-04T10:00:00.000Z", {
				fulfillingShop: "other",
			}),
		],
	});
}

const NOW = new Date("2026-09-15T12:00:00.000Z");

describe("courierStats", () => {
	it("counts this month's courier runs, handovers and the average cost", async () => {
		const stats = await courierStats(
			seed(),
			{ id: "u-owner", role: "user" },
			shop.id,
			NOW,
		);
		expect(stats).toMatchObject({
			runs: 3,
			finished: 2,
			delivered: 1,
			averageCourierCost: 2667,
		});
	});

	it("refuses a stranger", async () => {
		await expect(
			courierStats(seed(), { id: "u-x", role: "user" }, shop.id, NOW),
		).rejects.toBeTruthy();
	});
});
