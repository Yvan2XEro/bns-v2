// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	__resetPopularPlacesCache,
	findPopularPlaces,
} from "../../src/services/popularPlaces";

function payloadWith(
	rows: Array<{
		_id: unknown;
		listings: number;
		lat: number | null;
		lng: number | null;
	}>,
) {
	const aggregate = vi.fn(() => ({ toArray: async () => rows }));
	return {
		aggregate,
		payload: {
			db: { collections: { listings: { collection: { aggregate } } } },
		},
	};
}

describe("findPopularPlaces", () => {
	beforeEach(() => {
		__resetPopularPlacesCache();
	});

	it("counts published listings only, busiest city first", async () => {
		const { payload, aggregate } = payloadWith([
			{ _id: "Douala", listings: 12, lat: 4, lng: 9.7 },
			{ _id: "Kribi", listings: 3, lat: null, lng: null },
		]);
		expect(await findPopularPlaces(payload)).toEqual([
			{ name: "Douala", listings: 12, lat: 4, lng: 9.7 },
			{ name: "Kribi", listings: 3, lat: null, lng: null },
		]);
		const [pipeline] = aggregate.mock.calls[0] as unknown as [
			Array<Record<string, unknown>>,
		];
		expect(pipeline[0]).toMatchObject({ $match: { status: "published" } });
	});

	it("merges the spellings older clients wrote into one city", async () => {
		const { payload } = payloadWith([
			{ _id: "Yaoundé", listings: 6, lat: 3.8, lng: 11.5 },
			{ _id: "Douala", listings: 5, lat: 4, lng: 10 },
			{ _id: "Douala II", listings: 3, lat: 4, lng: 9 },
			{ _id: "douala, Littoral", listings: 2, lat: null, lng: null },
			{ _id: null, listings: 40, lat: null, lng: null },
		]);
		const places = await findPopularPlaces(payload);
		expect(places.map((p) => [p.name, p.listings])).toEqual([
			["Douala", 10],
			["Yaoundé", 6],
		]);
		// Weighted by the listings that carry coordinates (5 at 10, 3 at 9).
		expect(places[0]?.lng).toBeCloseTo(9.625);
	});

	it("serves a repeat call from cache", async () => {
		const { payload, aggregate } = payloadWith([
			{ _id: "Douala", listings: 1, lat: null, lng: null },
		]);
		await findPopularPlaces(payload);
		await findPopularPlaces(payload);
		expect(aggregate).toHaveBeenCalledTimes(1);
	});
});
