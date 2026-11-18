import { describe, expect, test } from "bun:test";
import type { Listing } from "~/types";
import {
	BOOSTED_SLOTS,
	FRESH_COUNT,
	freshListingPaths,
	mixFreshListings,
} from "./fresh-listings-mix";

const listing = (id: string) => ({ id }) as Listing;
const ids = (listings: Listing[]) => listings.map((l) => l.id);

describe("mixFreshListings", () => {
	test("puts a few boosted listings first, then the newest, without repeats", () => {
		const boosted = ["b1", "b2", "b3", "b4"].map(listing);
		const recent = ["r1", "b2", "r2", "r3"].map(listing);
		const mixed = mixFreshListings(boosted, recent, () => 0);
		expect(ids(mixed)).toEqual(["b1", "b2", "b3", "r1", "r2", "r3"]);
	});

	test("draws the boosted slots from the whole pool", () => {
		const boosted = ["b1", "b2", "b3", "b4", "b5"].map(listing);
		const mixed = mixFreshListings(boosted, [], () => 0.99);
		expect(ids(mixed)).toEqual(["b5", "b4", "b3"]);
		expect(mixed).toHaveLength(BOOSTED_SLOTS);
	});

	test("caps the grid and works with no boosts", () => {
		const recent = Array.from({ length: 15 }, (_, i) => listing(`r${i}`));
		expect(mixFreshListings([], recent)).toHaveLength(FRESH_COUNT);
	});
});

describe("freshListingPaths", () => {
	test("scopes both reads to the city when there is one", () => {
		const paths = freshListingPaths("Douala");
		expect(paths.recent).toContain("location=Douala");
		expect(paths.boosted).toContain("boosted=true");
		expect(paths.boosted).toContain("location=Douala");
		expect(freshListingPaths(null).recent).not.toContain("location");
	});
});
