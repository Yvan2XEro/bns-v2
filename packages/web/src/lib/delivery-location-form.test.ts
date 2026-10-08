import { describe, expect, test } from "bun:test";
import type { ShopLocation } from "../../../api/src/payload-types";
import {
	emptyHoursGrid,
	emptyLocationForm,
	gridToHours,
	hoursToGrid,
	type LocationFormValues,
	locationFormSchema,
	locationToForm,
	locationToInput,
	mapsUrl,
} from "./delivery-location-form";

const valid = (over: Partial<LocationFormValues> = {}): LocationFormValues => ({
	...emptyLocationForm("douala"),
	name: "Boutique Akwa",
	district: "douala.akwa",
	landmark: "Face à la pharmacie",
	lat: "4.05",
	lng: "9.7",
	...over,
});

const issues = (values: LocationFormValues) => {
	const parsed = locationFormSchema.safeParse(values);
	return parsed.success
		? []
		: parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

const weekdays = (grid = emptyHoursGrid()) =>
	grid.map((entry) =>
		["mon", "tue", "wed"].includes(entry.day)
			? { ...entry, open: true }
			: entry,
	);

const location = (over: Partial<ShopLocation> = {}): ShopLocation => ({
	id: "loc-1",
	shop: "shop-1",
	name: "Boutique Akwa",
	city: "douala",
	district: "douala.akwa",
	landmark: "Face à la pharmacie",
	gps: { lat: 4.05, lng: 9.7 },
	openingHours: [
		{ day: "mon", opens: "08:00", closes: "18:00" },
		{ day: "sat", opens: "09:00", closes: "13:00" },
	],
	pickupEnabled: true,
	pickupFee: 500,
	holdDays: 5,
	preparationHours: 2,
	isDispatchOrigin: true,
	isDefaultOrigin: true,
	active: true,
	updatedAt: "2026-10-01T00:00:00.000Z",
	createdAt: "2026-10-01T00:00:00.000Z",
	...over,
});

describe("the hours grid", () => {
	test("stored rows round-trip through the grid unchanged", () => {
		const rows = [
			{ day: "mon" as const, opens: "08:00", closes: "18:00" },
			{ day: "sat" as const, opens: "09:00", closes: "13:00" },
		];
		expect(gridToHours(hoursToGrid(rows))).toEqual(rows);
	});

	test("the grid always has seven days, closed ones carrying the default hours", () => {
		const grid = hoursToGrid([{ day: "wed", opens: "10:00", closes: "12:00" }]);
		expect(grid.map((entry) => entry.day)).toEqual([
			"mon",
			"tue",
			"wed",
			"thu",
			"fri",
			"sat",
			"sun",
		]);
		expect(grid.filter((entry) => entry.open).map((e) => e.day)).toEqual([
			"wed",
		]);
		expect(grid[0]).toEqual({
			day: "mon",
			open: false,
			opens: "08:00",
			closes: "18:00",
		});
	});

	test("a closed day is dropped from the serialised rows", () => {
		expect(gridToHours(emptyHoursGrid())).toEqual([]);
	});
});

describe("locationFormSchema", () => {
	test("a complete location is accepted", () => {
		expect(issues(valid())).toEqual([]);
	});

	test("the landmark needs 5 to 200 characters", () => {
		expect(issues(valid({ landmark: "abcd" }))).toEqual([
			["landmark", "landmarkLength"],
		]);
		expect(issues(valid({ landmark: "abcde" }))).toEqual([]);
	});

	test("coordinates are required and bounded", () => {
		expect(issues(valid({ lat: "" }))).toEqual([["lat", "coordinateInvalid"]]);
		expect(issues(valid({ lat: "91" }))).toEqual([
			["lat", "coordinateInvalid"],
		]);
		expect(issues(valid({ lng: "-181" }))).toEqual([
			["lng", "coordinateInvalid"],
		]);
		expect(issues(valid({ lat: "90", lng: "-180" }))).toEqual([]);
	});

	test("an open day must close after it opens", () => {
		const grid = weekdays().map((entry) =>
			entry.day === "tue"
				? { ...entry, opens: "18:00", closes: "18:00" }
				: entry,
		);
		expect(issues(valid({ openingHours: grid }))).toEqual([
			["openingHours", "hoursOrder"],
		]);
	});

	test("pickup needs at least one open day", () => {
		expect(issues(valid({ pickupEnabled: true }))).toEqual([
			["openingHours", "hoursRequired"],
		]);
		expect(
			issues(valid({ pickupEnabled: true, openingHours: weekdays() })),
		).toEqual([]);
	});

	test("the default origin must be an active dispatch origin", () => {
		expect(issues(valid({ isDefaultOrigin: true }))).toEqual([
			["isDefaultOrigin", "defaultNeedsOrigin"],
		]);
		expect(
			issues(
				valid({ isDefaultOrigin: true, isDispatchOrigin: true, active: false }),
			),
		).toEqual([["isDefaultOrigin", "defaultNeedsOrigin"]]);
		expect(
			issues(valid({ isDefaultOrigin: true, isDispatchOrigin: true })),
		).toEqual([]);
	});

	test("fee and hold bounds follow the service", () => {
		expect(issues(valid({ pickupFee: "5001" }))).toEqual([
			["pickupFee", "pickupFeeInvalid"],
		]);
		expect(issues(valid({ holdDays: "0" }))).toEqual([
			["holdDays", "holdDaysInvalid"],
		]);
		expect(issues(valid({ holdDays: "15" }))).toEqual([
			["holdDays", "holdDaysInvalid"],
		]);
		expect(issues(valid({ preparationHours: "73" }))).toEqual([
			["preparationHours", "preparationInvalid"],
		]);
	});
});

describe("location form round trip", () => {
	test("a stored location survives edit and save", () => {
		expect(locationToInput(locationToForm(location()))).toEqual({
			name: "Boutique Akwa",
			city: "douala",
			district: "douala.akwa",
			address: null,
			landmark: "Face à la pharmacie",
			gps: { lat: 4.05, lng: 9.7 },
			phone: null,
			openingHours: [
				{ day: "mon", opens: "08:00", closes: "18:00" },
				{ day: "sat", opens: "09:00", closes: "13:00" },
			],
			openingHoursNote: null,
			pickupEnabled: true,
			pickupFee: 500,
			holdDays: 5,
			preparationHours: 2,
			isDispatchOrigin: true,
			isDefaultOrigin: true,
			active: true,
		});
	});
});

describe("mapsUrl", () => {
	test("builds an external search link from a pin", () => {
		expect(mapsUrl("4.05", "9.7")).toBe(
			"https://www.google.com/maps/search/?api=1&query=4.05,9.7",
		);
	});

	test("is null while a coordinate is missing or not a number", () => {
		expect(mapsUrl("", "9.7")).toBeNull();
		expect(mapsUrl("4.05", "abc")).toBeNull();
	});
});
