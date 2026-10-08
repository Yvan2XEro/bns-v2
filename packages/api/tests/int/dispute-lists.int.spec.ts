import { describe, expect, it } from "vitest";
import { listDisputes } from "../../src/services/disputes";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-10-04T12:00:00.000Z");

function world() {
	const statuses = [
		"awaiting_buyer",
		"awaiting_seller",
		"under_review",
	] as const;
	return fakePayload({
		users: [
			{ id: "buyer-1", role: "user" },
			{ id: "seller-1", role: "user" },
		],
		shops: [
			{
				id: "shop-1",
				handle: "shop",
				name: "Shop",
				owner: "seller-1",
				status: "active",
			},
		],
		"shop-members": [
			{
				id: "member-1",
				shop: "shop-1",
				user: "seller-1",
				role: "owner",
				status: "active",
			},
		],
		orders: statuses.map((_, index) => ({
			id: `order-${index + 1}`,
			orderNumber: `BNS-${index + 1}`,
			buyer: "buyer-1",
			shop: "shop-1",
			status: "disputed",
			paymentMethod: "cod",
			paymentStatus: "cod_collected",
		})),
		disputes: statuses.map((status, index) => ({
			id: `dispute-${index + 1}`,
			number: `DSP-${index + 1}`,
			order: `order-${index + 1}`,
			shop: "shop-1",
			buyer: "buyer-1",
			subject: "goods",
			reason: "damaged",
			status,
			paymentMethod: "cod",
			amountAtStake: 2_500,
			createdAt: new Date(NOW.getTime() - index * 1000).toISOString(),
			deadlines: {
				respondBy:
					index < 2
						? new Date(NOW.getTime() - 60_000).toISOString()
						: new Date(NOW.getTime() + 60_000).toISOString(),
			},
		})),
	});
}

describe("listDisputes", () => {
	it("projects buyer rows and keeps awaitingCount independent of status filters", async () => {
		const result = await listDisputes(
			world(),
			{ id: "buyer-1", role: "user" },
			{ status: "awaiting_buyer" },
			NOW,
		);

		expect(result).toMatchObject({
			awaitingCount: 2,
			rows: [
				{
					id: "dispute-1",
					number: "DSP-1",
					orderNumber: "BNS-1",
					status: "awaiting_buyer",
					overdue: true,
				},
			],
		});
	});

	it("returns seller-side actionable rows only to shop members and filters overdue", async () => {
		const payload = world();
		const result = await listDisputes(
			payload,
			{ id: "seller-1", role: "user" },
			{ shopId: "shop-1", overdue: true },
			NOW,
		);

		expect(result.rows.map(({ id, status }) => [id, status])).toEqual([
			["dispute-1", "awaiting_buyer"],
			["dispute-2", "awaiting_seller"],
		]);
		expect(result.awaitingCount).toBe(2);
		await expect(
			listDisputes(
				payload,
				{ id: "stranger", role: "user" },
				{ shopId: "shop-1" },
				NOW,
			),
		).rejects.toMatchObject({ code: "shop.notMember", status: 403 });
	});
});
