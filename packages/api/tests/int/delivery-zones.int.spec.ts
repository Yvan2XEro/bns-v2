// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	createZone,
	deactivateZone,
	publicDeliveryCities,
	resolveZonesFor,
	updateZone,
} from "../../src/services/delivery/zones";
import { fakePayload } from "./helpers/fakePayload";

const owner = { id: "owner-1", role: "user" };
const shop = {
	id: "shop-1",
	owner: owner.id,
	status: "active",
	level: 2,
	location: { city: "douala" },
};
const member = {
	id: "member-1",
	shop: shop.id,
	user: owner.id,
	role: "owner",
	status: "active",
};

function input(overrides: Record<string, unknown> = {}) {
	return {
		name: "Douala centre",
		scope: "same_city",
		city: "douala",
		districts: ["douala.akwa"],
		method: "seller_delivery",
		fee: 1500,
		etaMinHours: 24,
		etaMaxHours: 72,
		deliveryDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
		...overrides,
	};
}

describe("P7 delivery zones", () => {
	it("rejects districts from another city and overlapping active districts", async () => {
		const payload = fakePayload({ shops: [shop], "shop-members": [member] });
		await expect(
			createZone(
				payload,
				owner,
				shop.id,
				input({ districts: ["yaounde.bastos"] }),
			),
		).rejects.toMatchObject({ code: "delivery.zoneInvalid", status: 400 });
		await createZone(payload, owner, shop.id, input());
		await expect(
			createZone(payload, owner, shop.id, input()),
		).rejects.toMatchObject({
			code: "delivery.zoneOverlap",
			status: 409,
		});
	});

	it("allows district coverage alongside a whole-city zone and resolves the district first", async () => {
		const payload = fakePayload({ shops: [shop], "shop-members": [member] });
		const wholeCity = await createZone(
			payload,
			owner,
			shop.id,
			input({ name: "Toute la ville", districts: [] }),
		);
		const district = await createZone(payload, owner, shop.id, input());
		const resolved = await resolveZonesFor(payload, shop.id, {
			city: "douala",
			district: "douala.akwa",
		});
		expect(resolved.get("seller_delivery")?.id).toBe(district.id);
		const other = await resolveZonesFor(payload, shop.id, {
			city: "douala",
			district: "douala.other",
		});
		expect(other.get("seller_delivery")?.id).toBe(wholeCity.id);
	});

	it("requires the intercity gate and a destination city", async () => {
		const payload = fakePayload({ shops: [shop], "shop-members": [member] });
		await expect(
			createZone(payload, owner, shop.id, input({ scope: "intercity" })),
		).rejects.toMatchObject({ code: "delivery.zoneInvalid", status: 400 });
		payload.globals["app-settings"] = { delivery: { intercityEnabled: true } };
		const zone = await createZone(
			payload,
			owner,
			shop.id,
			input({ scope: "intercity", destinationCities: ["yaounde"] }),
		);
		expect(zone.destinationCities).toContain("yaounde");
	});

	it("deactivates a zone referenced by an order instead of deleting it", async () => {
		const payload = fakePayload({
			shops: [shop],
			"shop-members": [member],
			orders: [{ id: "order-1", delivery: { zone: "zone-1" } }],
			"delivery-zones": [
				{ id: "zone-1", shop: shop.id, ...input(), active: true },
			],
		});
		await expect(deactivateZone(payload, owner, "zone-1")).resolves.toEqual({
			deleted: false,
			deactivated: true,
		});
		expect(payload.store["delivery-zones"]?.[0]).toMatchObject({
			active: false,
		});
	});

	it("updates without clearing optional courier and fee-related fields", async () => {
		const payload = fakePayload({ shops: [shop], "shop-members": [member] });
		const zone = await createZone(
			payload,
			owner,
			shop.id,
			input({ freeAboveSubtotal: 20_000, minOrderSubtotal: 3_000 }),
		);
		const updated = await updateZone(payload, owner, String(zone.id), {
			name: "Douala central",
		});
		expect(updated).toMatchObject({
			name: "Douala central",
			freeAboveSubtotal: 20_000,
			minOrderSubtotal: 3_000,
		});
	});

	it("lists the cities an active shop's active zones reach, in launch order", async () => {
		const payload = fakePayload({
			shops: [shop, { ...shop, id: "shop-closed", status: "closed" }],
			"delivery-zones": [
				{
					id: "z1",
					shop: shop.id,
					scope: "same_city",
					city: "douala",
					active: true,
				},
				{
					id: "z2",
					shop: shop.id,
					scope: "intercity",
					city: "douala",
					destinationCities: ["yaounde"],
					active: true,
				},
				{
					id: "z3",
					shop: "shop-other",
					scope: "same_city",
					city: "yaounde",
					active: true,
				},
			],
		});
		await expect(publicDeliveryCities(payload, shop.id)).resolves.toEqual({
			deliveryCities: ["douala", "yaounde"],
		});
		await expect(
			publicDeliveryCities(payload, "shop-closed"),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			publicDeliveryCities(payload, "missing"),
		).rejects.toMatchObject({ status: 404 });
	});

	it("is empty for a shop without active zones", async () => {
		const payload = fakePayload({
			shops: [shop],
			"delivery-zones": [
				{
					id: "z1",
					shop: shop.id,
					scope: "same_city",
					city: "douala",
					active: false,
				},
			],
		});
		await expect(publicDeliveryCities(payload, shop.id)).resolves.toEqual({
			deliveryCities: [],
		});
	});
});
