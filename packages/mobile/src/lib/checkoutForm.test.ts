import { describe, expect, test } from "bun:test";
import {
	LAUNCH_CITY_KEYS as API_LAUNCH_CITY_KEYS,
	districtKeysOf as apiDistrictKeysOf,
	districtLabel as apiDistrictLabel,
} from "../../../api/src/lib/launchCities";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import {
	ADDRESS_ERROR_KEYS,
	addressDefaults,
	addressFieldOf,
	type CheckoutAddressValues,
	checkoutAddressSchema,
	confirmationCodeSchema,
	DISTRICTS,
	districtName,
	googleMapsUrl,
	gpsFromCoords,
	phoneFromTyping,
	toAddressInput,
} from "./checkoutForm";

const CITIES = ["douala", "yaounde"] as const;

const valid: CheckoutAddressValues = {
	recipientName: "Awa Ngono",
	phone: "+237699124408",
	city: "douala",
	district: "douala.akwa",
	districtOther: "",
	landmark: "En face de la pharmacie du Rond-point",
	instructions: "",
};

function issues(
	values: Partial<CheckoutAddressValues>,
	method: "seller_delivery" | "pickup" = "seller_delivery",
) {
	const result = checkoutAddressSchema(CITIES, method).safeParse({
		...valid,
		...values,
	});
	return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

describe("the address schema mirrors parseDeliveryAddress", () => {
	test("a complete seller_delivery address passes", () => {
		expect(issues({})).toEqual([]);
	});
	test("recipient: 2 to 60 characters", () => {
		expect(issues({ recipientName: "Al" })).toEqual([]);
		expect(issues({ recipientName: "A" })).toEqual(["recipientName"]);
		expect(issues({ recipientName: "A".repeat(61) })).toEqual([
			"recipientName",
		]);
	});
	test("phone: only a +2376 mobile in E.164", () => {
		expect(issues({ phone: "+237677000000" })).toEqual([]);
		expect(issues({ phone: "+237222123456" })).toEqual(["phone"]);
		expect(issues({ phone: "+23769912440" })).toEqual(["phone"]);
		expect(issues({ phone: "+33612345678" })).toEqual(["phone"]);
	});
	test("city: a launch city passes, another fails on city", () => {
		expect(issues({ city: "yaounde", district: "yaounde.bastos" })).toEqual([]);
		expect(
			issues({ city: "bafoussam", district: "bafoussam.other" }),
		).toContain("city");
	});
	test("district: must belong to the chosen city", () => {
		expect(issues({ district: "douala.bonapriso" })).toEqual([]);
		expect(issues({ district: "yaounde.bastos" })).toEqual(["district"]);
		expect(issues({ district: "" })).toEqual(["district"]);
	});
	test("other district: .other needs 2 to 60 characters of its own", () => {
		expect(
			issues({ district: "douala.other", districtOther: "Ndogbong" }),
		).toEqual([]);
		expect(issues({ district: "douala.other", districtOther: " " })).toEqual([
			"districtOther",
		]);
	});
	test("landmark: required 5 to 200 for seller_delivery, bounded when given for pickup", () => {
		expect(issues({ landmark: "" }, "pickup")).toEqual([]);
		expect(issues({ landmark: "" })).toEqual(["landmark"]);
		expect(issues({ landmark: "abcd" })).toEqual(["landmark"]);
		expect(issues({ landmark: "abcde" })).toEqual([]);
		expect(issues({ landmark: "a".repeat(201) })).toEqual(["landmark"]);
		expect(issues({ landmark: "abcd" }, "pickup")).toEqual(["landmark"]);
	});
	test("instructions: at most 300 characters", () => {
		expect(issues({ instructions: "a".repeat(300) })).toEqual([]);
		expect(issues({ instructions: "a".repeat(301) })).toEqual(["instructions"]);
	});
	test("each failure carries its field's translation key", () => {
		const result = checkoutAddressSchema(CITIES, "seller_delivery").safeParse({
			...valid,
			landmark: "",
		});
		expect(
			result.success ? [] : result.error.issues.map((i) => i.message),
		).toEqual(["checkout.errorLandmark"]);
	});
});

describe("every field error the form can show is translated", () => {
	test("in both locales", () => {
		type Json = { [key: string]: Json | string };
		const at = (root: Json, path: string) =>
			path
				.split(".")
				.reduce<Json | string | undefined>(
					(node, key) =>
						node && typeof node === "object" ? node[key] : undefined,
					root,
				);
		const keys = [...Object.values(ADDRESS_ERROR_KEYS), "checkout.errorCode"];
		const missing = keys.filter(
			(key) =>
				typeof at(en as Json, key) !== "string" ||
				typeof at(fr as Json, key) !== "string",
		);
		expect(missing).toEqual([]);
		expect(keys).toHaveLength(8);
	});
});

describe("the district table is the API's, slug for slug", () => {
	test("same cities, same district keys, same labels", () => {
		expect(Object.keys(DISTRICTS).sort()).toEqual(
			[...API_LAUNCH_CITY_KEYS].sort(),
		);
		for (const city of API_LAUNCH_CITY_KEYS) {
			expect(DISTRICTS[city]?.map((d) => d.key)).toEqual([
				...apiDistrictKeysOf(city),
			]);
			for (const d of DISTRICTS[city] ?? []) {
				expect(d.label).toBe(apiDistrictLabel(d.key) ?? "");
			}
		}
	});
	test("a district reads as its label, .other as the buyer's text", () => {
		const address = toAddressInput(valid);
		expect(districtName(address)).toBe("Akwa");
		expect(
			districtName({
				...address,
				district: "douala.other",
				districtOther: "Ndogbong",
			}),
		).toBe("Ndogbong");
	});
});

describe("the form values become the API's AddressInput", () => {
	test("empty optionals are dropped, districtOther only for .other, gps kept", () => {
		expect(
			toAddressInput({
				...valid,
				recipientName: "  Awa Ngono ",
				districtOther: "ignored",
				gps: { lat: 4.05, lng: 9.7, accuracyMeters: 12 },
			}),
		).toEqual({
			recipientName: "Awa Ngono",
			phone: "+237699124408",
			city: "douala",
			district: "douala.akwa",
			landmark: "En face de la pharmacie du Rond-point",
			gps: { lat: 4.05, lng: 9.7, accuracyMeters: 12 },
		});
	});
	test("the defaults prefer what was entered, then the account, then the shop's city", () => {
		const account = { name: "Awa", phone: "+237699000000" };
		expect(addressDefaults(null, account, "douala")).toEqual({
			recipientName: "Awa",
			phone: "+237699000000",
			city: "douala",
			district: "",
			districtOther: "",
			landmark: "",
			instructions: "",
			gps: undefined,
		});
		const entered = toAddressInput({
			...valid,
			city: "yaounde",
			district: "yaounde.bastos",
		});
		expect(addressDefaults(entered, account, "douala").city).toBe("yaounde");
		expect(addressDefaults(entered, account, "douala").recipientName).toBe(
			"Awa Ngono",
		);
	});
	test("typed spaces and dashes are dropped from the phone", () => {
		expect(phoneFromTyping("+237 699-12 44 08")).toBe("+237699124408");
	});
});

describe("a device fix", () => {
	test("keeps the accuracy in whole metres", () => {
		expect(
			gpsFromCoords({ latitude: 4.05, longitude: 9.7, accuracy: 12.6 }),
		).toEqual({ lat: 4.05, lng: 9.7, accuracyMeters: 13 });
	});
	test("an unknown accuracy is left out, not zero", () => {
		expect(
			gpsFromCoords({ latitude: 4.05, longitude: 9.7, accuracy: null }),
		).toEqual({ lat: 4.05, lng: 9.7 });
	});
	test("the map link points at the captured position", () => {
		expect(googleMapsUrl(4.05, 9.7)).toBe(
			"https://www.google.com/maps/search/?api=1&query=4.05%2C9.7",
		);
	});
});

describe("checkout.addressInvalid's field path maps back to a form field", () => {
	test("the body's delivery.landmark names landmark", () => {
		expect(
			addressFieldOf({ data: { details: { field: "delivery.landmark" } } }),
		).toBe("landmark");
	});
	test("an unknown or absent path names nothing", () => {
		expect(
			addressFieldOf({ data: { details: { field: "delivery.gps" } } }),
		).toBeNull();
		expect(addressFieldOf({ data: {} })).toBeNull();
		expect(addressFieldOf(new Error("x"))).toBeNull();
	});
});

describe("the confirmation code", () => {
	test("six digits pass, trimmed", () => {
		expect(confirmationCodeSchema.safeParse({ code: " 123456 " }).success).toBe(
			true,
		);
	});
	test("five digits or letters fail with the code's key", () => {
		const short = confirmationCodeSchema.safeParse({ code: "12345" });
		expect(short.success ? null : short.error.issues[0]?.message).toBe(
			"checkout.errorCode",
		);
		expect(confirmationCodeSchema.safeParse({ code: "12345a" }).success).toBe(
			false,
		);
	});
});
