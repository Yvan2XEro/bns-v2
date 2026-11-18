import { describe, expect, it } from "vitest";
import { updateProduct } from "../../src/services/products";
import { detachListings } from "../../src/services/shopListings";
import { stockSummary } from "../../src/services/stock";
import { fakePayload } from "./helpers/fakePayload";

function seed(role: "owner" | "manager" | "staff") {
	return fakePayload({
		users: [
			{ id: "u-owner", role: "user", name: "Aicha" },
			{ id: "u-actor", role: "user", name: "Bruno" },
		],
		shops: [
			{
				id: "s-1",
				handle: "akwa",
				name: "Akwa",
				owner: "u-owner",
				status: "active",
				level: 2,
				levelExpiresAt: null,
			},
		],
		"shop-members": [
			{
				id: "m-owner",
				shop: "s-1",
				user: "u-owner",
				role: "owner",
				status: "active",
			},
			...(role === "owner"
				? []
				: [
						{ id: "m-1", shop: "s-1", user: "u-actor", role, status: "active" },
					]),
		],
		categories: [{ id: "cat-1", name: "Sacs" }],
		products: [
			{
				id: "p-1",
				shop: "s-1",
				title: "Sac",
				status: "active",
				listing: null,
				category: "cat-1",
			},
		],
		"product-variants": [
			{
				id: "v-1",
				shop: "s-1",
				product: "p-1",
				price: 15000,
				cost: 9000,
				stockOnHand: 4,
				stockReserved: 0,
				archivedAt: null,
			},
		],
		listings: [
			{
				id: "l-1",
				shop: "s-1",
				seller: "u-owner",
				product: "p-1",
				status: "published",
				title: "Sac",
			},
		],
		"shop-activity-log": [],
	});
}

const actor = (id: string) => ({
	id,
	role: "user",
	name: null,
	suspendedAt: null,
	suspendedUntil: null,
});

const archiveInput = {
	title: "Sac",
	category: "cat-1",
	status: "archived",
	variants: [{ id: "v-1", price: 15000, cost: 9000 }],
};

describe("catalogue.archive", () => {
	it("lets a manager archive a product", async () => {
		const payload = seed("manager");
		await updateProduct(payload, actor("u-actor"), "p-1", archiveInput);
		expect(payload.store.products[0].status).toBe("archived");
	});

	it("refuses a staff member with shop.forbidden and leaves the product active", async () => {
		const payload = seed("staff");
		await expect(
			updateProduct(payload, actor("u-actor"), "p-1", archiveInput),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
		expect(payload.store.products[0].status).toBe("active");
	});

	it("still lets a staff member edit a product without archiving it", async () => {
		const payload = seed("staff");
		await updateProduct(payload, actor("u-actor"), "p-1", {
			title: "Sac en cuir",
			category: "cat-1",
			status: "active",
			variants: [{ id: "v-1", price: 16000 }],
		});
		expect(payload.store.products[0].title).toBe("Sac en cuir");
	});

	it("refuses a staff member detaching a listing", async () => {
		const payload = seed("staff");
		await expect(
			detachListings(payload, actor("u-actor"), "s-1", { listingIds: ["l-1"] }),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
	});
});

describe("costs.view", () => {
	it("refuses the stock summary to a staff member", async () => {
		const payload = seed("staff");
		await expect(
			stockSummary(payload, actor("u-actor"), "s-1"),
		).rejects.toMatchObject({ code: "shop.forbidden", status: 403 });
	});

	it("answers the stock summary for a manager", async () => {
		const payload = seed("manager");
		const summary = await stockSummary(
			payload,
			actor("u-manager-missing"),
			"s-1",
		).catch(() => null);
		expect(summary).toBeNull();
		await expect(
			stockSummary(payload, actor("u-actor"), "s-1"),
		).resolves.toBeTruthy();
	});
});
