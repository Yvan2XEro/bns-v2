// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { triggerNotificationEvent } = vi.hoisted(() => ({
	triggerNotificationEvent: vi.fn(async () => undefined),
}));
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent,
}));
vi.mock("../../src/services/notificationProvider", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/services/notificationProvider")
	>()),
	isNotificationProviderConfigured: () => true,
}));

import { suspendShop } from "../../src/services/moderation";
import { createShop } from "../../src/services/shops";
import { recordMovement } from "../../src/services/stock";
import { fakePayload } from "./helpers/fakePayload";

beforeEach(() => triggerNotificationEvent.mockClear());

const seed = () =>
	fakePayload(
		{
			users: [
				{
					id: "u-1",
					name: "Aïcha",
					role: "user",
					phoneVerifiedAt: "2026-09-01T00:00:00.000Z",
				},
				{ id: "u-2", name: "Manager", role: "user" },
				{ id: "u-3", name: "Staff", role: "user" },
				{ id: "u-9", name: "Owner", role: "user" },
			],
			shops: [
				{
					id: "s-1",
					handle: "akwatech",
					name: "Akwa",
					owner: "u-9",
					status: "active",
				},
			],
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-1",
					role: "owner",
					status: "active",
				},
				{
					id: "m-2",
					shop: "s-1",
					user: "u-2",
					role: "manager",
					status: "active",
				},
				{
					id: "m-3",
					shop: "s-1",
					user: "u-3",
					role: "staff",
					status: "active",
				},
			],
			products: [
				{ id: "p-1", shop: "s-1", title: "AirPods Pro", status: "draft" },
			],
			"product-variants": [
				{
					id: "v-1",
					product: "p-1",
					shop: "s-1",
					optionValues: {},
					price: 1,
					trackInventory: true,
					stockOnHand: 2,
					stockReserved: 0,
					lowStockThreshold: 1,
				},
			],
			"moderation-log": [],
		},
		{
			globals: { "app-settings": { shops: { enabled: true, maxPerUser: 1 } } },
		},
	);

describe("shop notifications", () => {
	it("welcomes the owner after the shop is committed", async () => {
		await createShop(
			seed(),
			{ id: "u-1" },
			{ handle: "nouvelle", name: "Nouvelle" },
		);
		expect(triggerNotificationEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "shop-created",
				subscriberId: "u-1",
				payload: expect.objectContaining({
					handle: "nouvelle",
					shopUrl: "https://buynsellem.com/s/nouvelle",
				}),
			}),
		);
	});

	it("sends nothing when creation rolls back", async () => {
		const payload = seed();
		payload.failWhen = (method, args) =>
			method === "create" && args.collection === "shop-members";
		await expect(
			createShop(
				payload,
				{ id: "u-1" },
				{ handle: "nouvelle", name: "Nouvelle" },
			),
		).rejects.toThrow();
		expect(triggerNotificationEvent).not.toHaveBeenCalled();
	});

	it("tells owners and managers, not staff, when stock crosses the threshold", async () => {
		await recordMovement(seed(), { id: "u-1" }, "v-1", {
			type: "loss",
			quantity: -1,
		});
		const recipients = triggerNotificationEvent.mock.calls
			.map(([args]) => (args as { subscriberId: string }).subscriberId)
			.sort();
		expect(recipients).toEqual(["u-1", "u-2"]);
		expect(triggerNotificationEvent.mock.calls[0][0]).toMatchObject({
			event: "stock-low",
			payload: { productId: "p-1", productTitle: "AirPods Pro", available: 1 },
		});
	});

	it("tells the owner about a suspension", async () => {
		await suspendShop(seed(), { id: "mod-1", role: "moderator" }, "s-1", {
			reason: "fraud",
			durationDays: 7,
		});
		expect(triggerNotificationEvent).toHaveBeenCalledWith(
			expect.objectContaining({ event: "shop-suspended", subscriberId: "u-9" }),
		);
	});
});
