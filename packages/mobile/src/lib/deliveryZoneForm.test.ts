import { describe, expect, test } from "bun:test";
import type { DeliveryZone } from "../../../api/src/payload-types";
import {
	emptyZoneValues,
	groupZonesByCity,
	toZoneInput,
	zoneErrorField,
	zoneFormSchema,
	zoneToFormValues,
} from "./deliveryZoneForm";

const valid = { ...emptyZoneValues("douala"), name: "Akwa express" };

function issues(values: unknown): Array<[string, string]> {
	const parsed = zoneFormSchema.safeParse(values);
	return parsed.success
		? []
		: parsed.error.issues.map((i) => [String(i.path[0]), i.message]);
}

describe("zoneFormSchema", () => {
	test("accepts the defaults once the zone has a name", () => {
		expect(issues(valid)).toEqual([]);
	});

	test("refuses an ETA window whose minimum exceeds its maximum", () => {
		expect(issues({ ...valid, etaMinHours: "48", etaMaxHours: "24" })).toEqual([
			["etaMaxHours", "deliverySettings.errors.etaOrder"],
		]);
	});

	test("refuses ETA hours outside 1 to 720", () => {
		expect(issues({ ...valid, etaMinHours: "0" })).toEqual([
			["etaMinHours", "deliverySettings.errors.eta"],
		]);
		expect(issues({ ...valid, etaMaxHours: "721" })).toEqual([
			["etaMaxHours", "deliverySettings.errors.eta"],
		]);
	});

	test("caps the fee at 50 000 and rejects non-digits", () => {
		expect(issues({ ...valid, fee: "50001" })).toEqual([
			["fee", "deliverySettings.errors.fee"],
		]);
		expect(issues({ ...valid, fee: "12.5" })[0]?.[0]).toBe("fee");
		expect(issues({ ...valid, fee: "50000" })).toEqual([]);
	});

	test("lets free-above and minimum stay empty but not turn negative", () => {
		expect(issues({ ...valid, freeAbove: "", minimum: "" })).toEqual([]);
		expect(issues({ ...valid, freeAbove: "-5" })).toEqual([
			["freeAbove", "deliverySettings.errors.freeAbove"],
		]);
	});

	test("needs a courier for the courier method and at least one delivery day", () => {
		expect(issues({ ...valid, method: "courier" })).toEqual([
			["courier", "deliverySettings.errors.courier"],
		]);
		expect(issues({ ...valid, method: "courier", courier: "c1" })).toEqual([]);
		expect(issues({ ...valid, deliveryDays: [] })).toEqual([
			["deliveryDays", "deliverySettings.errors.days"],
		]);
	});

	test("only accepts districts of the chosen city", () => {
		expect(
			issues({ ...valid, districts: ["douala.akwa", "douala.other"] }),
		).toEqual([]);
		expect(issues({ ...valid, districts: ["yaounde.bastos"] })).toEqual([
			["districts", "deliverySettings.errors.districts"],
		]);
	});

	test("checks the cutoff as HH:MM", () => {
		expect(issues({ ...valid, cutoffTime: "17:30" })).toEqual([]);
		expect(issues({ ...valid, cutoffTime: "25:00" })).toEqual([
			["cutoffTime", "deliverySettings.errors.cutoff"],
		]);
	});
});

describe("toZoneInput", () => {
	test("sends numbers, nulls for the blanks and no courier for a seller zone", () => {
		expect(
			toZoneInput({
				...valid,
				courier: "stale",
				fee: "1500",
				freeAbove: "20000",
			}),
		).toMatchObject({
			scope: "same_city",
			courier: null,
			fee: 1500,
			freeAboveSubtotal: 20000,
			minOrderSubtotal: null,
			cutoffTime: null,
			etaMinHours: 24,
			etaMaxHours: 48,
		});
	});
});

describe("zoneToFormValues", () => {
	test("round-trips a stored zone through the form values", () => {
		const zone = {
			id: "z1",
			shop: "s1",
			name: "Akwa",
			scope: "same_city",
			city: "douala",
			districts: [{ key: "douala.akwa" }],
			method: "courier",
			courier: { id: "c9" },
			fee: 1500,
			freeAboveSubtotal: 20000,
			minOrderSubtotal: null,
			etaMinHours: 24,
			etaMaxHours: 48,
			cutoffTime: "17:00",
			deliveryDays: ["mon", "tue"],
			codAllowed: false,
			active: true,
			updatedAt: "",
			createdAt: "",
		} as unknown as DeliveryZone;
		const values = zoneToFormValues(zone);
		expect(values).toMatchObject({
			districts: ["douala.akwa"],
			courier: "c9",
			fee: "1500",
			freeAbove: "20000",
			minimum: "",
			codAllowed: false,
		});
		expect(toZoneInput(values)).toMatchObject({
			fee: 1500,
			courier: "c9",
			freeAboveSubtotal: 20000,
		});
	});
});

describe("zoneErrorField", () => {
	test("pins the overlap to the districts and an unserved city to the courier", () => {
		expect(zoneErrorField("delivery.zoneOverlap")).toBe("districts");
		expect(zoneErrorField("courier.cityNotServed")).toBe("courier");
		expect(zoneErrorField("generic.server")).toBeNull();
	});
});

describe("groupZonesByCity", () => {
	test("groups in launch-city order and skips empty cities", () => {
		const zone = (id: string, city: "douala" | "yaounde") =>
			({ id, city }) as unknown as DeliveryZone;
		const groups = groupZonesByCity([
			zone("a", "yaounde"),
			zone("b", "douala"),
			zone("c", "yaounde"),
		]);
		expect(groups.map((g) => [g.city, g.zones.map((z) => z.id)])).toEqual([
			["douala", ["b"]],
			["yaounde", ["a", "c"]],
		]);
	});
});
