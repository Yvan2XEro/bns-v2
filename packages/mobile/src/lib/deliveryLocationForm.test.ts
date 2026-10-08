import { describe, expect, test } from "bun:test";
import {
	addHoursRow,
	emptyLocationValues,
	locationFormSchema,
	sortedHours,
	toLocationInput,
} from "./deliveryLocationForm";

const valid = {
	...emptyLocationValues("douala"),
	name: "Boutique Akwa",
	district: "Akwa",
	landmark: "Face a la pharmacie",
	lat: "4.05",
	lng: "9.7",
};

function issues(values: unknown): Array<[string, string]> {
	const parsed = locationFormSchema.safeParse(values);
	return parsed.success
		? []
		: parsed.error.issues.map((i) => [String(i.path[0]), i.message]);
}

describe("locationFormSchema", () => {
	test("accepts a located shop without pickup", () => {
		expect(issues(valid)).toEqual([]);
	});

	test("needs opening hours as soon as pickup is switched on", () => {
		expect(issues({ ...valid, pickupEnabled: true })).toEqual([
			["openingHours", "deliverySettings.errors.hoursRequired"],
		]);
	});

	test("refuses a row that closes before it opens", () => {
		expect(
			issues({
				...valid,
				openingHours: [{ day: "mon", opens: "18:00", closes: "08:00" }],
			}),
		).toEqual([["openingHours", "deliverySettings.errors.hoursOrder"]]);
	});

	test("bounds the position and the hold", () => {
		expect(issues({ ...valid, lat: "91" })).toEqual([
			["lat", "deliverySettings.errors.gps"],
		]);
		expect(issues({ ...valid, lng: "" })).toEqual([
			["lng", "deliverySettings.errors.gps"],
		]);
		expect(issues({ ...valid, holdDays: "15" })).toEqual([
			["holdDays", "deliverySettings.errors.holdDays"],
		]);
	});

	test("only lets an active dispatch origin be the default", () => {
		expect(
			issues({ ...valid, isDefaultOrigin: true, isDispatchOrigin: false }),
		).toEqual([["isDefaultOrigin", "deliverySettings.errors.defaultOrigin"]]);
		expect(issues({ ...valid, isDefaultOrigin: true })).toEqual([]);
	});
});

describe("opening hours grid", () => {
	test("addHoursRow copies the previous hours, keeps the week's order and ignores a duplicate day", () => {
		const rows = addHoursRow(
			addHoursRow([{ day: "wed", opens: "09:00", closes: "17:00" }], "mon"),
			"mon",
		);
		expect(rows).toEqual([
			{ day: "mon", opens: "09:00", closes: "17:00" },
			{ day: "wed", opens: "09:00", closes: "17:00" },
		]);
	});

	test("sortedHours orders by weekday then opening time", () => {
		expect(
			sortedHours([
				{ day: "tue", opens: "14:00", closes: "18:00" },
				{ day: "tue", opens: "08:00", closes: "12:00" },
				{ day: "mon", opens: "08:00", closes: "12:00" },
			]).map((r) => `${r.day}${r.opens}`),
		).toEqual(["mon08:00", "tue08:00", "tue14:00"]);
	});
});

describe("toLocationInput", () => {
	test("sends numeric gps, nulls for empty strings and sorted hours", () => {
		expect(
			toLocationInput({
				...valid,
				pickupFee: "",
				openingHours: [
					{ day: "tue", opens: "08:00", closes: "12:00" },
					{ day: "mon", opens: "08:00", closes: "12:00" },
				],
			}),
		).toMatchObject({
			gps: { lat: 4.05, lng: 9.7 },
			address: null,
			phone: null,
			pickupFee: 0,
			holdDays: 7,
			openingHours: [{ day: "mon" }, { day: "tue" }],
		});
	});
});
