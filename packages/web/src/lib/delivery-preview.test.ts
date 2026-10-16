import { describe, expect, it } from "bun:test";
import type { PublicPickupPoint } from "../../../api/src/contracts/publicPickupPoint";
import {
	cartDeliveryPreview,
	etaPhrase,
	launchCityFor,
	listingDeliveryEstimate,
} from "./delivery-preview";

const cities = [
	{ key: "douala", label: "Douala", fee: 1500 },
	{ key: "yaounde", label: "Yaoundé", fee: 2000 },
];
const pickup = (pickupFee: number): PublicPickupPoint => ({
	id: `p${pickupFee}`,
	name: "Akwa",
	city: "douala",
	district: "douala.akwa",
	landmark: "",
	gps: { lat: 4.05, lng: 9.7 },
	address: null,
	openingHoursNote: null,
	pickupFee,
	holdDays: 3,
	preparationHours: 2,
});

describe("launchCityFor", () => {
	it("matches a remembered place by label or key, accents folded", () => {
		expect(launchCityFor("Yaounde", cities)?.key).toBe("yaounde");
		expect(launchCityFor(" douala ", cities)?.label).toBe("Douala");
		expect(launchCityFor("Bafoussam", cities)).toBeNull();
		expect(launchCityFor(null, cities)).toBeNull();
	});
});

describe("cartDeliveryPreview", () => {
	const fees = {
		deliveryCities: ["douala"],
		deliveryFees: [{ city: "douala", minFee: 1000, maxFee: 2500 }],
	};

	it("gives the cheapest zone fee for the buyer's city and the cheapest pickup", () => {
		expect(
			cartDeliveryPreview(cities[0] ?? null, fees, [pickup(500), pickup(0)]),
		).toEqual({
			delivery: { city: "Douala", fromFee: 1000 },
			pickupFromFee: 0,
		});
	});

	it("leaves out delivery for a city the shop does not reach", () => {
		expect(cartDeliveryPreview(cities[1] ?? null, fees, [pickup(300)])).toEqual(
			{ delivery: null, pickupFromFee: 300 },
		);
	});

	it("is null when nothing is known", () => {
		expect(cartDeliveryPreview(null, fees, [])).toBeNull();
		expect(
			cartDeliveryPreview(cities[0] ?? null, undefined, undefined),
		).toBeNull();
	});
});

describe("listingDeliveryEstimate", () => {
	it("takes the cheapest door delivery, never pickup", () => {
		expect(
			listingDeliveryEstimate({
				perMethod: [
					{ method: "pickup", cheapestFee: 0, etaMinHours: 2, etaMaxHours: 4 },
					{
						method: "seller_delivery",
						cheapestFee: 2000,
						etaMinHours: 4,
						etaMaxHours: 24,
					},
					{
						method: "courier",
						cheapestFee: 2500,
						etaMinHours: 24,
						etaMaxHours: 72,
					},
				],
			}),
		).toEqual({ fee: 2000, eta: { unit: "hours", value: 24 } });
	});

	it("is null without a door delivery", () => {
		expect(
			listingDeliveryEstimate({
				perMethod: [
					{ method: "pickup", cheapestFee: 0, etaMinHours: 2, etaMaxHours: 4 },
				],
			}),
		).toBeNull();
		expect(listingDeliveryEstimate(undefined)).toBeNull();
	});
});

describe("etaPhrase", () => {
	it("speaks hours up to a day and a half, then whole days", () => {
		expect(etaPhrase(24)).toEqual({ unit: "hours", value: 24 });
		expect(etaPhrase(48)).toEqual({ unit: "days", value: 2 });
		expect(etaPhrase(50)).toEqual({ unit: "days", value: 3 });
		expect(etaPhrase(0)).toBeNull();
	});
});
