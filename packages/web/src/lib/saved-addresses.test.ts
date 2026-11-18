import { describe, expect, test } from "bun:test";
import { cmMarket } from "../test/market-fixture";
import { checkoutAddressSchema, toAddressInput } from "./checkout-form";
import { marketPhoneRule } from "./market-phone";
import {
	addressPatchFromPlace,
	type SavedAddress,
	savedAddressBody,
	savedAddressToInput,
	savedAddressUsable,
	savedAddressValues,
	suggestionCities,
} from "./saved-addresses";

const CM_PHONE = marketPhoneRule(cmMarket()).pattern;
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
		gps: { lat: 4.03, lng: 9.69, accuracyMeters: null },
		isDefault: true,
		updatedAt: "2026-10-01T00:00:00.000Z",
		...overrides,
	};
}

describe("saved addresses on the web", () => {
	test("a saved address becomes the same AddressInput as the form would send", () => {
		const address = saved();
		expect(savedAddressToInput(address)).toEqual(
			toAddressInput(savedAddressValues(address)),
		);
	});

	test("usable only inside the shop's served city and under today's rules", () => {
		const rules = {
			cityKeys: CITIES,
			servedCity: null,
			phonePattern: CM_PHONE,
		};
		expect(savedAddressUsable(saved(), rules)).toBe(true);
		expect(
			savedAddressUsable(saved(), { ...rules, servedCity: "yaounde" }),
		).toBe(false);
		expect(savedAddressUsable(saved({ landmark: null }), rules)).toBe(false);
		expect(
			savedAddressUsable(saved({ city: "bafoussam" }), {
				...rules,
				servedCity: null,
			}),
		).toBe(false);
	});

	test("the body clears what the form left empty, so a PATCH removes it", () => {
		const input = toAddressInput({
			recipientName: "Awa",
			phone: "+237699124408",
			city: "douala",
			district: "douala.akwa",
			districtOther: "",
			landmark: "Carrefour Ndokoti",
			instructions: "",
		});
		expect(savedAddressBody(input, { label: " Bureau " })).toEqual({
			label: "Bureau",
			recipientName: "Awa",
			phone: "+237699124408",
			city: "douala",
			district: "douala.akwa",
			districtOther: "",
			landmark: "Carrefour Ndokoti",
			instructions: "",
			gps: null,
		});
		expect(
			savedAddressBody(input, { label: "", isDefault: true }).isDefault,
		).toBe(true);
	});

	test("a geocoder district fills a value the form schema accepts", () => {
		const cities = suggestionCities([
			{ key: "douala", label: "Douala" },
			{ key: "yaounde", label: "Yaoundé" },
		]);
		const patch = addressPatchFromPlace(
			{ name: "Yaoundé", district: "Biyem-Assi" },
			cities,
		);
		expect(patch).toEqual({
			city: "yaounde",
			district: "yaounde.biyem-assi",
			districtOther: "",
		});
		const values = {
			...savedAddressValues(saved()),
			...patch,
		};
		expect(
			checkoutAddressSchema(CITIES, "seller_delivery", CM_PHONE).safeParse(
				values,
			).success,
		).toBe(true);
	});
});
