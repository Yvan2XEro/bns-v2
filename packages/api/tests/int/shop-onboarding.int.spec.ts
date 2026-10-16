// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getShopOnboarding } from "../../src/services/shopOnboarding";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("@payload-config", () => ({ default: {} }));

const OWNER = "u-owner";
const STAFF = "u-staff";
const OUTSIDER = "u-outsider";
const NOW = new Date("2026-10-16T10:00:00.000Z");

function seed(extra: Record<string, unknown[]> = {}, level = 1) {
	return fakePayload({
		users: [
			{ id: OWNER, role: "user" },
			{ id: STAFF, role: "user" },
			{ id: OUTSIDER, role: "user" },
		],
		shops: [
			{
				id: "s-1",
				status: "active",
				owner: OWNER,
				level,
				logo: "m-1",
				description: "  ",
				contact: { whatsapp: "" },
			},
		],
		"shop-members": [
			{ id: "m-o", shop: "s-1", user: OWNER, role: "owner", status: "active" },
			{ id: "m-s", shop: "s-1", user: STAFF, role: "staff", status: "active" },
		],
		products: [
			{ id: "p-1", shop: "s-1", status: "active", listing: "l-1" },
			{ id: "p-2", shop: "s-1", status: "draft" },
		],
		listings: [
			{ id: "l-1", shop: "s-1", seller: OWNER, status: "published" },
			{ id: "l-own", seller: OWNER, status: "published" },
		],
		...extra,
	});
}

describe("getShopOnboarding", () => {
	it("reports the shop's facts to the owner", async () => {
		const facts = await getShopOnboarding(seed(), { id: OWNER }, "s-1", NOW);
		expect(facts.profile).toEqual({
			logo: true,
			banner: false,
			description: false,
			brandColor: false,
			whatsapp: false,
		});
		expect(facts.products).toEqual({ active: 1, drafts: 1 });
		expect(facts.personalListings).toBe(1);
		expect(facts.verification.level).toBe(1);
		// Level 1: protected payment is not unlocked, so no payout step.
		expect(facts.payout.applies).toBe(false);
		expect(facts.traction).toEqual({ orders: 0, conversations: 0 });
		expect(facts.boostListingId).toBe("l-1");
		expect(facts.can.editSettings).toBe(true);
	});

	it("counts orders and buyer conversations as traction", async () => {
		const facts = await getShopOnboarding(
			seed({
				orders: [{ id: "o-1", shop: "s-1", status: "placed" }],
				conversations: [{ id: "c-1", shop: "s-1" }],
			}),
			{ id: OWNER },
			"s-1",
			NOW,
		);
		expect(facts.traction).toEqual({ orders: 1, conversations: 1 });
	});

	it("lets staff read it with their own permissions and no boost they cannot buy", async () => {
		// A team needs level 2: a level-1 shop's staff seat is dormant.
		const facts = await getShopOnboarding(
			seed({}, 2),
			{ id: STAFF },
			"s-1",
			NOW,
		);
		expect(facts.can).toMatchObject({
			editSettings: false,
			editCatalogue: true,
			managePayments: false,
		});
		expect(facts.boostListingId).toBeNull();
		expect(facts.personalListings).toBe(0);
	});

	it("refuses someone outside the shop", async () => {
		await expect(
			getShopOnboarding(seed(), { id: OUTSIDER }, "s-1", NOW),
		).rejects.toMatchObject({ status: 403 });
	});
});
