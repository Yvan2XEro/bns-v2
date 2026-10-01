import { describe, expect, it } from "vitest";
import { Listings } from "../../src/collections/Listings";
import { fakePayload } from "./helpers/fakePayload";

type Hook = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
const beforeChange = (Listings.hooks?.beforeChange as Hook[])[0];

function seed() {
	return fakePayload({
		users: [
			{ id: "u-owner", role: "user", name: "Aicha" },
			{ id: "u-staff", role: "user", name: "Bruno" },
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
				inboxNotifications: "all",
			},
			{
				id: "m-staff",
				shop: "s-1",
				user: "u-staff",
				role: "staff",
				status: "active",
				inboxNotifications: "assigned",
			},
		],
		categories: [{ id: "cat-1", name: "Mode", slug: "mode" }],
		"shop-activity-log": [],
		listings: [],
	});
}

const req = (payload: ReturnType<typeof seed>, userId: string) =>
	({
		payload,
		context: { productService: true },
		user: { id: userId, role: "user" },
	}) as never;

describe("a shop listing's seller", () => {
	it("is the shop owner, not the member who published it", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: req(payload, "u-staff"),
			operation: "create",
			data: {
				shop: "s-1",
				title: "Sac",
				status: "published",
				category: "cat-1",
				price: 5000,
			},
		});
		expect(data.seller).toBe("u-owner");
	});

	it("records the acting member in the activity log", async () => {
		const payload = seed();
		await beforeChange({
			req: req(payload, "u-staff"),
			operation: "create",
			data: {
				shop: "s-1",
				title: "Sac",
				status: "published",
				category: "cat-1",
				price: 5000,
			},
		});
		expect(payload.store["shop-activity-log"]).toMatchObject([
			{
				shop: "s-1",
				actor: "u-staff",
				actorRole: "staff",
				action: "product.published",
				targetType: "listing",
			},
		]);
	});

	it("keeps the current user as seller for a personal listing", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: {
				payload,
				context: {},
				user: { id: "u-staff", role: "user" },
			} as never,
			operation: "create",
			data: {
				title: "Velo",
				status: "published",
				category: "cat-1",
				price: 5000,
			},
		});
		expect(data.seller).toBe("u-staff");
	});

	it("does not rewrite the seller on an update", async () => {
		const payload = seed();
		const data = await beforeChange({
			req: req(payload, "u-staff"),
			operation: "update",
			originalDoc: {
				id: "l-1",
				shop: "s-1",
				seller: "u-owner",
				status: "published",
			},
			data: { title: "Sac en cuir" },
		});
		expect(data.seller).toBeUndefined();
	});
});
