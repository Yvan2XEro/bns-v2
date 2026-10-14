import { describe, expect, test } from "bun:test";
import type { Place } from "../../../api/src/contracts/places";
import {
	EMPTY_PREFERENCES,
	homeLocationFromPlace,
	parsePreferences,
	reconcileWithProfile,
	withRecent,
} from "./place-preferences";

const douala: Place = {
	name: "Douala",
	region: "Littoral",
	countryCode: "CM",
	lat: 4.05,
	lng: 9.7,
	source: "search",
};

describe("parsePreferences", () => {
	test("reads back what was stored", () => {
		const stored = JSON.stringify({
			place: douala,
			placeUpdatedAt: "2026-10-01T00:00:00.000Z",
			browseAll: false,
			recents: [douala, { name: "" }, 42],
		});
		expect(parsePreferences(stored)).toEqual({
			place: douala,
			placeUpdatedAt: "2026-10-01T00:00:00.000Z",
			browseAll: false,
			recents: [douala],
		});
	});

	test("cannot scope browsing to a city it does not know", () => {
		expect(
			parsePreferences(JSON.stringify({ browseAll: false })).browseAll,
		).toBe(true);
	});

	test("treats garbage as nothing remembered", () => {
		expect(parsePreferences("{not json")).toEqual(EMPTY_PREFERENCES);
		expect(parsePreferences(null)).toEqual(EMPTY_PREFERENCES);
	});
});

describe("withRecent", () => {
	test("moves a re-picked place to the front without duplicating it", () => {
		const kribi: Place = { name: "Kribi", region: "Sud", source: "search" };
		const recents = withRecent(
			withRecent(withRecent([], douala), kribi),
			douala,
		);
		expect(recents.map((p) => p.name)).toEqual(["Douala", "Kribi"]);
		expect(recents[0]?.source).toBe("recent");
	});
});

describe("profile mirror", () => {
	test("never sends coordinates to the profile", () => {
		expect(homeLocationFromPlace(douala, "2026-10-01T00:00:00.000Z")).toEqual({
			city: "Douala",
			region: "Littoral",
			country: null,
			countryCode: "CM",
			source: "manual",
			updatedAt: "2026-10-01T00:00:00.000Z",
		});
	});

	test("adopts the profile's place on a fresh browser", () => {
		expect(
			reconcileWithProfile(
				{ place: null, placeUpdatedAt: null },
				{ city: "Yaoundé", updatedAt: "2026-09-01T00:00:00.000Z" },
			),
		).toBe("adopt");
	});

	test("pushes this browser's place when it is newer", () => {
		expect(
			reconcileWithProfile(
				{ place: douala, placeUpdatedAt: "2026-10-02T00:00:00.000Z" },
				{ city: "Yaoundé", updatedAt: "2026-09-01T00:00:00.000Z" },
			),
		).toBe("push");
	});

	test("leaves an identical place alone", () => {
		expect(
			reconcileWithProfile(
				{ place: douala, placeUpdatedAt: "2026-09-01T00:00:00.000Z" },
				{
					city: "Douala",
					region: "Littoral",
					countryCode: "CM",
					updatedAt: "2026-10-01T00:00:00.000Z",
				},
			),
		).toBe("none");
	});
});
