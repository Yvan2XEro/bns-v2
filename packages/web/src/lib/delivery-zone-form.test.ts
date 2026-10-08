import { describe, expect, test } from "bun:test";
import type { Courier, DeliveryZone } from "../../../api/src/payload-types";
import { ERROR_CODES } from "./apiError";
import {
	courierCostHint,
	couriersForCity,
	districtName,
	emptyZoneForm,
	groupZonesByCity,
	UNAVAILABLE_HINT_KEYS,
	unavailableHint,
	type ZoneFormValues,
	zoneFormSchema,
	zoneServerError,
	zoneToForm,
	zoneToInput,
} from "./delivery-zone-form";

const valid = (over: Partial<ZoneFormValues> = {}): ZoneFormValues => ({
	...emptyZoneForm("douala"),
	name: "Akwa express",
	fee: "1500",
	...over,
});

const issues = (values: ZoneFormValues) => {
	const parsed = zoneFormSchema.safeParse(values);
	return parsed.success
		? []
		: parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

const zone = (over: Partial<DeliveryZone> = {}): DeliveryZone => ({
	id: "zone-1",
	shop: "shop-1",
	name: "Akwa express",
	scope: "same_city",
	city: "douala",
	districts: [{ key: "douala.akwa" }],
	method: "seller_delivery",
	fee: 1500,
	freeAboveSubtotal: 20000,
	minOrderSubtotal: null,
	etaMinHours: 24,
	etaMaxHours: 48,
	cutoffTime: "14:00",
	deliveryDays: ["mon", "tue"],
	codAllowed: false,
	active: true,
	sortOrder: 0,
	updatedAt: "2026-10-01T00:00:00.000Z",
	createdAt: "2026-10-01T00:00:00.000Z",
	...over,
});

const courier = (over: Partial<Courier> = {}): Courier => ({
	id: "courier-1",
	key: "fastgo",
	name: "FastGo",
	provider: "manual",
	scopes: ["same_city"],
	cities: ["douala"],
	status: "active",
	billingMode: "shop_account",
	tariffs: [
		{ city: "douala", amount: 2500, etaMinHours: 24, etaMaxHours: 48 },
		{
			city: "douala",
			district: "douala.akwa",
			amount: 1500,
			etaMinHours: 4,
			etaMaxHours: 8,
		},
	],
	updatedAt: "2026-10-01T00:00:00.000Z",
	createdAt: "2026-10-01T00:00:00.000Z",
	...over,
});

describe("zoneFormSchema mirrors the service ladder", () => {
	test("a complete zone is accepted", () => {
		expect(issues(valid())).toEqual([]);
	});

	test("the name is 2 to 40 characters", () => {
		expect(issues(valid({ name: "a" }))).toEqual([["name", "nameLength"]]);
		expect(issues(valid({ name: "a".repeat(41) }))).toEqual([
			["name", "nameLength"],
		]);
		expect(issues(valid({ name: "ab" }))).toEqual([]);
	});

	test("the fee is required and capped at 50 000", () => {
		expect(issues(valid({ fee: "" }))).toEqual([["fee", "moneyInvalid"]]);
		expect(issues(valid({ fee: "50001" }))).toEqual([["fee", "moneyInvalid"]]);
		expect(issues(valid({ fee: "50000" }))).toEqual([]);
		expect(issues(valid({ fee: "0" }))).toEqual([]);
	});

	test("free-above and minimum may stay empty but never be negative or decimal", () => {
		expect(
			issues(valid({ freeAboveSubtotal: "", minOrderSubtotal: "" })),
		).toEqual([]);
		expect(issues(valid({ freeAboveSubtotal: "-5" }))).toEqual([
			["freeAboveSubtotal", "moneyInvalid"],
		]);
		expect(issues(valid({ minOrderSubtotal: "10.5" }))).toEqual([
			["minOrderSubtotal", "moneyInvalid"],
		]);
	});

	test("the ETA bounds are 1 to 720 hours and the minimum may not exceed the maximum", () => {
		expect(issues(valid({ etaMinHours: "0" }))).toEqual([
			["etaMinHours", "etaInvalid"],
		]);
		expect(issues(valid({ etaMaxHours: "721" }))).toEqual([
			["etaMaxHours", "etaInvalid"],
		]);
		expect(issues(valid({ etaMinHours: "49", etaMaxHours: "48" }))).toEqual([
			["etaMaxHours", "etaOrder"],
		]);
		expect(issues(valid({ etaMinHours: "48", etaMaxHours: "48" }))).toEqual([]);
	});

	test("the cutoff is HH:MM or empty", () => {
		expect(issues(valid({ cutoffTime: "24:00" }))).toEqual([
			["cutoffTime", "cutoffInvalid"],
		]);
		expect(issues(valid({ cutoffTime: "09:30" }))).toEqual([]);
	});

	test("at least one delivery day is required", () => {
		expect(issues(valid({ deliveryDays: [] }))).toEqual([
			["deliveryDays", "daysRequired"],
		]);
	});

	test("a courier zone needs a courier, a seller zone does not", () => {
		expect(issues(valid({ method: "courier", courier: "" }))).toEqual([
			["courier", "courierRequired"],
		]);
		expect(issues(valid({ method: "courier", courier: "courier-1" }))).toEqual(
			[],
		);
	});

	test("districts must belong to the zone's city", () => {
		expect(issues(valid({ districts: ["douala.akwa"] }))).toEqual([]);
		expect(issues(valid({ districts: ["yaounde.bastos"] }))).toEqual([
			["districts", "districtUnknown"],
		]);
	});
});

describe("zone form round trip", () => {
	test("an edit form carries the stored zone's values as strings", () => {
		expect(zoneToForm(zone())).toEqual({
			name: "Akwa express",
			city: "douala",
			districts: ["douala.akwa"],
			method: "seller_delivery",
			courier: "",
			fee: "1500",
			freeAboveSubtotal: "20000",
			minOrderSubtotal: "",
			etaMinHours: "24",
			etaMaxHours: "48",
			cutoffTime: "14:00",
			deliveryDays: ["mon", "tue"],
			codAllowed: false,
			active: true,
		});
	});

	test("the request body parses amounts and nulls the empty optionals", () => {
		expect(zoneToInput(zoneToForm(zone()))).toEqual({
			name: "Akwa express",
			scope: "same_city",
			city: "douala",
			districts: ["douala.akwa"],
			method: "seller_delivery",
			courier: null,
			fee: 1500,
			freeAboveSubtotal: 20000,
			minOrderSubtotal: null,
			etaMinHours: 24,
			etaMaxHours: 48,
			cutoffTime: "14:00",
			deliveryDays: ["mon", "tue"],
			codAllowed: false,
			active: true,
		});
	});

	test("switching a courier zone to seller delivery drops the courier from the body", () => {
		const values = valid({ method: "seller_delivery", courier: "courier-1" });
		expect(zoneToInput(values).courier).toBeNull();
	});

	test("a populated courier relation is read back as its id", () => {
		const form = zoneToForm(
			zone({ method: "courier", courier: courier({ id: "courier-9" }) }),
		);
		expect(form.courier).toBe("courier-9");
	});
});

describe("grouping and server errors", () => {
	test("zones group by city and sort by sortOrder inside a city", () => {
		const groups = groupZonesByCity([
			zone({ id: "b", city: "yaounde", sortOrder: 0 }),
			zone({ id: "c", sortOrder: 2 }),
			zone({ id: "a", sortOrder: 1 }),
		]);
		expect(groups.map((g) => [g.city, g.zones.map((z) => z.id)])).toEqual([
			["douala", ["a", "c"]],
			["yaounde", ["b"]],
		]);
	});

	test("an overlap refusal lands on the district picker", () => {
		expect(zoneServerError(ERROR_CODES.deliveryZoneOverlap)).toEqual({
			field: "districts",
			message: "overlap",
		});
		expect(zoneServerError(ERROR_CODES.courierCityNotServed)).toEqual({
			field: "courier",
			message: "courierCityNotServed",
		});
		expect(zoneServerError(ERROR_CODES.network)).toBeNull();
	});
});

describe("courier choice", () => {
	test("only active same-city couriers serving the zone's city are offered", () => {
		const offered = couriersForCity(
			[
				courier(),
				courier({ id: "paused", status: "paused" }),
				courier({ id: "yde", cities: ["yaounde"] }),
				courier({ id: "intercity", scopes: ["intercity"] }),
			],
			"douala",
		);
		expect(offered.map((c) => c.id)).toEqual(["courier-1"]);
	});

	test("the cost hint is the district row when it matches, else the whole-city row", () => {
		expect(courierCostHint(courier(), "douala", ["douala.akwa"])?.amount).toBe(
			1500,
		);
		expect(courierCostHint(courier(), "douala", [])?.amount).toBe(2500);
		expect(
			courierCostHint(courier(), "douala", ["douala.bonanjo"])?.amount,
		).toBe(2500);
		expect(courierCostHint(courier({ tariffs: [] }), "douala", [])).toBeNull();
		expect(courierCostHint(undefined, "douala", [])).toBeNull();
	});
});

describe("the test-an-address hints", () => {
	test("each unavailable reason maps to its Checkout sentence", () => {
		expect(UNAVAILABLE_HINT_KEYS).toEqual({
			cod_not_allowed: "deliveryUnavailable.cod_not_allowed",
			below_minimum: "deliveryUnavailable.below_minimum",
			not_served: "deliveryUnavailable.not_served",
		});
	});

	test("the cod_not_allowed hint renders without an amount, the minimum one with it", () => {
		expect(unavailableHint({ reason: "cod_not_allowed" })).toEqual({
			key: "deliveryUnavailable.cod_not_allowed",
			amount: 0,
		});
		expect(
			unavailableHint({ reason: "below_minimum", minOrderSubtotal: 5000 }),
		).toEqual({ key: "deliveryUnavailable.below_minimum", amount: 5000 });
	});
});

describe("districtName", () => {
	test("reads the label of a known key and falls back to the key", () => {
		expect(districtName("douala.deido")).toBe("Deïdo");
		expect(districtName("douala.nowhere")).toBe("douala.nowhere");
	});
});
