// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	suspendResaleLink,
	unsuspendResaleLink,
} from "../../src/services/moderation";
import { fakePayload } from "./helpers/fakePayload";

function seededLink() {
	return fakePayload({
		users: [
			{ id: "admin", role: "admin" },
			{ id: "moderator", role: "moderator" },
			{ id: "supplier-owner", role: "user" },
		],
		shops: [
			{ id: "supplier", owner: "supplier-owner", status: "active", level: 3 },
			{ id: "reseller", owner: "reseller-owner", status: "active", level: 2 },
		],
		"shop-members": [
			{
				id: "supplier-owner-member",
				shop: "supplier",
				user: "supplier-owner",
				role: "owner",
				status: "active",
			},
		],
		"resale-links": [
			{
				id: "link-1",
				supplierShop: "supplier",
				resellerShop: "reseller",
				status: "approved",
				suspendedBy: null,
			},
		],
		listings: [
			{
				id: "supplier-listing",
				shop: "supplier",
				product: "product-1",
				status: "published",
			},
			{
				id: "resale-listing",
				shop: "reseller",
				product: "product-1",
				status: "published",
				resale: {
					supplierShop: "supplier",
					link: "link-1",
					desiredStatus: "published",
					holds: [],
				},
			},
		],
		"purchase-orders": [{ id: "po-1", link: "link-1", status: "delivered" }],
		"reseller-commissions": [
			{
				id: "commission-payable",
				purchaseOrder: "po-1",
				resellerShop: "reseller",
				status: "payable",
				holdReasons: [],
			},
			{
				id: "commission-paid",
				purchaseOrder: "po-1",
				resellerShop: "reseller",
				status: "paid",
				holdReasons: [],
			},
		],
		"moderation-log": [],
	});
}

describe("resale link moderation", () => {
	it("suspends the link, holds eligible commissions, and logs affected ids", async () => {
		const payload = seededLink();

		await suspendResaleLink(payload, { id: "admin", role: "admin" }, "link-1", {
			reason: "fraud_review",
			note: "Review related reports",
		});

		expect(payload.store["resale-links"]?.[0]?.status).toBe("suspended");
		expect(payload.store.listings?.[1]).toMatchObject({
			status: "draft",
			resale: { holds: ["link_inactive"] },
		});
		expect(payload.store["reseller-commissions"]?.[0]).toMatchObject({
			status: "held",
			holdReasons: ["moderation"],
		});
		expect(payload.store["reseller-commissions"]?.[1]?.status).toBe("paid");
		expect(payload.store["moderation-log"]?.[0]).toMatchObject({
			action: "resale_link.suspend",
			targetType: "resale-link",
			targetId: "link-1",
			metadata: {
				listingIds: ["resale-listing"],
				commissions: [{ id: "commission-payable", previousStatus: "payable" }],
			},
		});
	});

	it("restores the link and commission state from the last suspension log", async () => {
		const payload = seededLink();
		await suspendResaleLink(payload, { id: "admin", role: "admin" }, "link-1", {
			reason: "fraud_review",
		});

		await unsuspendResaleLink(
			payload,
			{ id: "admin", role: "admin" },
			"link-1",
			{
				note: "Review complete",
				releaseCommissions: true,
			},
		);

		expect(payload.store["resale-links"]?.[0]?.status).toBe("approved");
		expect(payload.store.listings?.[1]).toMatchObject({
			status: "published",
			resale: { holds: [] },
		});
		expect(payload.store["reseller-commissions"]?.[0]).toMatchObject({
			status: "payable",
			holdReasons: [],
		});
		expect(payload.store["moderation-log"]?.[1]).toMatchObject({
			action: "resale_link.unsuspend",
			metadata: { suspensionLogId: expect.any(String) },
		});
	});

	it("denies a moderator who belongs to either shop before changing the link", async () => {
		const payload = seededLink();
		payload.store.users?.push({ id: "shop-moderator", role: "moderator" });
		payload.store["shop-members"]?.push({
			id: "moderator-membership",
			shop: "reseller",
			user: "shop-moderator",
			role: "staff",
			status: "active",
		});

		await expect(
			suspendResaleLink(
				payload,
				{ id: "shop-moderator", role: "moderator" },
				"link-1",
				{ reason: "fraud_review" },
			),
		).rejects.toMatchObject({ status: 403 });
		expect(payload.store["resale-links"]?.[0]?.status).toBe("approved");
		expect(payload.store["moderation-log"]).toHaveLength(0);
	});

	it("refuses a moderator who cannot outrank the supplier owner", async () => {
		const payload = seededLink();
		payload.store.users?.push({ id: "supplier-admin", role: "admin" });
		const supplier = payload.store.shops?.[0];
		if (supplier) supplier.owner = "supplier-admin";

		await expect(
			suspendResaleLink(
				payload,
				{ id: "moderator", role: "moderator" },
				"link-1",
				{ reason: "fraud_review" },
			),
		).rejects.toMatchObject({ status: 403 });
		expect(payload.store["resale-links"]?.[0]?.status).toBe("approved");
	});
});
