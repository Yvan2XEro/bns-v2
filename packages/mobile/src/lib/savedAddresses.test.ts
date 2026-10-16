import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { toAddressInput } from "./checkoutForm";
import { setMarket } from "./market";
import { marketFixture } from "./market.fixture.test";
import {
	addressPatchFromPlace,
	coordinatesText,
	type SavedAddress,
	savedAddressBody,
	savedAddressToInput,
	savedAddressUsable,
	savedAddressValues,
	suggestionCities,
} from "./savedAddresses";

beforeAll(() => setMarket(marketFixture()));
afterAll(() => setMarket(undefined));

const CITIES = ["douala", "yaounde"];

function saved(overrides: Partial<SavedAddress> = {}): SavedAddress {
	return {
		id: "a1",
		label: "Maison",
		recipientName: "Grâce Ewane",
		phone: "+237699421507",
		city: "douala",
		district: "douala.bonapriso",
		districtOther: null,
		landmark: "Rue Joss, face à la pharmacie",
		instructions: null,
		gps: { lat: 4.03, lng: 9.69, accuracyMeters: 8 },
		isDefault: true,
		updatedAt: "2026-10-01T00:00:00.000Z",
		...overrides,
	};
}

describe("saved addresses on mobile", () => {
	test("a saved address becomes the same AddressInput as the form would send", () => {
		const address = saved();
		expect(savedAddressToInput(address)).toEqual(
			toAddressInput(savedAddressValues(address)),
		);
	});

	test("usable only inside the shop's served city and under today's rules", () => {
		expect(
			savedAddressUsable(saved(), { cityKeys: CITIES, servedCity: null }),
		).toBe(true);
		expect(
			savedAddressUsable(saved(), { cityKeys: CITIES, servedCity: "yaounde" }),
		).toBe(false);
		expect(
			savedAddressUsable(saved({ phone: "+237222123456" }), {
				cityKeys: CITIES,
				servedCity: null,
			}),
		).toBe(false);
	});

	test("the body clears what the form left empty", () => {
		const body = savedAddressBody(savedAddressToInput(saved({ gps: null })), {
			label: " Bureau ",
		});
		expect(body).toMatchObject({
			label: "Bureau",
			districtOther: "",
			instructions: "",
			gps: null,
		});
		expect("isDefault" in body).toBe(false);
	});

	test("a geocoder district maps onto the chips", () => {
		const cities = suggestionCities([{ key: "douala", label: "Douala" }]);
		expect(
			addressPatchFromPlace({ name: "Douala", district: "Bonabéri" }, cities),
		).toEqual({
			city: "douala",
			district: "douala.bonaberi",
			districtOther: "",
		});
	});

	test("coordinates stand in for the map", () => {
		expect(coordinatesText({ lat: 4.0512345, lng: 9.7 })).toBe(
			"4.05123, 9.70000",
		);
	});
});
