// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import {
	acceptResaleTerms,
	getCurrentResaleTerms,
	hasAcceptedCurrentResaleTerms,
} from "../../src/services/resale";
import { fakePayload } from "./helpers/fakePayload";

describe("current resale terms", () => {
	it("returns the latest published version for the requested role only", async () => {
		const payload = fakePayload({
			"resale-terms": [
				{
					id: "supplier-old",
					role: "supplier",
					version: "2026-01-01",
					publishedAt: "2026-01-01T00:00:00.000Z",
				},
				{
					id: "reseller-current",
					role: "reseller",
					version: "2026-03-01",
					publishedAt: "2026-03-01T00:00:00.000Z",
				},
				{
					id: "reseller-draft",
					role: "reseller",
					version: "2026-04-01",
					publishedAt: null,
				},
				{
					id: "reseller-future",
					role: "reseller",
					version: "2099-01-01",
					publishedAt: "2099-01-01T00:00:00.000Z",
				},
			],
		});

		const terms = await getCurrentResaleTerms(payload, "reseller");

		expect(terms).toMatchObject({
			id: "reseller-current",
			role: "reseller",
			version: "2026-03-01",
		});
	});

	it("returns null when no version has been published", async () => {
		const payload = fakePayload({
			"resale-terms": [
				{
					id: "draft",
					role: "supplier",
					version: "2026-04-01",
					publishedAt: null,
				},
			],
		});

		expect(await getCurrentResaleTerms(payload, "supplier")).toBeNull();
	});

	it("requires acceptance of the latest published role-specific version", async () => {
		const payload = fakePayload({
			"resale-terms": [
				{
					id: "old",
					role: "reseller",
					version: "2026-03-01",
					publishedAt: "2026-03-01T00:00:00.000Z",
				},
				{
					id: "current",
					role: "reseller",
					version: "2026-04-01",
					publishedAt: "2026-04-01T00:00:00.000Z",
				},
			],
			"resale-terms-acceptances": [
				{
					id: "acceptance",
					shop: "shop-1",
					role: "reseller",
					version: "2026-03-01",
				},
			],
		});

		expect(
			await hasAcceptedCurrentResaleTerms(payload, "shop-1", "reseller"),
		).toBe(false);
	});

	it("accepts an exact current-version acceptance", async () => {
		const payload = fakePayload({
			"resale-terms": [
				{
					id: "current",
					role: "supplier",
					version: "2026-04-01",
					publishedAt: "2026-04-01T00:00:00.000Z",
				},
			],
			"resale-terms-acceptances": [
				{
					id: "acceptance",
					shop: "shop-1",
					role: "supplier",
					version: "2026-04-01",
				},
			],
		});

		expect(
			await hasAcceptedCurrentResaleTerms(payload, "shop-1", "supplier"),
		).toBe(true);
	});

	it("records the published version once and is idempotent", async () => {
		const payload = fakePayload(
			{
				shops: [{ id: "shop-1", status: "active", level: 2 }],
				"shop-members": [
					{
						id: "member-1",
						shop: "shop-1",
						user: "owner-1",
						role: "owner",
						status: "active",
					},
				],
				"resale-terms": [
					{
						id: "terms-1",
						role: "reseller",
						version: "2026-04-01",
						publishedAt: "2026-04-01T00:00:00.000Z",
					},
				],
			},
			{
				uniques: {
					"resale-terms-acceptances": [["shop", "role", "version"]],
				},
			},
		);
		const input = {
			role: "reseller" as const,
			version: "2026-04-01",
			locale: "fr" as const,
			client: "web" as const,
		};

		const first = await acceptResaleTerms(
			payload,
			{ id: "owner-1" },
			"shop-1",
			input,
		);
		const second = await acceptResaleTerms(
			payload,
			{ id: "owner-1" },
			"shop-1",
			input,
		);

		expect(first.id).toBe(second.id);
		expect(payload.store["resale-terms-acceptances"]).toHaveLength(1);
		expect(payload.store["resale-terms-acceptances"]?.[0]).toMatchObject({
			shop: "shop-1",
			role: "reseller",
			version: "2026-04-01",
			terms: "terms-1",
			acceptedBy: "owner-1",
			locale: "fr",
			client: "web",
		});
	});

	it("rejects stale versions instead of recording acceptance for them", async () => {
		const payload = fakePayload({
			shops: [{ id: "shop-1", status: "active", level: 2 }],
			"shop-members": [
				{
					id: "member-1",
					shop: "shop-1",
					user: "owner-1",
					role: "owner",
					status: "active",
				},
			],
			"resale-terms": [
				{
					id: "terms-1",
					role: "reseller",
					version: "2026-04-01",
					publishedAt: "2026-04-01T00:00:00.000Z",
				},
			],
		});

		await expect(
			acceptResaleTerms(payload, { id: "owner-1" }, "shop-1", {
				role: "reseller",
				version: "2026-03-01",
				locale: "fr",
				client: "web",
			}),
		).rejects.toMatchObject({ code: ERROR_CODES.resaleTermsNotAccepted });
		expect(payload.store["resale-terms-acceptances"] ?? []).toHaveLength(0);
	});

	it("refuses reseller terms acceptance below level two", async () => {
		const payload = fakePayload({
			shops: [{ id: "shop-1", status: "active", level: 1 }],
			"shop-members": [
				{
					id: "member-1",
					shop: "shop-1",
					user: "owner-1",
					role: "owner",
					status: "active",
				},
			],
			"resale-terms": [
				{
					id: "terms-1",
					role: "reseller",
					version: "2026-04-01",
					publishedAt: "2026-04-01T00:00:00.000Z",
				},
			],
		});

		await expect(
			acceptResaleTerms(payload, { id: "owner-1" }, "shop-1", {
				role: "reseller",
				version: "2026-04-01",
				locale: "fr",
				client: "web",
			}),
		).rejects.toMatchObject({ code: ERROR_CODES.resaleResellerNotEligible });
		expect(payload.store["resale-terms-acceptances"] ?? []).toHaveLength(0);
	});

	it("clears only the terms hold and republishes when the supplier listing is live", async () => {
		const payload = fakePayload(
			{
				shops: [{ id: "reseller", status: "active", level: 2 }],
				"shop-members": [
					{
						id: "member-1",
						shop: "reseller",
						user: "owner-1",
						role: "owner",
						status: "active",
					},
				],
				"resale-terms": [
					{
						id: "terms-1",
						role: "reseller",
						version: "2026-04-01",
						publishedAt: "2026-04-01T00:00:00.000Z",
					},
				],
				products: [{ id: "product-1", shop: "supplier" }],
				listings: [
					{
						id: "supplier-listing",
						shop: "supplier",
						product: "product-1",
						status: "published",
					},
					{
						id: "held-listing",
						shop: "reseller",
						product: "product-1",
						status: "draft",
						resale: {
							supplierShop: "supplier",
							desiredStatus: "published",
							holds: ["terms_not_accepted"],
						},
					},
					{
						id: "still-held-listing",
						shop: "reseller",
						product: "product-1",
						status: "draft",
						resale: {
							supplierShop: "supplier",
							desiredStatus: "published",
							holds: ["terms_not_accepted", "price_below_minimum"],
						},
					},
				],
			},
			{
				uniques: {
					"resale-terms-acceptances": [["shop", "role", "version"]],
				},
			},
		);

		await acceptResaleTerms(payload, { id: "owner-1" }, "reseller", {
			role: "reseller",
			version: "2026-04-01",
			locale: "fr",
			client: "web",
		});

		const listings = payload.store.listings ?? [];
		const relisted = listings.find((listing) => listing.id === "held-listing");
		const stillHeld = listings.find(
			(listing) => listing.id === "still-held-listing",
		);
		expect(
			listings.find((listing) => listing.id === "supplier-listing")?.status,
		).toBe("published");
		expect(relisted?.status).toBe("published");
		expect(relisted?.resale).toMatchObject({
			holds: [],
			desiredStatus: "published",
		});
		expect(stillHeld?.status).toBe("draft");
		expect(stillHeld?.resale).toMatchObject({
			holds: ["price_below_minimum"],
		});
	});
});
