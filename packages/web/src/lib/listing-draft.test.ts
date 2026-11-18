import { beforeEach, describe, expect, test } from "bun:test";
import {
	clearListingDraft,
	isListingDraftWorthKeeping,
	type ListingDraft,
	loadListingDraft,
	saveListingDraft,
} from "./listing-draft";

const store = new Map<string, string>();
const storage = () => ({
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => {
		store.set(k, v);
	},
	removeItem: (k: string) => {
		store.delete(k);
	},
});

const blank: ListingDraft = {
	categoryId: null,
	title: "",
	description: "",
	price: "",
	location: "Douala",
	duration: "30",
	attributeValues: {},
	tags: [],
};

describe("listing draft", () => {
	beforeEach(() => store.clear());

	test("a city alone is not a draft", () => {
		expect(isListingDraftWorthKeeping(blank)).toBe(false);
		expect(isListingDraftWorthKeeping({ ...blank, title: "Vélo" })).toBe(true);
	});

	test("round-trips, and an emptied form removes it", () => {
		saveListingDraft({ ...blank, title: "Vélo" }, storage);
		expect(loadListingDraft(storage)?.title).toBe("Vélo");
		saveListingDraft(blank, storage);
		expect(loadListingDraft(storage)).toBeNull();
		saveListingDraft({ ...blank, price: "5000" }, storage);
		clearListingDraft(storage);
		expect(loadListingDraft(storage)).toBeNull();
	});
});
