// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { triggerNotificationEvent } = vi.hoisted(() => ({
	triggerNotificationEvent: vi.fn<
		typeof import("../../src/hooks/notificationEvents").triggerNotificationEvent
	>(async () => undefined),
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

import { notifyResaleLinkRequested } from "../../src/services/resaleNotifications";
import { fakePayload } from "./helpers/fakePayload";

beforeEach(() => triggerNotificationEvent.mockClear());

describe("resale link notifications", () => {
	it("notifies only active supplier members with resale.manage", async () => {
		const payload = fakePayload({
			users: [
				{ id: "owner" },
				{ id: "manager" },
				{ id: "staff" },
				{ id: "suspended", suspendedAt: "2026-10-01T00:00:00.000Z" },
			],
			shops: [
				{ id: "supplier", name: "Supplier Shop", status: "active", level: 3 },
				{ id: "reseller", name: "Reseller Shop", status: "active", level: 2 },
			],
			"shop-members": [
				{
					id: "owner-member",
					shop: "supplier",
					user: "owner",
					role: "owner",
					status: "active",
				},
				{
					id: "manager-member",
					shop: "supplier",
					user: "manager",
					role: "manager",
					status: "active",
				},
				{
					id: "staff-member",
					shop: "supplier",
					user: "staff",
					role: "staff",
					status: "active",
				},
				{
					id: "suspended-member",
					shop: "supplier",
					user: "suspended",
					role: "manager",
					status: "active",
				},
			],
		});

		await notifyResaleLinkRequested(payload, {
			id: "link-1",
			supplierShop: "supplier",
			resellerShop: "reseller",
			status: "requested",
			message: "Please approve",
			createdAt: "2026-10-04T00:00:00.000Z",
			updatedAt: "2026-10-04T00:00:00.000Z",
		});

		expect(
			triggerNotificationEvent.mock.calls
				.map(([call]) => call.subscriberId)
				.sort(),
		).toEqual(["manager", "owner"]);
		expect(triggerNotificationEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "resale-link-requested",
				subscriberId: "owner",
				payload: {
					linkId: "link-1",
					shopId: "supplier",
					otherShopName: "Reseller Shop",
					message: "Please approve",
				},
			}),
		);
	});
});
