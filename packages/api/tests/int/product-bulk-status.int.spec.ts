// @vitest-environment node
import { describe, expect, it } from "vitest";
import { setProductsStatus } from "../../src/services/productBulk";
import { fakePayload } from "./helpers/fakePayload";

const OWNER = { id: "u-1" };
const STAFF = { id: "u-3" };

function seed() {
	return fakePayload({
		users: [
			{ id: "u-1", name: "Owner" },
			{ id: "u-3", name: "Staff" },
		],
		shops: [
			{ id: "s-1", status: "active", owner: "u-1", level: 2 },
			{ id: "s-2", status: "active", owner: "u-2", level: 2 },
		],
		"shop-members": [
			{ id: "m-1", shop: "s-1", user: "u-1", role: "owner", status: "active" },
			{ id: "m-3", shop: "s-1", user: "u-3", role: "staff", status: "active" },
		],
		products: [
			{ id: "p-1", shop: "s-1", title: "One", status: "active", listing: null },
			{ id: "p-2", shop: "s-1", title: "Two", status: "draft", listing: null },
			{
				id: "p-9",
				shop: "s-2",
				title: "Theirs",
				status: "draft",
				listing: null,
			},
		],
		"product-variants": [],
		listings: [],
	});
}

describe("setProductsStatus", () => {
	it("moves every product to the status and skips those already there", async () => {
		const payload = seed();
		const result = await setProductsStatus(payload, OWNER, "s-1", {
			productIds: ["p-1", "p-2"],
			status: "draft",
		});
		expect(result.updated).toEqual(["p-1"]);
		expect(payload.store.products.map((p) => p.status)).toEqual([
			"draft",
			"draft",
			"draft",
		]);
	});

	it("refuses the whole batch when one product is another shop's", async () => {
		const payload = seed();
		await expect(
			setProductsStatus(payload, OWNER, "s-1", {
				productIds: ["p-1", "p-9"],
				status: "draft",
			}),
		).rejects.toMatchObject({ status: 404 });
		expect(payload.store.products[0].status).toBe("active");
	});

	it("keeps archiving to the roles allowed to archive", async () => {
		await expect(
			setProductsStatus(seed(), STAFF, "s-1", {
				productIds: ["p-1"],
				status: "archived",
			}),
		).rejects.toMatchObject({ code: "shop.forbidden" });
	});

	it("refuses an empty batch", async () => {
		await expect(
			setProductsStatus(seed(), OWNER, "s-1", {
				productIds: [],
				status: "draft",
			}),
		).rejects.toMatchObject({ status: 400 });
	});
});
