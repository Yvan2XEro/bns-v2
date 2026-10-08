// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import {
	decideResaleLink,
	listResaleLinks,
	requestResaleLink,
} from "../../src/services/resaleLinks";
import { fakePayload } from "./helpers/fakePayload";

function payloadWithSharedMember() {
	return fakePayload(
		{
			shops: [
				{ id: "supplier", owner: "supplier-owner", status: "active", level: 3 },
				{ id: "reseller", owner: "reseller-owner", status: "active", level: 2 },
			],
			"shop-members": [
				{
					id: "supplier-shared-member",
					shop: "supplier",
					user: "shared-user",
					role: "staff",
					status: "active",
				},
				{
					id: "reseller-shared-member",
					shop: "reseller",
					user: "shared-user",
					role: "staff",
					status: "active",
				},
				{
					id: "requesting-owner",
					shop: "reseller",
					user: "reseller-owner",
					role: "owner",
					status: "active",
				},
			],
			"resale-terms": [
				{
					id: "terms-current",
					role: "reseller",
					version: "2026-10-01",
					publishedAt: "2026-10-01T00:00:00.000Z",
				},
			],
			"resale-terms-acceptances": [
				{
					id: "accepted",
					shop: "reseller",
					role: "reseller",
					version: "2026-10-01",
				},
			],
		},
		{
			globals: { "app-settings": { resale: { enabled: true } } },
		},
	);
}

describe("requestResaleLink", () => {
	it("refuses a supplier and reseller that share an active member", async () => {
		const payload = payloadWithSharedMember();

		await expect(
			requestResaleLink(payload, { id: "reseller-owner" }, "reseller", {
				supplierShop: "supplier",
				message: "Please approve",
				acceptTermsVersion: "v1",
			}),
		).rejects.toMatchObject({
			code: ERROR_CODES.resaleOwnProduct,
			status: 409,
		});
		expect(payload.store["resale-links"] ?? []).toHaveLength(0);
	});
});

describe("decideResaleLink", () => {
	it("requires moderator approval when a requested link has a risk hold", async () => {
		const payload = fakePayload({
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
					id: "held-link",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status: "requested",
					riskHold: true,
				},
			],
		});

		await expect(
			decideResaleLink(payload, { id: "supplier-owner" }, "held-link", {
				action: "approve",
			}),
		).rejects.toMatchObject({ status: 409 });
		expect(payload.store["resale-links"]?.[0]?.status).toBe("requested");
	});

	it("records a supplier approval of a requested link", async () => {
		const payload = fakePayload({
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
					status: "requested",
					riskHold: false,
				},
			],
		});

		const link = await decideResaleLink(
			payload,
			{ id: "supplier-owner" },
			"link-1",
			{ action: "approve" },
			{ now: new Date("2026-10-04T12:00:00.000Z") },
		);

		expect(link.status).toBe("approved");
		expect(link.decidedBy).toBe("supplier-owner");
		expect(link.decidedAt).toBe("2026-10-04T12:00:00.000Z");
	});

	it("suspends only listings tied to the decided supplier", async () => {
		const payload = fakePayload({
			shops: [
				{ id: "supplier", owner: "supplier-owner", status: "active", level: 3 },
				{
					id: "other-supplier",
					owner: "other-owner",
					status: "active",
					level: 3,
				},
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
				},
			],
			listings: [
				{
					id: "supplier-listing",
					shop: "reseller",
					status: "published",
					resale: {
						supplierShop: "supplier",
						link: "link-1",
						desiredStatus: "published",
						holds: [],
					},
				},
				{
					id: "other-supplier-listing",
					shop: "reseller",
					status: "published",
					resale: {
						supplierShop: "other-supplier",
						link: "other-link",
						desiredStatus: "published",
						holds: [],
					},
				},
			],
		});

		await decideResaleLink(
			payload,
			{ id: "supplier-owner" },
			"link-1",
			{ action: "suspend", reason: "quality" },
			{ now: new Date("2026-10-04T12:00:00.000Z") },
		);

		expect(payload.store.listings).toMatchObject([
			{
				id: "supplier-listing",
				status: "draft",
				resale: { holds: ["link_inactive"] },
			},
			{
				id: "other-supplier-listing",
				status: "published",
				resale: { holds: [] },
			},
		]);
	});
});

describe("listResaleLinks", () => {
	it("scopes results to the requested shop side", async () => {
		const payload = fakePayload({
			shops: [
				{
					id: "supplier",
					name: "Supplier Store",
					owner: "supplier-owner",
					status: "active",
					level: 3,
				},
				{
					id: "reseller",
					name: "Reseller Store",
					owner: "reseller-owner",
					status: "active",
					level: 2,
				},
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
					id: "supplier-link",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status: "requested",
					createdAt: "2026-10-04T12:00:00.000Z",
					updatedAt: "2026-10-04T12:00:00.000Z",
				},
				{
					id: "unrelated-link",
					supplierShop: "other-supplier",
					resellerShop: "other-reseller",
					status: "requested",
				},
			],
		});

		const links = await listResaleLinks(
			payload,
			{ id: "supplier-owner" },
			"supplier",
			{ side: "supplier", status: "requested" },
		);

		expect(links.docs).toEqual([
			{
				id: "supplier-link",
				status: "requested",
				partnerShop: { id: "reseller", name: "Reseller Store", handle: null },
				message: null,
				requestedAt: expect.any(String),
				updatedAt: expect.any(String),
				stats: {
					publishedListings: 0,
					deliveredOrders30d: 0,
					cancelledPurchaseOrders30d: 0,
					refusedDeliveries30d: 0,
				},
			},
		]);
	});
});
