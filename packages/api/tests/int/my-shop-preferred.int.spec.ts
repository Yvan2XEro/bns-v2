// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getMyShop } from "../../src/services/shops";
import { fakePayload } from "./helpers/fakePayload";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const U1 = { id: "u-1" };

function seed() {
	return fakePayload({
		users: [{ id: "u-1", name: "Aïcha" }],
		shops: [
			{
				id: "s-1",
				handle: "first",
				name: "First",
				owner: "u-1",
				status: "active",
				level: 2,
			},
			{
				id: "s-2",
				handle: "second",
				name: "Second",
				owner: "u-9",
				status: "active",
				level: 2,
			},
			{
				id: "s-3",
				handle: "stranger",
				name: "Stranger",
				owner: "u-9",
				status: "active",
				level: 2,
			},
		],
		"shop-members": [
			{ id: "m-1", shop: "s-1", user: "u-1", role: "owner", status: "active" },
			{
				id: "m-2",
				shop: "s-2",
				user: "u-1",
				role: "manager",
				status: "active",
			},
			{ id: "m-3", shop: "s-3", user: "u-9", role: "owner", status: "active" },
		],
	});
}

describe("getMyShop preferred shop (W22)", () => {
	it("defaults to the first membership", async () => {
		expect((await getMyShop(seed(), U1, NOW)).shop?.handle).toBe("first");
	});

	it("returns the preferred shop when the caller belongs to it", async () => {
		const result = await getMyShop(seed(), U1, NOW, "s-2");
		expect(result.shop?.handle).toBe("second");
		expect(result.role).toBe("manager");
	});

	it("ignores a preferred shop the caller is not a member of", async () => {
		expect((await getMyShop(seed(), U1, NOW, "s-3")).shop?.handle).toBe(
			"first",
		);
	});

	it("falls back when the preferred shop is closed", async () => {
		const payload = seed();
		payload.store.shops[1].status = "closed";
		expect((await getMyShop(payload, U1, NOW, "s-2")).shop?.handle).toBe(
			"first",
		);
	});
});
