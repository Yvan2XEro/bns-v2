// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "../../src/lib/errors";
import {
	listResaleLinks,
	requestResaleLink,
} from "../../src/services/resaleLinks";
import { type FakePayload, fakePayload } from "./helpers/fakePayload";

const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));
vi.mock("../../src/lib/shopRoute", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/shopRoute")>()),
	requireUser: requireUserMock,
}));

const member = (id: string, shop: string, user: string, role: string) => ({
	id,
	shop,
	user,
	role,
	status: "active",
});

function seed(status = "requested"): FakePayload {
	return fakePayload(
		{
			shops: [
				{ id: "supplier", owner: "supplier-owner", status: "active", level: 3 },
				{ id: "reseller", owner: "reseller-owner", status: "active", level: 2 },
				{ id: "other", owner: "other-owner", status: "active", level: 2 },
			],
			"shop-members": [
				member("m-1", "supplier", "supplier-owner", "owner"),
				member("m-2", "reseller", "reseller-owner", "owner"),
				member("m-3", "reseller", "reseller-staff", "staff"),
				member("m-4", "other", "other-owner", "owner"),
			],
			"resale-links": [
				{
					id: "link-1",
					supplierShop: "supplier",
					resellerShop: "reseller",
					status,
					riskHold: false,
				},
			],
			"resale-terms": [
				{
					id: "terms",
					role: "reseller",
					version: "2026-10-01",
					publishedAt: "2026-10-01T00:00:00.000Z",
				},
			],
			"resale-terms-acceptances": [
				{
					id: "acc",
					shop: "reseller",
					role: "reseller",
					version: "2026-10-01",
				},
			],
		},
		{ globals: { "app-settings": { resale: { enabled: true } } } },
	);
}

async function cancel(payload: FakePayload, userId: string, shopId: string) {
	requireUserMock.mockResolvedValue({ payload, user: { id: userId } });
	const { POST } = await import(
		"../../src/app/(frontend)/api/shops/[id]/resale-links/[linkId]/cancel/route"
	);
	return POST(new Request("https://api.example/x", { method: "POST" }), {
		params: Promise.resolve({ id: shopId, linkId: "link-1" }),
	});
}

describe("POST /api/shops/:id/resale-links/:linkId/cancel (W36)", () => {
	beforeEach(() => requireUserMock.mockReset());

	it("lets the reseller withdraw a pending request", async () => {
		const payload = seed();
		const response = await cancel(payload, "reseller-owner", "reseller");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: "link-1", status: "revoked" });
		expect(payload.store["resale-links"][0]).toMatchObject({
			status: "revoked",
			revokedBy: "reseller",
		});
	});

	it("drops the withdrawn request from both sides' lists", async () => {
		const payload = seed();
		await cancel(payload, "reseller-owner", "reseller");
		for (const [user, shop, side] of [
			["reseller-owner", "reseller", "reseller"],
			["supplier-owner", "supplier", "supplier"],
		] as const) {
			const page = await listResaleLinks(payload, { id: user }, shop, { side });
			expect(page.docs).toEqual([]);
		}
	});

	it("lets the reseller ask again at once", async () => {
		const payload = seed();
		await cancel(payload, "reseller-owner", "reseller");
		const link = await requestResaleLink(
			payload,
			{ id: "reseller-owner" },
			"reseller",
			{ supplierShop: "supplier", acceptTermsVersion: "2026-10-01" },
		);
		expect(link.status).toBe("requested");
		expect(link.revokedBy).toBeNull();
	});

	it("refuses a link that is no longer pending", async () => {
		const response = await cancel(
			seed("approved"),
			"reseller-owner",
			"reseller",
		);
		expect(response.status).toBe(409);
		expect((await response.json()).code).toBe(ERROR_CODES.resaleLinkInactive);
	});

	it("refuses a member without resale.manage", async () => {
		const payload = seed();
		const response = await cancel(payload, "reseller-staff", "reseller");
		expect(response.status).toBe(403);
		expect(payload.store["resale-links"][0].status).toBe("requested");
	});

	it("answers another shop's link like a missing one", async () => {
		const payload = seed();
		const response = await cancel(payload, "other-owner", "other");
		expect(response.status).toBe(404);
		expect(payload.store["resale-links"][0].status).toBe("requested");
	});

	it("never lets the supplier withdraw it through the reseller route", async () => {
		const response = await cancel(seed(), "supplier-owner", "supplier");
		expect(response.status).toBe(404);
	});
});
