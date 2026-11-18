// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	createLocation,
	deactivateLocation,
	defaultOrigin,
	publicPickupPoints,
	updateLocation,
} from "../../src/services/delivery/locations";
import { fakePayload } from "./helpers/fakePayload";

const owner = { id: "owner-1", role: "user" };
const shop = {
	id: "shop-1",
	owner: owner.id,
	status: "active",
	level: 2,
	location: { city: "douala" },
};
const members = [
	{
		id: "mem-owner",
		shop: shop.id,
		user: owner.id,
		role: "owner",
		status: "active",
	},
];

function input(overrides: Record<string, unknown> = {}) {
	return {
		name: "Main dispatch",
		city: "douala",
		district: "douala.akwa",
		landmark: "Near the central market",
		gps: { lat: 4.05, lng: 9.7 },
		isDispatchOrigin: true,
		...overrides,
	};
}

describe("P7 shop delivery locations", () => {
	it("requires valid landmark and coordinates, and opening hours for pickup", async () => {
		const payload = fakePayload({ shops: [shop], "shop-members": members });
		await expect(
			createLocation(payload, owner, shop.id, input({ landmark: "tiny" })),
		).rejects.toMatchObject({ code: "delivery.locationInvalid", status: 400 });
		await expect(
			createLocation(payload, owner, shop.id, input({ pickupEnabled: true })),
		).rejects.toMatchObject({ code: "delivery.locationInvalid", status: 400 });
	});

	it("enforces the ten-location shop limit", async () => {
		const locations = Array.from({ length: 10 }, (_, index) => ({
			id: `loc-${index}`,
			shop: shop.id,
			...input(),
		}));
		const payload = fakePayload({
			shops: [{ ...shop, handle: "active-shop" }],
			"shop-members": members,
			"shop-locations": locations,
		});
		await expect(
			createLocation(payload, owner, shop.id, input()),
		).rejects.toMatchObject({
			code: "delivery.locationLimitReached",
			status: 409,
		});
	});

	it("keeps one active default origin when a new location is selected", async () => {
		const payload = fakePayload({
			shops: [shop],
			"shop-members": members,
			"shop-locations": [
				{ id: "old", shop: shop.id, ...input({ isDefaultOrigin: true }) },
			],
		});
		const created = await createLocation(
			payload,
			owner,
			shop.id,
			input({ name: "New dispatch", isDefaultOrigin: true }),
		);
		const defaults = payload.store["shop-locations"]?.filter(
			(location) =>
				location.active !== false && location.isDefaultOrigin === true,
		);
		expect(defaults).toHaveLength(1);
		expect(defaults?.[0]?.id).toBe(created.id);
		await expect(defaultOrigin(payload, shop.id)).resolves.toMatchObject({
			id: created.id,
		});
	});

	it("pins public pickup-point shape, excludes inactive rows, and omits an empty phone", async () => {
		const payload = fakePayload({
			shops: [{ ...shop, handle: "active-shop" }],
			"shop-locations": [
				{
					id: "pickup-1",
					shop: shop.id,
					...input({
						name: "Pickup centre",
						pickupEnabled: true,
						phone: "",
						openingHours: [{ day: "mon", opens: "09:00", closes: "17:00" }],
					}),
					active: true,
				},
				{
					id: "inactive",
					shop: shop.id,
					...input({ pickupEnabled: true }),
					active: false,
				},
				{
					id: "dispatch-only",
					shop: shop.id,
					...input({ pickupEnabled: false }),
					active: true,
				},
			],
		});
		const result = await publicPickupPoints(payload, "active-shop");
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			id: "pickup-1",
			name: "Pickup centre",
			city: "douala",
			district: "douala.akwa",
			address: null,
			landmark: "Near the central market",
			gps: { lat: 4.05, lng: 9.7 },
			openingHours: [{ day: "mon", opens: "09:00", closes: "17:00" }],
			openingHoursNote: null,
			pickupFee: 0,
			holdDays: 7,
			preparationHours: 2,
		});
		expect(result[0]).not.toHaveProperty("phone");
	});

	it("promotes another dispatch origin when the current default is deactivated", async () => {
		const payload = fakePayload({
			shops: [shop],
			"shop-members": members,
			"shop-locations": [
				{
					id: "default",
					shop: shop.id,
					...input({ isDefaultOrigin: true }),
					active: true,
				},
				{
					id: "backup",
					shop: shop.id,
					...input({ isDefaultOrigin: false }),
					active: true,
				},
			],
		});
		await deactivateLocation(payload, owner, "default");
		expect(
			payload.store["shop-locations"]?.find((row) => row.id === "backup"),
		).toMatchObject({ isDefaultOrigin: true, active: true });
		await expect(
			updateLocation(payload, owner, "backup", { name: "Backup origin" }),
		).resolves.toMatchObject({ name: "Backup origin" });
	});
});
